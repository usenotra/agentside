import type { CodeThemes } from "../types/landing";

export const CODE_THEMES: CodeThemes = { light: "github-light", dark: "github-dark" };

export const SETUP_CODE = `import { agentside, remote } from "@usenotra/agentside";

export const twins = agentside({
  routes: {
    "/": "# Acme\\n\\nAcme sends invoices your customers actually pay.",
    "/pricing": () => renderPricingMarkdown(),
    "/blog/[slug]": ({ params }) => getPost(params.slug)?.markdown ?? null,
    "/docs/[...path]": remote(({ params }) => \`https://cms.acme.dev/docs/\${params.path}.md\`),
  },
  skip: ["/api", "/assets"],
});

export const onRequest = (context, next) => twins.handle(context.request, () => next());`;

export const VARIANTS_CODE = `agentside({
  routes: { "/pricing": () => renderPricingMarkdown() },
  variants: {
    "/pricing": [
      { id: "pricing-search", purposes: ["search"], source: remote("https://cms.acme.dev/pricing-v2.md") },
      { id: "pricing-short", agents: ["ChatGPT-User", "Claude-User"], source: shortPricing },
    ],
  },
  onServe: (event) => analytics.track("agent_read", event),
});`;

export const EXPOSURE_CODE = `{
  "path": "/pricing",
  "variant": "pricing-search",
  "agent": { "name": "OAI-SearchBot", "vendor": "OpenAI", "purpose": "search" },
  "status": 200,
  "cached": true,
  "durationMs": 0.21
}`;
