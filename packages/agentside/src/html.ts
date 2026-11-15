import { NodeHtmlMarkdown } from "node-html-markdown";
import { type HTMLElement, parse } from "node-html-parser";

import type { HtmlToMarkdownOptions } from "./types.js";

const DROP = "script, style, noscript, template, svg, iframe, canvas, form, button, [hidden], [aria-hidden='true']";
const BLOCK = new Set(["H1", "H2", "H3", "H4", "H5", "H6", "P", "DIV", "UL", "OL", "IMG", "SECTION"]);
const converter = new NodeHtmlMarkdown({ bulletMarker: "-", codeBlockStyle: "fenced", maxConsecutiveNewlines: 2 });

function text(element: HTMLElement) {
  return element.textContent.replace(/\s+/g, " ").trim();
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
  const document = parse(html, { comment: false });
  const selectors = options.selector ? [options.selector] : ["main", "article", "body"];
  const root = selectors.map((selector) => document.querySelector(selector)).find(Boolean) ?? document;

  for (const element of root.querySelectorAll("[data-ai-ignore]")) element.remove();
  for (const element of root.querySelectorAll(DROP)) element.remove();

  const slots: string[] = [];
  for (const element of root.querySelectorAll("[data-ai-content]")) {
    slots.push(element.getAttribute("data-ai-content") ?? "");
    element.replaceWith(`<p>agentsideslot${slots.length - 1}x</p>`);
  }

  for (const list of root.querySelectorAll("dl")) {
    const items: string[] = [];
    for (const child of list.childNodes) {
      if (!("tagName" in child)) continue;
      const element = child as HTMLElement;
      if (element.tagName === "DT") items.push(`<li><strong>${escapeHtml(text(element))}</strong>`);
      else if (element.tagName === "DD" && items.length > 0) items[items.length - 1] += `: ${element.innerHTML}`;
    }
    list.replaceWith(`<ul>${items.map((item) => `${item}</li>`).join("")}</ul>`);
  }

  for (const card of root.querySelectorAll("a")) {
    const blocks = card.childNodes.filter((child): child is HTMLElement => "tagName" in child && BLOCK.has((child as HTMLElement).tagName));
    if (blocks.length === 0) continue;
    const heading = card.querySelector("h1, h2, h3, h4, h5, h6") ?? blocks[0];
    const title = heading ? text(heading) : text(card);
    heading?.remove();
    const rest = text(card);
    const href = escapeHtml(card.getAttribute("href") ?? "");
    card.replaceWith(`<p><a href="${href}">${escapeHtml(title)}</a>${rest ? `: ${escapeHtml(rest)}` : ""}</p>`);
  }

  if (options.siteUrl) {
    for (const link of root.querySelectorAll("a[href]")) absolutize(link, "href", options.siteUrl);
    for (const image of root.querySelectorAll("img[src]")) absolutize(image, "src", options.siteUrl);
  }

  let markdown = converter.translate(root.innerHTML);
  markdown = markdown
    .replace(/\)\[(?=[^\]]*\]\()/g, ") [")
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
