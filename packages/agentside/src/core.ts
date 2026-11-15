import { Cache, Effect, Equal, Exit, Hash, Schedule } from "effect";

import { NotFound, RemoteFailed, RenderFailed, SourceTimeout, type ServeError } from "./errors.js";
import { estimateTokens, normalizeUnicode } from "./text.js";
import type { Agent, AgentsideConfig, RenderContext, Source, Variant } from "./types.js";

export const CONTROL = "control";

interface ParamRoute {
  readonly pattern: string;
  readonly regex: RegExp;
  readonly keys: readonly string[];
  readonly source: Source;
}

export interface Match {
  readonly pattern: string;
  readonly params: Record<string, string>;
  readonly source: Source;
}

export interface Served {
  readonly body: string;
  readonly variant: string;
  readonly cached: boolean;
}

class Key implements Equal.Equal {
  constructor(
    readonly path: string,
    readonly variant: string,
    readonly source: Source,
    readonly context: RenderContext
  ) {}
  [Equal.symbol](that: unknown) {
    return that instanceof Key && that.path === this.path && that.variant === this.variant;
  }
  [Hash.symbol]() {
    return Hash.string(`${this.variant}\0${this.path}`);
  }
}

function compileParamRoute(pattern: string, source: Source): ParamRoute {
  const keys: string[] = [];
  const body = pattern
    .split("/")
    .map((segment) => {
      const param = /^\[(\.\.\.)?([^\]]+)\]$/.exec(segment);
      if (!param) return segment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      keys.push(param[2] ?? "");
      return param[1] ? "(.+)" : "([^/]+)";
    })
    .join("/");
  return { pattern, regex: new RegExp(`^${body}$`), keys, source };
}

function matchesAgent(variant: Variant, agent: Agent | null) {
  if (!agent) return false;
  return (
    (variant.agents?.some((name) => name.toLowerCase() === agent.name.toLowerCase()) ?? false) ||
    (variant.vendors?.some((vendor) => vendor.toLowerCase() === agent.vendor.toLowerCase()) ?? false) ||
    (variant.purposes?.includes(agent.purpose) ?? false)
  );
}

const loadSource = (source: Source, context: RenderContext, timeoutMs: number, retries: number) => {
  const { path } = context;
  if (typeof source === "string") return Effect.succeed<string | null>(source);

  const load: Effect.Effect<string | null | undefined, ServeError> =
    typeof source === "function"
      ? Effect.tryPromise({
          try: async () => source(context),
          catch: (cause) => new RenderFailed({ path, cause }),
        })
      : Effect.gen(function* () {
          const url = typeof source.url === "string" ? source.url : source.url(context);
          const response = yield* Effect.tryPromise({
            try: (signal) => fetch(url, { headers: { accept: "text/markdown, text/plain;q=0.9", ...source.headers }, signal }),
            catch: (cause) => new RemoteFailed({ path, url, cause }),
          });
          if (response.status === 404) return null;
          if (!response.ok) return yield* new RemoteFailed({ path, url, status: response.status });
          return yield* Effect.tryPromise({
            try: () => response.text(),
            catch: (cause) => new RemoteFailed({ path, url, cause }),
          });
        }).pipe(
          Effect.retry({
            times: retries,
            schedule: Schedule.exponential("100 millis"),
            while: (error) => error._tag === "RemoteFailed" && (error.status === undefined || error.status >= 500),
          })
        );

  return load.pipe(
    Effect.map((body) => body ?? null),
    Effect.timeoutOrElse({ duration: timeoutMs, orElse: () => Effect.fail(new SourceTimeout({ path, timeoutMs })) })
  );
};

export const make = Effect.fnUntraced(function* (config: AgentsideConfig) {
  const exact = new Map<string, Source>();
  const params: ParamRoute[] = [];
  for (const [pattern, source] of Object.entries(config.routes)) {
    if (!pattern.startsWith("/")) throw new Error(`agentside: route "${pattern}" must start with "/"`);
    if (pattern.includes("[")) params.push(compileParamRoute(pattern, source));
    else exact.set(pattern.length > 1 ? pattern.replace(/\/+$/, "") : pattern, source);
  }

  const timeoutMs = config.timeoutMs ?? 5000;
  const retries = config.retries ?? 2;
  const variants = config.variants ?? {};

  const render = (key: Key) =>
    loadSource(key.source, key.context, timeoutMs, retries).pipe(
      Effect.flatMap((body) => (body === null ? Effect.fail(new NotFound({ path: key.path })) : Effect.succeed(body))),
      Effect.map((body) => (config.normalize === false ? body : normalizeUnicode(body)))
    );

  const cache =
    config.cache === false
      ? null
      : yield* Cache.makeWith(render, {
          capacity: config.cache?.capacity ?? 1000,
          timeToLive: (exit) => (Exit.isSuccess(exit) ? (config.cache ? (config.cache.ttlMs ?? 300_000) : 300_000) : 0),
        });

  const load = (key: Key) =>
    cache
      ? Effect.flatMap(Cache.has(cache, key), (cached) =>
          Effect.map(Cache.get(cache, key), (body) => ({ body, cached }))
        )
      : Effect.map(render(key), (body) => ({ body, cached: false }));

  const match = (path: string): Match | null => {
    const source = exact.get(path);
    if (source !== undefined) return { pattern: path, params: {}, source };
    for (const route of params) {
      const result = route.regex.exec(path);
      if (!result) continue;
      const values: Record<string, string> = {};
      route.keys.forEach((key, index) => {
        values[key] = decodeURIComponent(result[index + 1] ?? "");
      });
      return { pattern: route.pattern, params: values, source: route.source };
    }
    return null;
  };

  const serve = (path: string, request: Request, agent: Agent | null) =>
    Effect.gen(function* () {
      const found = match(path);
      if (!found) return yield* new NotFound({ path });
      const context: RenderContext = { path, params: found.params, request, agent };
      const variant = variants[found.pattern]?.find((candidate) => matchesAgent(candidate, agent));

      const control = load(new Key(path, CONTROL, found.source, context)).pipe(
        Effect.map((result): Served => ({ ...result, variant: CONTROL }))
      );
      if (!variant) return yield* control;

      return yield* load(new Key(path, variant.id, variant.source, context)).pipe(
        Effect.map((result): Served => ({ ...result, variant: variant.id })),
        Effect.catch((error) => {
          config.onError?.(error, path);
          return control;
        })
      );
    });

  return { match, serve };
});

export function markdownResponse(body: string, config: AgentsideConfig, status = 200, extra?: Record<string, string>) {
  const headers = new Headers({
    "Content-Type": "text/markdown; charset=utf-8",
    "X-Content-Type-Options": "nosniff",
    "X-Markdown-Tokens": String(estimateTokens(body)),
    Vary: "Accept, User-Agent",
    "Cache-Control": config.cacheControl ?? "public, max-age=3600",
    ...extra,
  });
  if (config.noindex !== false) headers.set("X-Robots-Tag", "noindex");
  return new Response(body, { status, headers });
}
