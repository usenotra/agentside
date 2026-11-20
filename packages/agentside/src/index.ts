import { Effect } from "effect";
import { FetchHttpClient } from "effect/http";

import { detectAgent } from "./agents.js";
import { make, markdownResponse } from "./core.js";
import { negotiateFormat } from "./negotiate.js";
import { toMarkdownPath, toPagePath } from "./text.js";
import type { Agent, AgentsideConfig, RemoteSource, RenderContext } from "./types.js";

export { detectAgent, KNOWN_AGENTS } from "./agents.js";
export { InvalidConfig, NotFound, PrerenderFailed, RemoteFailed, RenderFailed, SourceTimeout, FileFailed, type ServeError } from "./errors.js";
export { negotiateFormat } from "./negotiate.js";
export { estimateTokens, normalizeUnicode, toMarkdownPath } from "./text.js";
export type * from "./types.js";

const SERVABLE_METHODS = new Set(["GET", "HEAD"]);
const ACCEPTS_HTML = /(^|,)\s*(\*\/\*|text\/html)/i;

function requestHtml(request: Request) {
  if (ACCEPTS_HTML.test(request.headers.get("accept") ?? "*/*")) return;
  try {
    request.headers.set("accept", "text/html");
  } catch {}
}

export function remote(
  url: string | ((context: RenderContext) => string),
  options: { headers?: Record<string, string> } = {}
): RemoteSource {
  return options.headers ? { _tag: "remote", url, headers: options.headers } : { _tag: "remote", url };
}

function setHeaders(response: Response, headers: Record<string, string>) {
  try {
    for (const [name, value] of Object.entries(headers)) {
      const existing = response.headers.get(name);
      if (name === "Vary" && existing) {
        const tokens = existing.toLowerCase().split(",").map((token) => token.trim());
        const missing = value.split(", ").filter((token) => !tokens.includes(token.toLowerCase()));
        if (missing.length > 0) response.headers.set(name, `${existing}, ${missing.join(", ")}`);
      } else {
        response.headers.set(name, existing && name === "Link" ? `${existing}, ${value}` : value);
      }
    }
    return response;
  } catch {
    return setHeaders(new Response(response.body, response), headers);
  }
}

export function agentside(config: AgentsideConfig) {
  const service = Effect.runSync(
    make(config).pipe(
      Effect.provide(FetchHttpClient.layer),
      Effect.catchTag("InvalidConfig", (error) => Effect.die(new Error(`agentside: ${error.message}`)))
    )
  );
  const skip = config.skip ?? [];

  const isSkipped = (pathname: string) =>
    skip.some((prefix) => pathname === prefix || pathname.startsWith(prefix.endsWith("/") ? prefix : `${prefix}/`));

  const respond = Effect.fnUntraced(function* (request: Request, pathname: string, agent: Agent | null) {
    const started = performance.now();
    const path = toPagePath(pathname);
    return yield* service.serve(path, request, agent).pipe(
      Effect.matchEffect({
        onSuccess: ({ body, tokens, variant, cached }) =>
          Effect.sync(() => {
            config.onServe?.({ path, variant, agent, status: 200, cached, durationMs: performance.now() - started });
            return markdownResponse(request.method === "HEAD" ? "" : body, config, 200, { "X-Agentside-Variant": variant }, tokens);
          }),
        onFailure: (error) =>
          Effect.sync(() => {
            if (error._tag === "NotFound") {
              return markdownResponse(`# Not found\n\nNo markdown version of ${path} exists.\n`, config, 404);
            }
            config.onError?.(error, path);
            return markdownResponse("# Temporarily unavailable\n\nTry again shortly.\n", config, 503, { "Retry-After": "30" });
          }),
      })
    );
  });

  const render = (request: Request, pathname: string, agent = detectAgent(request.headers.get("user-agent"))) =>
    Effect.runPromise(respond(request, pathname, agent));

  return {
    serve: (request: Request, pathname = new URL(request.url).pathname) => render(request, pathname),

    async handle(request: Request, next: () => Promise<Response>): Promise<Response> {
      if (!SERVABLE_METHODS.has(request.method)) return next();
      const { pathname } = new URL(request.url);
      if (isSkipped(pathname)) return next();

      // Paths without a route (APIs, assets, the app's own .md files) pass through untouched.
      if (!service.match(toPagePath(pathname))) return next();

      if (pathname.endsWith(".md")) {
        return render(request, pathname);
      }

      const accept = request.headers.get("accept");
      const format = negotiateFormat(accept, config.accept ?? "contains");
      const agent = detectAgent(request.headers.get("user-agent"));
      if (format === "markdown" || agent) {
        const response = await render(request, pathname, agent);
        if (response.ok) return response;
        requestHtml(request);
        return setHeaders(await next(), { Vary: "Accept, User-Agent" });
      }

      if (format === null) {
        return new Response("Not Acceptable\n\nSupported: text/html, text/markdown\n", {
          status: 406,
          headers: { "Content-Type": "text/plain; charset=utf-8", Vary: "Accept, User-Agent" },
        });
      }

      const response = await next();
      if (config.linkHeader === false) {
        return setHeaders(response, { Vary: "Accept, User-Agent" });
      }
      return setHeaders(response, {
        Link: `<${toMarkdownPath(pathname)}>; rel="alternate"; type="text/markdown"`,
        Vary: "Accept, User-Agent",
      });
    },
  };
}

export type Agentside = ReturnType<typeof agentside>;
