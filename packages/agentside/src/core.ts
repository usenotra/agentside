import { Cache, Context, Effect, Equal, Exit, Hash, Layer, Schedule } from "effect";
import { FetchHttpClient, HttpClient } from "effect/http";

import { InvalidConfig, NotFound, RemoteFailed, RenderFailed, SourceTimeout, type ServeError } from "./errors.js";
import { estimateTokens, normalizeUnicode } from "./text.js";
import type { Agent, AgentsideConfig, LocalSource, RemoteSource, RenderContext, Source, Variant } from "./types.js";

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
  readonly tokens: number;
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

interface Rendered {
  readonly body: string;
  readonly tokens: number;
  readonly renderedAt: number;
}

export interface Interface {
  readonly match: (path: string) => Match | null;
  readonly serve: (path: string, request: Request, agent: Agent | null) => Effect.Effect<Served, ServeError>;
}

export class Agentside extends Context.Service<Agentside, Interface>()("@usenotra/agentside/Agentside") {}

const compileRoutes = Effect.fn("Agentside.compileRoutes")(function* (routes: AgentsideConfig["routes"]) {
  const exact = new Map<string, Source>();
  const params: ParamRoute[] = [];
  for (const [pattern, source] of Object.entries(routes)) {
    if (!pattern.startsWith("/")) return yield* new InvalidConfig({ message: `route "${pattern}" must start with "/"` });
    if (pattern.includes("[")) params.push(compileParamRoute(pattern, source));
    else exact.set(pattern.length > 1 ? pattern.replace(/\/+$/, "") : pattern, source);
  }
  return { exact, params };
});

export const make = Effect.fn("Agentside.make")(function* (config: AgentsideConfig) {
  const { exact, params } = yield* compileRoutes(config.routes);
  const timeoutMs = config.timeoutMs ?? 5000;
  const variants = config.variants ?? {};
  const http = (yield* HttpClient.HttpClient).pipe(
    HttpClient.retryTransient({
      times: config.retries ?? 2,
      schedule: Schedule.exponential("100 millis").pipe(Schedule.jittered),
    })
  );

  const renderLocal = Effect.fnUntraced(function* (source: LocalSource, context: RenderContext) {
    return yield* Effect.tryPromise({
      try: async () => source(context),
      catch: (cause) => new RenderFailed({ path: context.path, cause }),
    });
  });

  const fetchRemote = Effect.fn("Agentside.fetchRemote")(function* (source: RemoteSource, context: RenderContext) {
    const url = typeof source.url === "string" ? source.url : source.url(context);
    const remoteFailed = (cause: unknown) => new RemoteFailed({ path: context.path, url, cause });
    const response = yield* http
      .get(url, { headers: { accept: "text/markdown, text/plain;q=0.9", ...source.headers } })
      .pipe(Effect.mapError(remoteFailed));
    if (response.status === 404) return null;
    if (response.status < 200 || response.status >= 300) {
      return yield* new RemoteFailed({ path: context.path, url, status: response.status });
    }
    return yield* response.text.pipe(Effect.mapError(remoteFailed));
  });

  const loadSource = Effect.fnUntraced(
    function* (source: Source, context: RenderContext) {
      if (typeof source === "string") return source;
      const body = typeof source === "function" ? yield* renderLocal(source, context) : yield* fetchRemote(source, context);
      return body ?? null;
    },
    (effect, _source, context) =>
      Effect.timeoutOrElse(effect, {
        duration: timeoutMs,
        orElse: () => Effect.fail(new SourceTimeout({ path: context.path, timeoutMs })),
      })
  );

  const render = Effect.fnUntraced(function* (key: Key) {
    const raw = yield* loadSource(key.source, key.context);
    if (raw === null) return yield* new NotFound({ path: key.path });
    const body = config.normalize === false ? raw : normalizeUnicode(raw);
    return { body, tokens: estimateTokens(body), renderedAt: performance.now() } satisfies Rendered;
  });

  const ttl = config.cache === false ? 0 : (config.cache?.ttlMs ?? 300_000);
  const cache =
    config.cache === false
      ? null
      : yield* Cache.makeWith(render, {
          capacity: config.cache?.capacity ?? 1000,
          timeToLive: (exit) => (Exit.isSuccess(exit) ? ttl : 0),
        });

  const load = (key: Key) => {
    const started = performance.now();
    return Effect.map(cache ? Cache.get(cache, key) : render(key), ({ body, tokens, renderedAt }) => ({
      body,
      tokens,
      cached: renderedAt < started,
    }));
  };

  const match = (path: string): Match | null => {
    const source = exact.get(path);
    if (source !== undefined) return { pattern: path, params: {}, source };
    for (const route of params) {
      const result = route.regex.exec(path);
      if (!result) continue;
      const values: Record<string, string> = {};
      try {
        route.keys.forEach((key, index) => {
          values[key] = decodeURIComponent(result[index + 1] ?? "");
        });
      } catch {
        return null;
      }
      return { pattern: route.pattern, params: values, source: route.source };
    }
    return null;
  };

  const serve = Effect.fnUntraced(function* (path: string, request: Request, agent: Agent | null) {
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
      Effect.catch((error) => Effect.andThen(Effect.sync(() => config.onError?.(error, path)), control))
    );
  });

  return Agentside.of({ match, serve });
});

export const layer = (config: AgentsideConfig) => Layer.effect(Agentside, make(config));

export const layerFetch = (config: AgentsideConfig) => layer(config).pipe(Layer.provide(FetchHttpClient.layer));

export function markdownResponse(
  body: string,
  config: AgentsideConfig,
  status = 200,
  extra?: Record<string, string>,
  tokens = estimateTokens(body)
) {
  const headers = new Headers({
    "Content-Type": "text/markdown; charset=utf-8",
    "X-Content-Type-Options": "nosniff",
    "X-Markdown-Tokens": String(tokens),
    Vary: "Accept, User-Agent",
    "Cache-Control": config.cacheControl ?? "public, max-age=3600",
    ...extra,
  });
  if (config.noindex !== false) headers.set("X-Robots-Tag", "noindex");
  return new Response(body, { status, headers });
}
