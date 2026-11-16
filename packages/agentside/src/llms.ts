import { toMarkdownPath } from "./text.js";
import type { LlmsOptions, PrerenderedPage } from "./types.js";

function base(siteUrl: string | undefined) {
  return (siteUrl ?? "").replace(/\/+$/, "");
}

function label(value: string) {
  return value.replace(/[[\]\\]/g, "\\$&");
}

function underPrefix(path: string, prefix: string) {
  const normalized = prefix.replace(/\/+$/, "");
  return normalized === "" || path === normalized || path.startsWith(`${normalized}/`);
}

function sectionTitle(segment: string) {
  return segment.replace(/[-_]+/g, " ").replace(/^\w/, (letter) => letter.toUpperCase());
}

export function llmsTxt(pages: readonly PrerenderedPage[], options: LlmsOptions) {
  const siteUrl = base(options.siteUrl);
  const url = (path: string) => `${siteUrl}${toMarkdownPath(path)}`;
  const sections = options.sections ?? {};
  const prefixes = Object.keys(sections).sort((left, right) => right.length - left.length);
  const rank = new Map((options.order ?? []).map((path, index) => [path, index]));
  const sorted = [...pages].sort(
    (left, right) => (rank.get(left.path) ?? Infinity) - (rank.get(right.path) ?? Infinity)
  );
  const groups = new Map<string, string[]>([["Pages", []], ...Object.values(sections).map((title): [string, string[]] => [title, []])]);
  for (const page of sorted) {
    const prefix = prefixes.find((candidate) => underPrefix(page.path, candidate));
    const segment = page.path.split("/")[1] ?? "";
    const isLeaf = page.path.split("/").length <= 2 && !pages.some((other) => other.path.startsWith(`${page.path}/`));
    const title = prefix ? (sections[prefix] ?? "Pages") : isLeaf || !segment ? "Pages" : sectionTitle(segment);
    const line = `- [${label(page.title || page.path)}](${url(page.path)})${page.description ? `: ${page.description}` : ""}`;
    groups.set(title, [...(groups.get(title) ?? []), line]);
  }
  for (const [title, links] of Object.entries(options.links ?? {})) {
    const lines = links.map((link) => `- [${label(link.title)}](${link.url})${link.description ? `: ${link.description}` : ""}`);
    groups.set(title, [...(groups.get(title) ?? []), ...lines]);
  }
  const ordered = [...groups.entries()]
    .filter(([, lines]) => lines.length > 0)
    .sort(([left], [right]) => Number(left === "Optional") - Number(right === "Optional"));
  return [
    `# ${options.title}`,
    ...(options.description ? ["", `> ${options.description}`] : []),
    ...ordered.flatMap(([title, lines]) => ["", `## ${title}`, "", ...lines]),
    "",
  ].join("\n");
}

export function llmsFullTxt(pages: readonly PrerenderedPage[], options: { readonly siteUrl?: string | undefined } = {}) {
  return `${pages
    .map((page) => `Source: ${base(options.siteUrl)}${page.path}\n\n${page.markdown.trim()}`)
    .join("\n\n---\n\n")}\n`;
}
