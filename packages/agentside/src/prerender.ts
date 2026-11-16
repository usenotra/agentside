import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, sep } from "node:path";

import { Effect, Result } from "effect";

import { make } from "./core.js";
import { FileFailed, PrerenderFailed, RenderFailed } from "./errors.js";
import { htmlToMarkdown, readMeta } from "./html.js";
import { llmsFullTxt, llmsTxt } from "./llms.js";
import { normalizeUnicode, toMarkdownPath } from "./text.js";
import type { AgentsideConfig, PrerenderedPage, PrerenderHtmlOptions, PrerenderOptions, PrerenderResult } from "./types.js";

const CONCURRENCY = 16;

const readText = Effect.fn("Agentside.readFile")(function* (path: string) {
  return yield* Effect.tryPromise({
    try: () => readFile(path, "utf8"),
    catch: (cause) => new FileFailed({ path, operation: "read", cause }),
  });
});

const writeText = Effect.fn("Agentside.writeFile")(function* (path: string, content: string) {
  yield* Effect.tryPromise({
    try: async () => {
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, content);
    },
    catch: (cause) => new FileFailed({ path, operation: "write", cause }),
  });
});

const listHtml = Effect.fn("Agentside.listHtml")(function* (dir: string) {
  const files = yield* Effect.tryPromise({
    try: () => readdir(dir, { recursive: true }),
    catch: (cause) => new FileFailed({ path: dir, operation: "list", cause }),
  });
  return files.filter((file) => file.endsWith(".html") && !/(^|[\\/])(404|500)\.html$/.test(file));
});

export function describeError(error: { readonly _tag: string; readonly message?: string; readonly path?: string; readonly cause?: unknown }) {
  const cause = error.cause instanceof Error ? error.cause.message : error.cause === undefined ? "" : String(error.cause);
  const details = [error.message, error.path, cause].filter(Boolean).join(", ");
  return details ? `${error._tag} (${details})` : error._tag;
}

function failOnErrors<A, E extends { readonly _tag: string; readonly message?: string; readonly path?: string; readonly cause?: unknown }>(
  results: readonly { readonly path: string; readonly result: Result.Result<A, E> }[]
) {
  const failures = results.flatMap(({ path, result }) => (Result.isFailure(result) ? [{ path, reason: describeError(result.failure) }] : []));
  return failures.length > 0 ? Effect.fail(new PrerenderFailed({ failures })) : Effect.void;
}

function pagePath(file: string) {
  const path = `/${file.split(sep).join("/")}`.replace(/\/index\.html$/, "").replace(/\.html$/, "");
  return path === "" ? "/" : path;
}

function isExcluded(path: string, exclude: readonly string[]) {
  return exclude.some((prefix) => path === prefix || path.startsWith(prefix.endsWith("/") ? prefix : `${prefix}/`));
}

export const prerender = Effect.fn("Agentside.prerender")(function* (config: AgentsideConfig, options: PrerenderOptions) {
  const service = yield* make({ ...config, cache: false });
  const paths = options.paths ?? Object.keys(config.routes).filter((pattern) => !pattern.includes("["));
  const siteUrl = options.siteUrl ?? "http://localhost";

  const results = yield* Effect.forEach(
    paths,
    (path) =>
      service.serve(path, new Request(`${siteUrl}${path}`), null).pipe(
        Effect.flatMap((served) => {
          const file = join(options.outDir, toMarkdownPath(path));
          return writeText(file, served.body).pipe(Effect.as({ written: file }));
        }),
        Effect.catchTag("NotFound", () => Effect.succeed({ skipped: path })),
        Effect.result,
        Effect.map((result) => ({ path, result }))
      ),
    { concurrency: CONCURRENCY }
  );

  yield* failOnErrors(results);
  const outcomes = results.flatMap(({ result }) => (Result.isSuccess(result) ? [result.success] : []));
  return {
    written: outcomes.flatMap((outcome) => ("written" in outcome ? [outcome.written] : [])),
    skipped: outcomes.flatMap((outcome) => ("skipped" in outcome ? [outcome.skipped] : [])),
  } satisfies PrerenderResult;
});

export const prerenderHtml = Effect.fn("Agentside.prerenderHtml")(function* (options: PrerenderHtmlOptions) {
  const outDir = options.outDir ?? options.dir;
  const exclude = options.exclude ?? [];
  const files = (yield* listHtml(options.dir)).filter((file) => !isExcluded(pagePath(file), exclude));

  const convert = Effect.fn("Agentside.convertPage")(function* (file: string) {
    const path = pagePath(file);
    const html = yield* readText(join(options.dir, file));
    const converted = yield* Effect.try({
      try: () => htmlToMarkdown(html, options),
      catch: (cause) => new RenderFailed({ path, cause }),
    });
    const markdown = options.normalize ? normalizeUnicode(converted) : converted;
    yield* writeText(join(outDir, toMarkdownPath(path)), markdown);
    return { path, ...readMeta(html), markdown } satisfies PrerenderedPage;
  });

  const results = yield* Effect.forEach(
    files,
    (file) => convert(file).pipe(Effect.result, Effect.map((result) => ({ path: pagePath(file), result }))),
    { concurrency: CONCURRENCY }
  );
  yield* failOnErrors(results);

  const rank = new Map((options.llms ? (options.llms.order ?? []) : []).map((path, index) => [path, index]));
  const pages = results
    .flatMap(({ result }) => (Result.isSuccess(result) ? [result.success] : []))
    .sort(
      (left, right) =>
        (rank.get(left.path) ?? Infinity) - (rank.get(right.path) ?? Infinity) || left.path.localeCompare(right.path)
    );

  if (options.llms) {
    yield* writeText(join(outDir, "llms.txt"), llmsTxt(pages, { ...options.llms, siteUrl: options.siteUrl }));
    yield* writeText(join(outDir, "llms-full.txt"), llmsFullTxt(pages, { siteUrl: options.siteUrl }));
  }
  return pages;
});
