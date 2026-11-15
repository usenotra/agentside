import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { Effect, Exit } from "effect";

import { make } from "./core.js";
import { toMarkdownPath } from "./text.js";
import type { AgentsideConfig } from "./types.js";

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
