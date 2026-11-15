<p align="center"><img src="./logo-dark.svg" width="72" alt="Notra" /></p>

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
- **Failures don't break pages.** A twin that throws, times out or doesn't exist falls back to the HTML page for agents. An explicit `.md` request gets a 404 or a 503 with `Retry-After` rather than an unhandled exception.
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
| Browser request that gets HTML | 2.26 µs | 1.47 µs | 1.5x |
| Agent request, route 200 of 200 | 41.2 µs | 2.67 µs (15.4 µs without cache) | 15.4x |
| `.md` request on a parameterised route | 37.9 µs | 2.30 µs (15.5 µs without cache) | 16.5x |

Failure behaviour from the same script:

| Situation | Dualmark | Agentside |
| --- | --- | --- |
| Agent requests a page whose render throws | throws | HTML page (200) |
| Agent requests a page with no markdown twin | 404 | HTML page (200) |
| `.md` request whose render throws | throws | 503 markdown with `Retry-After` |
| `.md` request whose remote source hangs | not supported | 503 after the timeout |

## Prerendering

`@usenotra/agentside/build` writes every twin to a static file at build time, so a CDN can serve `/pricing.md` without running any code. A twin that throws fails the build and lists every failing path; a twin that returns `null` is skipped.

```ts
import { prerender } from "@usenotra/agentside/build";

await prerender({ routes }, { outDir: "dist/client", paths: ["/", "/pricing", "/blog/hello"] });
```

`paths` defaults to every route without parameters. Keep `handle` in front for `Accept` and user agent negotiation, or add CDN rewrites that send those requests to the `.md` file.

## Static sites: convert your built HTML

If your pages are static, you don't need to write any markdown. After your build, `prerenderHtml` reads every `.html` file, converts the page's `<main>` (falling back to `<article>` and `<body>`) to markdown and writes it next to the page as `.md`. It also writes `llms.txt` and `llms-full.txt`.

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
| A link wrapping a heading and text (a card) | `[Heading](url): text` |
| `<nav>` and `<footer>` outside `<main>`, scripts, styles, forms and buttons | Left out |

Links and images become absolute when you pass `siteUrl`, and a page that fails to convert fails the build with every failing path listed. `htmlToMarkdown(html, options)` is exported too if you want to convert a single page.

### Negotiating at the CDN

Static pages on Vercel never reach a function, so negotiation has to happen in the routing layer. `vercelRoutes()` returns `rewrites` and `headers` for `vercel.json` that send `Accept: text/markdown` and known AI agents to the `.md` file:

```ts
import { vercelRoutes } from "@usenotra/agentside/build";

await Bun.write("vercel.json", JSON.stringify(vercelRoutes(), null, 2));
```

Pass the list of paths (for example `pages.map((page) => page.path)` from `prerenderHtml`) to rewrite only pages that have a twin. CDN rules can't read q-values, so if part of your site also runs `handle`, set `accept: "contains"` there to make the same decision as the CDN.

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
