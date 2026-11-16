import { Effect, Exit } from "effect";

import { detectAgent } from "./agents.js";
import { make, markdownResponse } from "./core.js";
import { acceptsHtml, negotiateFormat } from "./negotiate.js";
import { toMarkdownPath, toPagePath } from "./text.js";
import type { AgentsideConfig, RemoteSource, RenderContext } from "./types.js";

export { detectAgent, KNOWN_AGENTS } from "./agents.js";
export { NotFound, RemoteFailed, RenderFailed, SourceTimeout, type ServeError } from "./errors.js";
export { negotiateFormat } from "./negotiate.js";
export { estimateTokens, normalizeUnicode, toMarkdownPath } from "./text.js";
export type * from "./types.js";

const SERVABLE_METHODS = new Set(["GET", "HEAD"]);

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
  const server = Effect.runSync(make(config));
  const skip = config.skip ?? [];

  const isSkipped = (pathname: string) =>
    skip.some((prefix) => pathname === prefix || pathname.startsWith(prefix.endsWith("/") ? prefix : `${prefix}/`));

  async function render(
    request: Request,
    pathname: string,
    agent = detectAgent(request.headers.get("user-agent"))
  ): Promise<Response> {
    const started = performance.now();
    const path = toPagePath(pathname);
    const exit = await Effect.runPromiseExit(server.serve(path, request, agent));

    if (Exit.isSuccess(exit)) {
      const { body, tokens, variant, cached } = exit.value;
      config.onServe?.({ path, variant, agent, status: 200, cached, durationMs: performance.now() - started });
      return markdownResponse(
        request.method === "HEAD" ? "" : body,
        config,
        200,
        { "X-Agentside-Variant": variant },
        tokens
      );
    }

    const error = exit.cause.reasons.find((reason) => reason._tag === "Fail")?.error;
    if (error?._tag === "NotFound") {
      return markdownResponse(`# Not found\n\nNo markdown version of ${path} exists.\n`, config, 404);
    }
    config.onError?.(error ?? exit.cause, path);
    return markdownResponse("# Temporarily unavailable\n\nTry again shortly.\n", config, 503, { "Retry-After": "30" });
  }

  return {
    serve: (request: Request, pathname = new URL(request.url).pathname) => render(request, pathname),

    async handle(request: Request, next: () => Promise<Response>): Promise<Response> {
      if (!SERVABLE_METHODS.has(request.method)) return next();
      const { pathname } = new URL(request.url);
      if (isSkipped(pathname)) return next();

      if (pathname.endsWith(".md")) {
        return render(request, pathname);
      }

      const accept = request.headers.get("accept");
      const format = negotiateFormat(accept, config.accept ?? "contains");
      const agent = detectAgent(request.headers.get("user-agent"));
      if (format === "markdown" || agent) {
        const response = await render(request, pathname, agent);
        if (response.ok || !acceptsHtml(accept)) return response;
        return setHeaders(await next(), { Vary: "Accept, User-Agent" });
      }

      if (format === null) {
        return new Response("Not Acceptable\n\nSupported: text/html, text/markdown\n", {
          status: 406,
          headers: { "Content-Type": "text/plain; charset=utf-8", Vary: "Accept, User-Agent" },
        });
      }

      const response = await next();
      if (config.linkHeader === false || !server.match(toPagePath(pathname))) {
        return setHeaders(response, { Vary: "Accept" });
      }
      return setHeaders(response, {
        Link: `<${toMarkdownPath(pathname)}>; rel="alternate"; type="text/markdown"`,
        Vary: "Accept",
      });
    },
  };
}

export type Agentside = ReturnType<typeof agentside>;
