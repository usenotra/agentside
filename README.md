<p align="center"><img src="https://raw.githubusercontent.com/usenotra/agentside/main/logo-dark.svg" width="72" alt="Notra" /></p>

# Agentside by Notra

Serve markdown versions of your pages to AI agents and A/B test what they read. Built on [Effect](https://effect.website), works with any framework that speaks `Request` and `Response`.

[agentside.usenotra.com](https://agentside.usenotra.com) · [Docs](https://agentside.usenotra.com/docs)

```sh
bun add @usenotra/agentside
```

```ts
import { agentside, remote } from "@usenotra/agentside";

const md = agentside({
  routes: {
    "/": "# Acme\n\nWe make anvils.",
    "/pricing": () => buildPricingMarkdown(),
    "/blog/[slug]": ({ params }) => getPost(params.slug)?.markdown ?? null,
    "/docs/[...path]": remote(({ params }) => `https://cms.example.com/docs/${params.path}.md`),
  },
  variants: {
    "/pricing": [{ id: "pricing-b", vendors: ["OpenAI"], source: remote("https://cms.example.com/pricing-b.md") }],
  },
});

export default {
  fetch: (request: Request) => md.handle(request, () => renderHtml(request)),
};
```

Agents get markdown when they ask for `/pricing.md`, send `Accept: text/markdown` or identify as a known AI agent (ChatGPT-User, Claude-User, PerplexityBot and others). Everyone else gets your HTML with a `Link: </pricing.md>; rel="alternate"` header.

## Why not Dualmark?

Agentside does what [Dualmark](https://github.com/dodopayments/dualmark) does, with these differences:

- **Faster.** Agent detection is one precompiled regex, routes are a map lookup and rendered markdown is cached with concurrent requests deduped. See the benchmarks below.
- **Failures don't break pages.** A twin that throws, times out or doesn't exist falls back to the HTML page for agents that accept HTML. An explicit `.md` request gets a 404 or a 503 with `Retry-After` rather than an unhandled exception.
- **Remote sources.** `remote()` fetches markdown from a CMS or another deployment, with a timeout and retries on 5xx and network errors.
- **Per-agent variants.** Show ChatGPT one version and Claude another, with automatic fallback to the original if the variant fails. Every response says which variant it served (`X-Agentside-Variant`) and `onServe` reports each exposure.
- **Not tied to Next.js.** One fetch-standard handler for TanStack Start, Astro, Hono, Next.js middleware, Bun and Workers.
- **Typed errors.** `@usenotra/agentside/effect` exposes the Effect program and its `NotFound`, `RenderFailed`, `RemoteFailed` and `SourceTimeout` errors.

## Benchmarks

`bun run bench` compares agentside 0.1.0 with `@dualmark/core` and `@dualmark/nextjs` 0.11.0 on Bun 1.4.0 (Apple M5). Lower is better.

| Scenario | Dualmark | Agentside | Speedup |
| --- | --- | --- | --- |
| Agent detection, browser user agent | 513 ns | 43 ns | 11.8x |
| Agent detection, AI bot user agent | 485 ns | 54 ns | 9.0x |
| Accept negotiation, browser header | 464 ns | 244 ns | 1.9x |
| Unicode normalisation, 5 KB of markdown | 23.4 µs | 7.1 µs | 3.3x |
| Browser request that gets HTML | 2.03 µs | 1.40 µs | 1.5x |
| Agent request, route 200 of 200 | 38.1 µs | 2.76 µs (16.2 µs without cache) | 13.8x |
| `.md` request on a parameterised route | 38.9 µs | 2.44 µs (16.0 µs without cache) | 15.9x |

Failure behaviour from the same script:

| Situation | Dualmark | Agentside |
| --- | --- | --- |
| Agent requests a page whose render throws | throws | HTML page (200) |
| Agent requests a page with no markdown twin | 404 | HTML page (200) |
| `.md` request whose render throws | throws | 503 markdown with `Retry-After` |
| `.md` request whose remote source hangs | not supported | 503 after the timeout |

### HTML to markdown

`prerenderHtml` and `htmlToMarkdown` use a built-in HTML parser and markdown writer, so the package depends on nothing but `effect`. `bun run --cwd bench html [dir or site]` compares it with 0.3.5, which used `node-html-parser` and `node-html-markdown`:

| Corpus | 0.3.5 | Built-in | Speedup |
| --- | --- | --- | --- |
| This site, 21 pages (1.3 MB of HTML) | 23.8 ms | 8.1 ms | 2.9x |
| aiinbx.com, 38 pages (4.5 MB of HTML) | 120.9 ms | 28.8 ms | 4.2x |
| Largest aiinbx.com page (339 KB) | 12.8 ms | 2.3 ms | 5.6x |
| usenotra.com, 143 pages (24.6 MB of HTML) | 299.8 ms | 89.1 ms | 3.4x |
| Largest usenotra.com page (1.1 MB) | 11.0 ms | 2.5 ms | 4.4x |

Installing the package also dropped from 12 extra packages and 2.6 MB to none.

## Prerendering

`@usenotra/agentside/build` writes every twin to a static file at build time, so a CDN can serve `/pricing.md` without running any code. A twin that throws fails the build and lists every failing path; a twin that returns `null` is skipped.

```ts
import { prerender } from "@usenotra/agentside/build";

