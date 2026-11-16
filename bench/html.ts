import { readdir } from "node:fs/promises";
import { join } from "node:path";

import { htmlToMarkdown } from "@usenotra/agentside/build";
import { htmlToMarkdown as previous } from "agentside-0.3.5/build";
import { bench, do_not_optimize, group, run, summary } from "mitata";

const BROWSER = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36";

async function fromSitemap(origin: string) {
  const sitemap = await (await fetch(`${origin}/sitemap.xml`)).text();
  const urls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1] ?? "");
  return Promise.all(urls.map(async (url) => ({ name: new URL(url).pathname, html: await (await fetch(url, { headers: { "user-agent": BROWSER, accept: "text/html" } })).text() })));
}

async function fromDirectory(dir: string) {
  const files = (await readdir(dir, { recursive: true })).filter((file) => file.endsWith(".html"));
  return Promise.all(files.map(async (file) => ({ name: file, html: await Bun.file(join(dir, file)).text() })));
}

const source = process.argv[2] ?? "../apps/web/dist";
const pages = source.startsWith("http") ? await fromSitemap(source.replace(/\/$/, "")) : await fromDirectory(source);
const siteUrl = source.startsWith("http") ? source : "https://example.com";
const totalBytes = pages.reduce((sum, page) => sum + page.html.length, 0);
const largest = pages.reduce((max, page) => (page.html.length > max.html.length ? page : max), pages[0] ?? { name: "", html: "" });

console.log(`${pages.length} pages, ${(totalBytes / 1024).toFixed(0)} KB of HTML, largest ${largest.name} (${(largest.html.length / 1024).toFixed(0)} KB)\n`);

summary(() => {
  group(`convert all ${pages.length} pages`, () => {
    bench("agentside 0.3.5 (node-html-parser + node-html-markdown)", () => {
      for (const page of pages) do_not_optimize(previous(page.html, { siteUrl }));
    });
    bench("agentside (built-in parser)", () => {
      for (const page of pages) do_not_optimize(htmlToMarkdown(page.html, { siteUrl }));
    });
  });
  group(`convert the largest page (${largest.name})`, () => {
    bench("agentside 0.3.5 (node-html-parser + node-html-markdown)", () => do_not_optimize(previous(largest.html, { siteUrl })));
    bench("agentside (built-in parser)", () => do_not_optimize(htmlToMarkdown(largest.html, { siteUrl })));
  });
});

await run();

let identical = 0;
let previousBytes = 0;
let nextBytes = 0;
for (const page of pages) {
  const before = previous(page.html, { siteUrl });
  const after = htmlToMarkdown(page.html, { siteUrl });
  previousBytes += before.length;
  nextBytes += after.length;
  if (before === after) identical++;
}
console.log(`\nOutput: ${identical}/${pages.length} pages identical, ${previousBytes} B before, ${nextBytes} B after`);
