import { htmlToMarkdown } from "@usenotra/agentside/build";

const origin = process.argv[2]?.replace(/\/$/, "");
if (!origin) {
  console.error("Usage: bun compare-site.ts https://example.com");
  process.exit(1);
}

const BROWSER = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36";
const sitemap = await (await fetch(`${origin}/sitemap.xml`)).text();
const paths = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => new URL(match[1] ?? "").pathname);
const norm = (value: string) => value.replace(/\]\([^)]*\)/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
const rows = [];

for (const path of paths) {
  const get = (accept: string) => fetch(`${origin}${path}`, { headers: { accept, "user-agent": BROWSER } }).then((res) => res.text());
  const [html, theirs] = await Promise.all([get("text/html"), get("text/markdown")]);
  const ours = htmlToMarkdown(html, { siteUrl: origin });
  const haystack = norm(ours);
  const lost = theirs
    .split("\n")
    .flatMap((line) => line.split(/[.!?:;,]\s/))
    .filter((fragment) => norm(fragment).length > 25 && !haystack.includes(norm(fragment)));
  rows.push({ path, theirs: theirs.length, ours: ours.length, ratio: +(ours.length / theirs.length).toFixed(2), lost: lost.length });
}

console.table(rows);
const sum = (key: "theirs" | "ours") => rows.reduce((total, row) => total + row[key], 0);
console.log(`theirs ${sum("theirs")} B, ours ${sum("ours")} B, ratio ${(sum("ours") / sum("theirs")).toFixed(3)}`);
