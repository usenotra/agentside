import { NodeHtmlMarkdown } from "node-html-markdown";
import { type HTMLElement, parse } from "node-html-parser";

import type { HtmlToMarkdownOptions } from "./types.js";

const DROP =
  "script, style, noscript, template, svg, iframe, canvas, form, button, nav, [hidden], [aria-hidden='true'], img[alt=''], img:not([alt])";
const BLOCK = new Set(["H1", "H2", "H3", "H4", "H5", "H6", "P", "DIV", "UL", "OL", "IMG", "SECTION", "ARTICLE", "HEADER", "FOOTER"]);
const converter = new NodeHtmlMarkdown({
  bulletMarker: "-",
  codeBlockStyle: "fenced",
  maxConsecutiveNewlines: 2,
  globalEscape: [/`/g, "\\`"],
  lineStartEscape: [/^(\s*)([-+>]\s|#{1,6}\s)/g, "$1\\$2"],
});

function text(element: HTMLElement): string {
  const parts = element.childNodes.map((child) =>
    "tagName" in child
      ? BLOCK.has((child as HTMLElement).tagName)
        ? ` ${text(child as HTMLElement)} `
        : text(child as HTMLElement)
      : child.textContent
  );
  return parts.join("").replace(/\s+/g, " ").trim();
}

function blockTexts(element: HTMLElement): string[] {
  const out: string[] = [];
  let inline = "";
  for (const child of element.childNodes) {
    if ("tagName" in child && BLOCK.has((child as HTMLElement).tagName)) {
      if (inline.trim()) out.push(inline.trim());
      inline = "";
      out.push(...blockTexts(child as HTMLElement));
    } else {
      inline += ` ${"tagName" in child ? text(child as HTMLElement) : child.textContent}`;
    }
  }
  if (inline.trim()) out.push(inline.replace(/\s+/g, " ").trim());
  return out.map((part) => part.replace(/\s+/g, " ").trim()).filter(Boolean);
}

function spacedText(element: HTMLElement): string {
  return element.childNodes
    .map((child) => ("tagName" in child ? spacedText(child as HTMLElement) : child.textContent))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

function cardParts(card: HTMLElement) {
  return card.childNodes.map((child) => ("tagName" in child ? spacedText(child as HTMLElement) : child.textContent.trim())).filter(Boolean);
}

function pickTitle(card: HTMLElement, parts: readonly string[]) {
  const children = card.childNodes.filter((child) => "tagName" in child || child.textContent.trim()) as HTMLElement[];
  if (children.length !== parts.length) return 0;
  const byClass = children.findIndex((child) => /title|heading|name/i.test(child.getAttribute?.("class") ?? ""));
  if (byClass !== -1) return byClass;
  const timeIndex = children.findIndex((child) => child.tagName === "TIME" || Boolean(child.querySelector?.("time")));
  return timeIndex === 0 && parts.length > 1 ? 1 : 0;
}

function ariaTable(table: HTMLElement) {
  const rows = table.querySelectorAll('[role="row"]').map((row) =>
    row.querySelectorAll('[role="cell"], [role="gridcell"], [role="rowheader"], [role="columnheader"]').map((cell) => ({
      header: cell.getAttribute("role") === "columnheader",
      html: escapeHtml(text(cell)),
    }))
  );
  if (rows.length === 0) return null;
  const headerIndex = rows.findIndex((cells) => cells.length > 0 && cells.every((cell) => cell.header));
  const [head, ...body] = headerIndex === -1 ? rows : [rows[headerIndex] ?? [], ...rows.filter((_, index) => index !== headerIndex)];
  const row = (cells: { html: string }[], tag: string) => `<tr>${cells.map((cell) => `<${tag}>${cell.html}</${tag}>`).join("")}</tr>`;
  return `<table><thead>${row(head ?? [], "th")}</thead><tbody>${body.map((cells) => row(cells, "td")).join("")}</tbody></table>`;
}

function tightenTables(markdown: string) {
  let fenced = false;
  return markdown
    .split("\n")
    .map((line) => {
      if (line.startsWith("```")) fenced = !fenced;
      if (fenced || !line.startsWith("|")) return line;
      return line.replace(/ {2,}/g, " ").replace(/-{3,}/g, "---");
    })
    .join("\n");
}

function escapeHtml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function absolutize(element: HTMLElement, attribute: string, siteUrl: string) {
  const value = element.getAttribute(attribute);
  if (!value || value.startsWith("#") || /^[a-z][a-z0-9+.-]*:/i.test(value)) return;
  element.setAttribute(attribute, new URL(value, siteUrl).href);
}

export function htmlToMarkdown(html: string, options: HtmlToMarkdownOptions = {}): string {
  const document = parse(html, { comment: false, blockTextElements: { script: true, noscript: true, style: true } });
  const selectors = options.selector ? [options.selector] : ["main", "article", "body"];
  const root = selectors.map((selector) => document.querySelector(selector)).find(Boolean) ?? document;

  for (const element of root.querySelectorAll("[data-ai-ignore]")) element.remove();
  for (const element of root.querySelectorAll(DROP)) element.remove();

  const slots: string[] = [];
  for (const element of root.querySelectorAll("[data-ai-content]")) {
    slots.push(element.getAttribute("data-ai-content") ?? "");
    element.removeAttribute("data-ai-content");
    element.set_content(`agentsideslot${slots.length - 1}x`);
  }

  for (const table of root.querySelectorAll('[role="table"], [role="grid"]')) {
    const html = ariaTable(table);
    if (html) table.replaceWith(html);
  }

  for (const code of root.querySelectorAll("td code, th code")) {
    slots.push(`\`${code.textContent.replace(/\|/g, "\\|")}\``);
    code.replaceWith(`agentsideslot${slots.length - 1}x`);
  }

  for (const pre of root.querySelectorAll("pre")) {
    const code0 = pre.querySelector("code") ?? pre;
    const children = code0.childNodes.filter((child) => "tagName" in child);
    const spanLines =
      !code0.textContent.includes("\n") &&
      children.length > 1 &&
      (children as HTMLElement[]).every(
        (child) => child.tagName === "DIV" || /(?:^|\s)(?:line|block)(?:\s|$)/.test(child.getAttribute("class") ?? "")
      )
        ? (children as HTMLElement[])
        : [];
    const marked = pre.querySelectorAll(".line, [data-line]");
    const lines = marked.length > 1 ? marked : spanLines;
    const code = pre.querySelector("code");
    const language =
      pre.getAttribute("data-language") ??
      /(?:^|\s)language-([\w-]+)/.exec(`${code?.getAttribute("class") ?? ""} ${pre.getAttribute("class") ?? ""}`)?.[1] ??
      "";
    if (lines.length < 2 && !pre.getAttribute("data-language") && !language) continue;
    const body = lines.length > 1 ? lines.map((line) => line.textContent).join("\n") : (code ?? pre).textContent;
    pre.replaceWith(`<pre><code class="language-${escapeHtml(language)}">${escapeHtml(body)}</code></pre>`);
  }

  for (const list of [...root.querySelectorAll("dl")].reverse()) {
    const items: string[] = [];
    for (const element of list.querySelectorAll("dt, dd")) {
      if (element.tagName === "DT") items.push(`<li><strong>${escapeHtml(text(element))}</strong>`);
      else if (items.length > 0) items[items.length - 1] += `${items[items.length - 1]?.endsWith("</strong>") ? ": " : "; "}${element.innerHTML}`;
    }
    list.replaceWith(`<ul>${items.map((item) => `${item}</li>`).join("")}</ul>`);
  }

  for (const card of root.querySelectorAll("a")) {
    const inner = card.querySelectorAll("*");
    if (!inner.some((element) => BLOCK.has(element.tagName)) && inner.filter((element) => element.tagName === "SPAN").length < 2) {
      continue;
    }
    const href = escapeHtml(card.getAttribute("href") ?? "");
    const heading = card.querySelector("h1, h2, h3, h4, h5, h6");
    if (heading) {
      const title = text(heading);
      heading.remove();
      const rest = blockTexts(card);
      const level = heading.tagName.toLowerCase();
      card.replaceWith(
        `<${level}><a href="${href}">${escapeHtml(title)}</a></${level}>${rest.map((part) => `<p>${escapeHtml(part)}</p>`).join("")}`
      );
    } else {
      const parts = blockTexts(card).length > 1 ? blockTexts(card) : cardParts(card);
      const titleIndex = pickTitle(card, parts);
      const title = parts[titleIndex] ?? "";
      const rest = parts.filter((_, index) => index !== titleIndex);
      card.replaceWith(`<p><a href="${href}">${escapeHtml(title)}</a>${rest.length ? `: ${escapeHtml(rest.join(" "))}` : ""}</p>`);
    }
  }

  if (options.siteUrl) {
    for (const link of root.querySelectorAll("a[href]")) absolutize(link, "href", options.siteUrl);
    for (const image of root.querySelectorAll("img[src]")) absolutize(image, "src", options.siteUrl);
  }

  let markdown = tightenTables(converter.translate(root.innerHTML));
  markdown = markdown
    .replace(/\)\[(?=[^\]]*\]\()/g, ") [")
    .replace(/(\S)\[ +(?=[^\]]*\]\()/g, "$1 [")
    .replace(/agentsideslot(\d+)x/g, (_, index: string) => slots[Number(index)] ?? "");

  if (!root.querySelector("h1")) {
    const title = document.querySelector("h1") ?? document.querySelector("title");
    if (title && text(title)) markdown = `# ${text(title)}\n\n${markdown}`;
  }

  return `${markdown.trim()}\n`;
}

export function readMeta(html: string) {
  const document = parse(html, { comment: false });
  return {
    title: text(document.querySelector("title") ?? document.querySelector("h1") ?? parse("")),
    description: document.querySelector('meta[name="description"]')?.getAttribute("content")?.trim() ?? "",
  };
}