await prerender({ routes }, { outDir: "dist/client", paths: ["/", "/pricing", "/blog/hello"] });
```

`paths` defaults to every route without parameters. Keep `handle` in front for `Accept` and user agent negotiation, or add CDN rewrites that send those requests to the `.md` file.

## Static sites: convert your built HTML

If your pages are static, you don't need to write any markdown. After your build, `prerenderHtml` reads every `.html` file, converts the page's `<main>` (falling back to `<article>` and `<body>`) to markdown and writes it next to the page as `.md`. With the `llms` option, it also writes `llms.txt` and `llms-full.txt`.

```ts
import { prerenderHtml } from "@usenotra/agentside/build";

await prerenderHtml({
  dir: "dist",
  siteUrl: "https://example.com",
  exclude: ["/admin"],
  llms: { title: "Acme", description: "We make anvils." },
});
```

Mark up the HTML to control what agents read:

| Markup | Result |
| --- | --- |
| `data-ai-ignore` | The element and everything in it is left out |
| `data-ai-content="..."` | The element is replaced by the markdown in the attribute, useful for charts, widgets and images |
| `<table>` | A GFM table |
| `<dl>` | A list of `**term**: definition` pairs |
| A link wrapping a heading and text (a card) | `### [Heading](url)` at the heading's own level, then the text |
| `<pre>` code blocks, including Shiki output | A fenced block with its line breaks and language |
| `<nav>` anywhere, `<footer>` outside `<main>`, decorative images without `alt`, scripts, styles, forms and buttons | Left out |

`llms.txt` groups pages into `##` sections by their first path segment, and `llms: { sections: { "/legal": "Legal" } }` overrides a section by path prefix. Pass `normalize: true` to replace typographic Unicode with ASCII. Links and images become absolute when you pass `siteUrl`, and a page that fails to convert fails the build with every failing path listed. `htmlToMarkdown(html, options)` is exported too if you want to convert a single page.

### Negotiating at the CDN

Static pages on Vercel never reach a function, so negotiation has to happen in the routing layer. `vercelRoutes()` returns a `routes` array for `vercel.json`. Vercel runs `routes` before the static file lookup, so they send `Accept: text/markdown` and known AI agents to the `.md` file even though the HTML page exists:

```ts
import { vercelRoutes } from "@usenotra/agentside/build";

await Bun.write("vercel.json", JSON.stringify(vercelRoutes(), null, 2));
```

Markdown responses get `Content-Type: text/markdown`, `Vary: Accept, User-Agent` and `X-Robots-Tag: noindex`, and HTML pages get a `Link` header to their twin plus `Vary: Accept, User-Agent`, so the CDN cache never serves cached HTML to an agent. Pass the list of paths (for example `pages.map((page) => page.path)` from `prerenderHtml`) to rewrite only pages that have a twin. `routes` can't be combined with `rewrites`, `redirects`, `headers`, `cleanUrls` or `trailingSlash` in the same `vercel.json`.

Framework adapters that write the Build Output API (`@astrojs/vercel`, SvelteKit's `adapter-vercel`, Nuxt's `vercel` preset) don't use `vercel.json` for this. Run `applyVercelBuildOutput({ paths })` after their build instead; it inserts the same routes into `.vercel/output/config.json` before `{ "handle": "filesystem" }`.

`handle` serves markdown whenever `Accept` mentions `text/markdown` by default, the same rule as the CDN, so static and on-demand pages agree. Set `accept: "q-value"` for strict q-value negotiation when no CDN rules are involved.

## Repository

| Path | What |
| --- | --- |
| `packages/agentside` | The SDK, published to npm as `@usenotra/agentside` |
| `apps/web` | Marketing site (Astro) |
| `apps/docs` | Documentation (Blume) |
| `bench` | Benchmarks against Dualmark |
| `docs/research/ab-testing.md` | Research on A/B testing agent content |

```sh
bun install
bun run build
bun run bench
```

## Releasing

Bump `version` in `packages/agentside/package.json` and merge to `main`. The publish workflow builds the tarball in one job and publishes it from another that only has `id-token: write`, using npm trusted publishing with provenance and `npm stage publish`, so a maintainer approves the staged release on npmjs.com before it goes live. No npm token is stored in the repository.

## License

MIT
