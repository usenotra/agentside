import { defineConfig } from "blume";

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
  theme: {
    accent: { light: "#7c3aed", dark: "#a78bfa" },
  },
});
