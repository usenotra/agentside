<p align="center"><img src="./logo-dark.svg" width="72" alt="Notra" /></p>

# Agentside by Notra

Serve markdown versions of your pages to AI agents and A/B test what they read. Built on [Effect](https://effect.website), works with any framework that speaks `Request` and `Response`.

```sh
bun add agentside
```

```ts
import { agentside, remote } from "agentside";

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
- **Typed errors.** `agentside/effect` exposes the Effect program and its `NotFound`, `RenderFailed`, `RemoteFailed` and `SourceTimeout` errors.

## Benchmarks

`bun run bench` compares agentside 0.1.0 with `@dualmark/core` and `@dualmark/nextjs` 0.11.0 on Bun 1.4.0 (Apple M5). Lower is better.

| Scenario | Dualmark | Agentside | Speedup |
| --- | --- | --- | --- |
| Agent detection, browser user agent | 556 ns | 47 ns | 11.9x |
| Agent detection, AI bot user agent | 487 ns | 53 ns | 9.3x |
| Accept negotiation, browser header | 487 ns | 245 ns | 2.0x |
| Unicode normalisation, 5 KB of markdown | 24.6 µs | 8.1 µs | 3.0x |
| Browser request that gets HTML | 2.36 µs | 1.86 µs | 1.3x |
| Agent request, route 200 of 200 | 52.6 µs | 8.5 µs (18.5 µs without cache) | 6.2x |
| `.md` request on a parameterised route | 43.4 µs | 6.8 µs (18.4 µs without cache) | 6.4x |

Failure behaviour from the same script:

| Situation | Dualmark | Agentside |
| --- | --- | --- |
| Agent requests a page whose render throws | throws | HTML page (200) |
| Agent requests a page with no markdown twin | 404 | HTML page (200) |
| `.md` request whose render throws | throws | 503 markdown with `Retry-After` |
| `.md` request whose remote source hangs | not supported | 503 after the timeout |

## Repository

| Path | What |
| --- | --- |
| `packages/agentside` | The SDK, published to npm as `agentside` |
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
