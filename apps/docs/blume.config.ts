import { defineConfig } from "blume";
import { databuddy, script } from "blume/analytics";

const DATABUDDY_CLIENT_ID = "8bbb2d0d-30de-45f8-9c69-7a46b1e03eec";

export default defineConfig({
  title: "Agentside",
  description:
    "Serve markdown twins of your pages to AI agents and A/B test what they read. An Effect-based SDK by Notra.",
  logo: "/logo.svg",
  github: {
    owner: "usenotra",
    repo: "agentside",
    dir: "apps/docs",
  },
  navigation: {
    featured: [
      {
        href: "https://github.com/usenotra/agentside",
        icon: "github",
        label: "GitHub",
      },
    ],
  },
  footer: {
    copyright: "Agentside by Notra",
    links: [
      { href: "https://usenotra.com", label: "Notra" },
      { href: "https://www.npmjs.com/package/@usenotra/agentside", label: "npm" },
    ],
  },
  deployment: {
    base: "/docs",
    site: "https://agentside.usenotra.com",
  },
  analytics: [
    databuddy({ clientId: DATABUDDY_CLIENT_ID, "track-web-vitals": "true" }),
    script({
      src: "https://cdn.databuddy.cc/replay.js",
      strategy: "async",
      attributes: { "data-client-id": DATABUDDY_CLIENT_ID, crossorigin: "anonymous" },
    }),
  ],
  theme: {
    accent: { light: "#7c3aed", dark: "#a78bfa" },
  },
});
