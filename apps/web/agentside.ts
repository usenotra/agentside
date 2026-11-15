import { prerenderHtml } from "@usenotra/agentside/build";

await prerenderHtml({
  dir: "dist",
  exclude: ["/docs"],
  siteUrl: "https://agentside.usenotra.com",
  llms: {
    title: "Agentside by Notra",
    description: "Serve markdown versions of your pages to AI agents and A/B test what they read.",
  },
});

await Bun.write("dist/docs.md", Bun.file("dist/docs/index.md"));
