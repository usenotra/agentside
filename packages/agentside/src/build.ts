import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, sep } from "node:path";

import { Effect, Exit } from "effect";

import { KNOWN_AGENTS } from "./agents.js";
import { make } from "./core.js";
import { htmlToMarkdown, readMeta } from "./html.js";
import { normalizeUnicode, toMarkdownPath } from "./text.js";
import type { AgentsideConfig, PrerenderedPage, PrerenderHtmlOptions } from "./types.js";

export { htmlToMarkdown } from "./html.js";

export interface PrerenderOptions {
  readonly outDir: string;
  readonly paths?: readonly string[];
  readonly siteUrl?: string;
}

export interface PrerenderResult {
  readonly written: readonly string[];
  readonly skipped: readonly string[];
}

export async function prerender(config: AgentsideConfig, options: PrerenderOptions): Promise<PrerenderResult> {
  const server = Effect.runSync(make({ ...config, cache: false }));
  const paths = options.paths ?? Object.keys(config.routes).filter((pattern) => !pattern.includes("["));
  const siteUrl = options.siteUrl ?? "http://localhost";
  const written: string[] = [];
  const skipped: string[] = [];
  const failures: string[] = [];

  await Promise.all(
    paths.map(async (path) => {
      const exit = await Effect.runPromiseExit(server.serve(path, new Request(`${siteUrl}${path}`), null));
      if (Exit.isFailure(exit)) {
        const error = exit.cause.reasons.find((reason) => reason._tag === "Fail")?.error;
        if (error?._tag === "NotFound") skipped.push(path);
        else failures.push(`${path}: ${error?._tag ?? "Defect"}`);
        return;
      }
      const file = join(options.outDir, toMarkdownPath(path));
      await mkdir(dirname(file), { recursive: true });
      await writeFile(file, exit.value.body);
      written.push(file);
    })
  );

  if (failures.length > 0) {
    throw new Error(`agentside: ${failures.length} twin(s) failed to prerender\n${failures.join("\n")}`);
  }
  return { written, skipped };
}

function pagePath(file: string) {
  const path = `/${file.split(sep).join("/")}`.replace(/\/index\.html$/, "").replace(/\.html$/, "");
  return path === "" ? "/" : path;
}

function isExcluded(path: string, exclude: readonly string[]) {
  return exclude.some((prefix) => path === prefix || path.startsWith(prefix.endsWith("/") ? prefix : `${prefix}/`));
}

export async function prerenderHtml(options: PrerenderHtmlOptions): Promise<PrerenderedPage[]> {
  const outDir = options.outDir ?? options.dir;
  const exclude = options.exclude ?? [];
  const files = (await readdir(options.dir, { recursive: true }))
    .filter((file) => file.endsWith(".html"))
    .filter((file) => !/(^|[\\/])(404|500)\.html$/.test(file));
  const pages: PrerenderedPage[] = [];
  const failures: string[] = [];

  await Promise.all(
    files.map(async (file) => {
      const path = pagePath(file);
      if (isExcluded(path, exclude)) return;
      try {
        const html = await readFile(join(options.dir, file), "utf8");
        const markdown = normalizeUnicode(htmlToMarkdown(html, options));
        const target = join(outDir, toMarkdownPath(path));
        await mkdir(dirname(target), { recursive: true });
        await writeFile(target, markdown);
        pages.push({ path, ...readMeta(html), markdown });
      } catch (error) {
        failures.push(`${path}: ${error instanceof Error ? error.message : String(error)}`);
      }
    })
  );

  if (failures.length > 0) {
    throw new Error(`agentside: ${failures.length} page(s) failed to convert\n${failures.join("\n")}`);
  }

  pages.sort((left, right) => left.path.localeCompare(right.path));
  if (options.llms) {
    await writeFile(join(outDir, "llms.txt"), llmsTxt(pages, { ...options.llms, siteUrl: options.siteUrl }));
    await writeFile(join(outDir, "llms-full.txt"), llmsFullTxt(pages));
  }
  return pages;
}

export function llmsTxt(
  pages: readonly PrerenderedPage[],
  options: { readonly title: string; readonly description?: string | undefined; readonly siteUrl?: string | undefined }
) {
  const url = (path: string) => `${options.siteUrl ?? ""}${toMarkdownPath(path)}`;
  return [
    `# ${options.title}`,
    ...(options.description ? ["", `> ${options.description}`] : []),
    "",
    "## Pages",
    "",
    ...pages.map((page) => `- [${page.title || page.path}](${url(page.path)})${page.description ? `: ${page.description}` : ""}`),
    "",
  ].join("\n");
}

export function llmsFullTxt(pages: readonly PrerenderedPage[]) {
  return `${pages.map((page) => page.markdown.trim()).join("\n\n---\n\n")}\n`;
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\:]/g, "\\$&");
}

export function vercelRoutes(paths?: readonly string[]) {
  const agentTokens = [
    ...new Set(
      KNOWN_AGENTS.filter((agent) => agent.name !== "Google-Extended").flatMap((agent) => [
        agent.name,
        agent.name.toLowerCase(),
      ])
    ),
  ];
  const conditions = [
    { type: "header", key: "accept", value: ".*text/markdown.*" },
    { type: "header", key: "user-agent", value: `.*(${agentTokens.map(escapeRegex).join("|")}).*` },
  ] as const;
  const nested = paths?.filter((path) => path !== "/").map((path) => escapeRegex(path.slice(1)));
  const rewrites = conditions.flatMap((condition) => [
    ...(!paths || paths.includes("/") ? [{ source: "/", has: [condition], destination: "/index.md" }] : []),
    ...(!nested
      ? [{ source: "/((?!.*\\.)[^?]*[^/])/?", has: [condition], destination: "/$1.md" }]
      : nested.length > 0
        ? [{ source: `/:path(${nested.join("|")})`, has: [condition], destination: "/:path.md" }]
        : []),
  ]);
  const headers = [
    {
      source: "/(.*)\\.md",
      headers: [
        { key: "Content-Type", value: "text/markdown; charset=utf-8" },
        { key: "Vary", value: "Accept, User-Agent" },
        { key: "X-Robots-Tag", value: "noindex" },
      ],
    },
  ];
  return { rewrites, headers };
}
