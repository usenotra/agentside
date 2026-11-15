export type Format = "html" | "markdown";

export type AgentPurpose = "training" | "search" | "user-action";

export interface Agent {
  readonly name: string;
  readonly vendor: string;
  readonly purpose: AgentPurpose;
}

export interface RenderContext {
  readonly path: string;
  readonly params: Readonly<Record<string, string>>;
  readonly request: Request;
  readonly agent: Agent | null;
}

export type Awaitable<T> = T | Promise<T>;

export type LocalSource = (context: RenderContext) => Awaitable<string | null | undefined>;

export interface RemoteSource {
  readonly _tag: "remote";
  readonly url: string | ((context: RenderContext) => string);
  readonly headers?: Readonly<Record<string, string>>;
}

export type Source = string | LocalSource | RemoteSource;

export interface AgentMatcher {
  readonly agents?: readonly string[];
  readonly vendors?: readonly string[];
  readonly purposes?: readonly AgentPurpose[];
}

export interface Variant extends AgentMatcher {
  readonly id: string;
  readonly source: Source;
}

export interface ServeEvent {
  readonly path: string;
  readonly variant: string;
  readonly agent: Agent | null;
  readonly status: number;
  readonly cached: boolean;
  readonly durationMs: number;
}

export interface AgentsideConfig {
  readonly routes: Readonly<Record<string, Source>>;
  readonly variants?: Readonly<Record<string, readonly Variant[]>>;
  readonly skip?: readonly string[];
  readonly cache?: { readonly ttlMs?: number; readonly capacity?: number } | false;
  readonly timeoutMs?: number;
  readonly retries?: number;
  readonly cacheControl?: string;
  readonly noindex?: boolean;
  readonly linkHeader?: boolean;
  readonly normalize?: boolean;
  readonly accept?: "q-value" | "contains";
  readonly onServe?: (event: ServeEvent) => void;
  readonly onError?: (error: unknown, path: string) => void;
}

export interface HtmlToMarkdownOptions {
  readonly selector?: string;
  readonly siteUrl?: string;
}

export interface PrerenderHtmlOptions extends HtmlToMarkdownOptions {
  readonly dir: string;
  readonly outDir?: string;
  readonly exclude?: readonly string[];
  readonly llms?: { readonly title: string; readonly description?: string } | false;
}

export interface PrerenderedPage {
  readonly path: string;
  readonly title: string;
  readonly description: string;
  readonly markdown: string;
}
