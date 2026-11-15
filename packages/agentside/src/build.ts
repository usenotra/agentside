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
        const converted = htmlToMarkdown(html, options);
        const markdown = options.normalize ? normalizeUnicode(converted) : converted;
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

function sectionTitle(segment: string) {
  return segment.replace(/[-_]+/g, " ").replace(/^\w/, (letter) => letter.toUpperCase());
}

export function llmsTxt(
  pages: readonly PrerenderedPage[],
  options: {
    readonly title: string;
    readonly description?: string | undefined;
    readonly siteUrl?: string | undefined;
    readonly sections?: Readonly<Record<string, string>> | undefined;
  }
) {
  const url = (path: string) => `${options.siteUrl ?? ""}${toMarkdownPath(path)}`;
  const prefixes = Object.keys(options.sections ?? {}).sort((left, right) => right.length - left.length);
  const groups = new Map<string, PrerenderedPage[]>();
  for (const page of pages) {
    const prefix = prefixes.find((candidate) => page.path === candidate || page.path.startsWith(`${candidate.replace(/\/$/, "")}/`));
    const segment = page.path.split("/")[1] ?? "";
    const isLeaf = page.path.split("/").length <= 2 && !pages.some((other) => other.path.startsWith(`${page.path}/`));
    const title = prefix ? (options.sections?.[prefix] ?? "Pages") : isLeaf || !segment ? "Pages" : sectionTitle(segment);
    groups.set(title, [...(groups.get(title) ?? []), page]);
  }
  const ordered = [...groups.entries()].sort(([left], [right]) => (left === "Pages" ? -1 : right === "Pages" ? 1 : 0));
  return [
    `# ${options.title}`,
    ...(options.description ? ["", `> ${options.description}`] : []),
    ...ordered.flatMap(([title, items]) => [
      "",
      `## ${title}`,
      "",
      ...items.map((page) => `- [${page.title || page.path}](${url(page.path)})${page.description ? `: ${page.description}` : ""}`),
    ]),
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
  const markdownHeaders = {
    "Content-Type": "text/markdown; charset=utf-8",
    Vary: "Accept, User-Agent",
    "X-Robots-Tag": "noindex",
  };
  const nested = paths?.filter((path) => path !== "/").map((path) => path.slice(1).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const pagePattern = nested ? `(${nested.join("|")})` : "((?!.*\\.).*[^/])";
  const routes = [
    { src: "^/(.+)\\.md$", headers: markdownHeaders, continue: true },
    ...(!paths || paths.includes("/")
      ? [
          {
            src: "^/$",
            headers: { Vary: "Accept, User-Agent", Link: '</index.md>; rel="alternate"; type="text/markdown"' },
            continue: true,
          },
        ]
      : []),
    ...(!nested || nested.length > 0
      ? [
          {
            src: `^/${pagePattern}/?$`,
            headers: { Vary: "Accept, User-Agent", Link: '</$1.md>; rel="alternate"; type="text/markdown"' },
            continue: true,
          },
        ]
      : []),
    ...conditions.flatMap((condition) => [
      ...(!paths || paths.includes("/")
        ? [{ src: "^/$", has: [condition], dest: "/index.md", headers: markdownHeaders }]
        : []),
      ...(!nested || nested.length > 0
        ? [{ src: `^/${pagePattern}/?$`, has: [condition], dest: "/$1.md", headers: markdownHeaders }]
        : []),
    ]),
  ];
  return { routes };
}

export async function applyVercelBuildOutput(options: { readonly outputDir?: string; readonly paths?: readonly string[] } = {}) {
  const file = join(options.outputDir ?? ".vercel/output", "config.json");
  const config = JSON.parse(await readFile(file, "utf8")) as { routes?: Record<string, unknown>[] };
  const existing = config.routes ?? [];
  const filesystem = existing.findIndex((route) => route["handle"] === "filesystem");
  const { routes } = vercelRoutes(options.paths);
  const insertAt = filesystem === -1 ? 0 : filesystem;
  config.routes = [...existing.slice(0, insertAt), ...routes, ...existing.slice(insertAt)];
  await writeFile(file, `${JSON.stringify(config, null, 2)}\n`);
}
