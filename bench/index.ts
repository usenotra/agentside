import { detectAIBot, negotiateFormat as dmNegotiate, normalizeUnicode as dmNormalize } from "@dualmark/core";
import { createDualmarkRouteHandler } from "@dualmark/nextjs";
import { agentside, detectAgent, negotiateFormat, normalizeUnicode, remote } from "@usenotra/agentside";
import { bench, do_not_optimize, group, run, summary } from "mitata";

const ROUTE_COUNT = 200;
const BODY = `# Pricing\n\nOur plans start at €29 – “Starter” includes everything… ${"lorem ipsum ".repeat(400)}`;
const BROWSER_UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const BOT_UA = "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; Meta-ExternalAgent/1.1)";
const BROWSER_ACCEPT = "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8";

const paths = Array.from({ length: ROUTE_COUNT }, (_, i) => `/page-${i}`);
const lastPath = paths.at(-1) ?? "/";
const html = async () => new Response("<h1>html</h1>", { headers: { "content-type": "text/html" } });
const request = (path: string, headers: Record<string, string>) => new Request(`https://example.com${path}`, { headers });

const dualmark = createDualmarkRouteHandler({
  siteUrl: "https://example.com",
  staticPages: paths.map((pattern) => ({ pattern, render: () => BODY })),
  parameterizedRoutes: [{ pattern: "/blog/[slug]", getStaticPaths: () => [], render: ({ params }) => `# ${params.slug}\n${BODY}` }],
});

async function dualmarkMiddleware(req: Request, next: () => Promise<Response>) {
  const { pathname } = new URL(req.url);
  const parts = pathname.replace(/\.md$/, "").split("/").filter(Boolean);
  if (pathname.endsWith(".md")) return dualmark.GET(req, { params: Promise.resolve({ path: parts }) });
  const format = dmNegotiate(req.headers.get("accept") ?? "");
  if (detectAIBot(req.headers.get("user-agent") ?? "").isBot || format === "markdown") {
    return dualmark.GET(req, { params: Promise.resolve({ path: parts }) });
  }
  return next();
}

const routes = Object.fromEntries([
  ...paths.map((path) => [path, () => BODY] as const),
  ["/blog/[slug]", ({ params }: { params: Record<string, string> }) => `# ${params.slug}\n${BODY}`] as const,
]);
const cached = agentside({ routes });
const uncached = agentside({ routes, cache: false });

summary(() => {
  group("agent detection: browser UA (the hot path)", () => {
    bench("dualmark", () => do_not_optimize(detectAIBot(BROWSER_UA)));
    bench("agentside", () => do_not_optimize(detectAgent(BROWSER_UA)));
  });
  group("agent detection: AI bot UA", () => {
    bench("dualmark", () => do_not_optimize(detectAIBot(BOT_UA)));
    bench("agentside", () => do_not_optimize(detectAgent(BOT_UA)));
  });
  group("negotiation: browser Accept", () => {
    bench("dualmark", () => do_not_optimize(dmNegotiate(BROWSER_ACCEPT)));
    bench("agentside", () => do_not_optimize(negotiateFormat(BROWSER_ACCEPT)));
  });
  group("normalize 5 KB of markdown", () => {
    bench("dualmark", () => do_not_optimize(dmNormalize(BODY)));
    bench("agentside", () => do_not_optimize(normalizeUnicode(BODY)));
  });
  group("full request: browser gets HTML", () => {
    bench("dualmark", async () => do_not_optimize(await dualmarkMiddleware(request("/page-5", { "user-agent": BROWSER_UA, accept: BROWSER_ACCEPT }), html)));
    bench("agentside", async () => do_not_optimize(await cached.handle(request("/page-5", { "user-agent": BROWSER_UA, accept: BROWSER_ACCEPT }), html)));
  });
  group(`full request: agent gets markdown, route ${ROUTE_COUNT} of ${ROUTE_COUNT}`, () => {
    bench("dualmark", async () => do_not_optimize(await (await dualmarkMiddleware(request(lastPath, { "user-agent": BOT_UA }), html)).text()));
    bench("agentside (cache off)", async () => do_not_optimize(await (await uncached.handle(request(lastPath, { "user-agent": BOT_UA }), html)).text()));
    bench("agentside", async () => do_not_optimize(await (await cached.handle(request(lastPath, { "user-agent": BOT_UA }), html)).text()));
  });
  group("full request: .md on a parameterized route", () => {
    bench("dualmark", async () => do_not_optimize(await (await dualmarkMiddleware(request("/blog/hello.md", {}), html)).text()));
    bench("agentside (cache off)", async () => do_not_optimize(await (await uncached.handle(request("/blog/hello.md", {}), html)).text()));
    bench("agentside", async () => do_not_optimize(await (await cached.handle(request("/blog/hello.md", {}), html)).text()));
  });
});

await run();

async function outcome(run: () => Promise<Response>) {
  try {
    const response = await run();
    return `${response.status} ${response.headers.get("content-type")?.split(";")[0] ?? ""}`.trim();
  } catch (error) {
    return `throws (${error instanceof Error ? error.message : String(error)})`;
  }
}

const failing = {
  "/broken": () => {
    throw new Error("CMS down");
  },
  "/slow": remote("http://10.255.255.1/pricing.md"),
};
const dmFailing = createDualmarkRouteHandler({
  siteUrl: "https://example.com",
  staticPages: [{ pattern: "/broken", render: failing["/broken"] }],
});
const asFailing = agentside({ routes: failing, timeoutMs: 1000, retries: 0 });
const dmCall = (req: Request) => {
  const { pathname } = new URL(req.url);
  const parts = pathname.replace(/\.md$/, "").split("/").filter(Boolean);
  if (pathname.endsWith(".md") || detectAIBot(req.headers.get("user-agent") ?? "").isBot) {
    return dmFailing.GET(req, { params: Promise.resolve({ path: parts }) });
  }
  return html();
};

console.log("\nFailure behaviour");
console.table({
  "agent hits a page whose render throws": {
    dualmark: await outcome(() => dmCall(request("/broken", { "user-agent": BOT_UA }))),
    agentside: await outcome(() => asFailing.handle(request("/broken", { "user-agent": BOT_UA }), html)),
  },
  "agent hits a page without a markdown twin": {
    dualmark: await outcome(() => dmCall(request("/about", { "user-agent": BOT_UA }))),
    agentside: await outcome(() => asFailing.handle(request("/about", { "user-agent": BOT_UA }), html)),
  },
  "explicit .md whose render throws": {
    dualmark: await outcome(() => dmCall(request("/broken.md", {}))),
    agentside: await outcome(() => asFailing.handle(request("/broken.md", {}), html)),
  },
  "explicit .md, remote source hangs (1s timeout)": {
    dualmark: "no remote sources",
    agentside: await outcome(() => asFailing.handle(request("/slow.md", {}), html)),
  },
});
