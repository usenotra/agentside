import { Effect } from "effect";
import { FetchHttpClient } from "effect/http";

import * as Programs from "./prerender.js";
import { PrerenderFailed } from "./errors.js";
import type { AgentsideConfig, PrerenderedPage, PrerenderHtmlOptions, PrerenderOptions, PrerenderResult } from "./types.js";
import * as Vercel from "./vercel.js";

export { htmlToMarkdown } from "./html.js";
export { llmsFullTxt, llmsTxt } from "./llms.js";
export { vercelRoutes } from "./vercel.js";
export type { PrerenderOptions, PrerenderResult } from "./types.js";

function toError(error: { readonly _tag: string; readonly message?: string }) {
  if (error instanceof PrerenderFailed) {
    const lines = error.failures.map((failure) => `${failure.path}: ${failure.reason}`);
    return new Error(`agentside: ${error.failures.length} page(s) failed\n${lines.join("\n")}`);
  }
  return new Error(`agentside: ${error._tag}${error.message ? `: ${error.message}` : ""}`);
}

function run<A, E extends { readonly _tag: string; readonly message?: string }>(effect: Effect.Effect<A, E>): Promise<A> {
  return Effect.runPromise(effect.pipe(Effect.catch((error) => Effect.die(toError(error)))));
}

export function prerender(config: AgentsideConfig, options: PrerenderOptions): Promise<PrerenderResult> {
  return run(Programs.prerender(config, options).pipe(Effect.provide(FetchHttpClient.layer)));
}

export function prerenderHtml(options: PrerenderHtmlOptions): Promise<PrerenderedPage[]> {
  return run(Programs.prerenderHtml(options));
}

export function applyVercelBuildOutput(options?: { readonly outputDir?: string; readonly paths?: readonly string[] }): Promise<void> {
  return run(Vercel.applyVercelBuildOutput(options));
}
