import { join } from "node:path";
import { readFile, writeFile } from "node:fs/promises";

import { Effect, Schema } from "effect";

import { KNOWN_AGENTS } from "./agents.js";
import { FileFailed, InvalidConfig } from "./errors.js";

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
    {
      has: [{ type: "header", key: "accept", value: ".*text/markdown.*" }],
      missing: [{ type: "header", key: "accept", value: "^.*text/markdown\\s*;[^,]*q\\s*=\\s*0(\\.0*)?\\s*([,;].*)?$" }],
    },
    { has: [{ type: "header", key: "user-agent", value: `.*(${agentTokens.map(escapeRegex).join("|")}).*` }] },
  ] as const;
  // noindex only on .md URLs: on the page URL the twin is the page itself for AI search crawlers, and a crawler
  // that honors the header could drop the page from its index.
  const markdownHeaders = {
    "Content-Type": "text/markdown; charset=utf-8",
    Vary: "Accept, User-Agent",
  };
  const markdownUrlHeaders = { ...markdownHeaders, "X-Robots-Tag": "noindex" };
  const nested = paths?.filter((path) => path !== "/").map((path) => path.slice(1).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const pagePattern = nested ? `(${nested.join("|")})` : "((?!.*\\.).*[^/])";
  const routes = [
    { src: "^/(.+)\\.md$", headers: markdownUrlHeaders, continue: true },
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
        ? [{ src: "^/$", ...condition, dest: "/index.md", headers: markdownHeaders }]
        : []),
      ...(!nested || nested.length > 0
        ? [{ src: `^/${pagePattern}/?$`, ...condition, dest: "/$1.md", headers: markdownHeaders }]
        : []),
    ]),
  ];
  return { routes };
}

const Route = Schema.Record(Schema.String, Schema.Unknown);
const BuildOutputConfig = Schema.fromJsonString(
  Schema.StructWithRest(Schema.Struct({ routes: Schema.optional(Schema.Array(Route)) }), [Route])
);

export const applyVercelBuildOutput = Effect.fn("Agentside.applyVercelBuildOutput")(function* (
  options: { readonly outputDir?: string; readonly paths?: readonly string[] } = {}
) {
  const file = join(options.outputDir ?? ".vercel/output", "config.json");
  const text = yield* Effect.tryPromise({
    try: () => readFile(file, "utf8"),
    catch: (cause) => new FileFailed({ path: file, operation: "read", cause }),
  });
  const config = yield* Schema.decodeUnknownEffect(BuildOutputConfig)(text).pipe(
    Effect.mapError((issue) => new InvalidConfig({ message: `${file} is not a valid Build Output config: ${issue.message}` }))
  );
  const existing = config.routes ?? [];
  const filesystem = existing.findIndex((route) => route["handle"] === "filesystem");
  const insertAt = filesystem === -1 ? 0 : filesystem;
  const routes = [...existing.slice(0, insertAt), ...vercelRoutes(options.paths).routes, ...existing.slice(insertAt)];
  yield* Effect.tryPromise({
    try: () => writeFile(file, `${JSON.stringify({ ...config, routes }, null, 2)}\n`),
    catch: (cause) => new FileFailed({ path: file, operation: "write", cause }),
  });
});
