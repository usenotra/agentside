import { defineConfig } from "blume";
import { script } from "blume/analytics";

const DATABUDDY_CLIENT_ID = "8bbb2d0d-30de-45f8-9c69-7a46b1e03eec";

// Pinned to the tracker files @databuddy/sdk 3.5.1 ships with (dist/script-*.mjs).
const DATABUDDY_CDN = "https://cdn.databuddy.cc";
const DATABUDDY_TRACKER = {
  file: "databuddy.2026-11-10.2.js",
  integrity: "sha384-8dDxbfqq6pDesWbmOQkFMFRrJVB+xCnyKaCj8R6GWA/GvUEcy3zUkP6dMWoRA1MU",
};
const DATABUDDY_REPLAY = {
  file: "replay.2026-11-10.2.js",
  integrity: "sha384-w40v7LfGCSUEdxa364DsLkA8QUbllix4Udt/JK+Nsd7Zinf2ScKoW1A3YYMmwFvx",
};

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
    script({
      src: `${DATABUDDY_CDN}/${DATABUDDY_TRACKER.file}`,
      strategy: "async",
      attributes: {
        "data-client-id": DATABUDDY_CLIENT_ID,
        "data-track-web-vitals": "true",
        integrity: DATABUDDY_TRACKER.integrity,
        crossorigin: "anonymous",
      },
    }),
    script({
      src: `${DATABUDDY_CDN}/${DATABUDDY_REPLAY.file}`,
      strategy: "async",
      attributes: {
        "data-client-id": DATABUDDY_CLIENT_ID,
        integrity: DATABUDDY_REPLAY.integrity,
        crossorigin: "anonymous",
      },
    }),
  ],
  theme: {
    accent: { light: "#7c3aed", dark: "#a78bfa" },
  },
});
