import type { Format } from "./types.js";

const HTML_TYPES = new Set(["text/html", "application/xhtml+xml"]);
const MARKDOWN_TYPES = new Set(["text/markdown", "text/x-markdown"]);
const MARKDOWN_ACCEPTED = /text\/(?:x-)?markdown(?!\s*;[^,]*\bq\s*=\s*0(?:\.0*)?\s*(?:[,;]|$))/i;

export function negotiateFormat(
  accept: string | null | undefined,
  mode: "q-value" | "contains" = "q-value"
): Format | null {
  if (!accept) return "html";
  if (mode === "contains" && MARKDOWN_ACCEPTED.test(accept)) return "markdown";
  if (!/markdown/i.test(accept) && !accept.includes("q=")) {
    return /html|\*\/\*|text\/\*/i.test(accept) ? "html" : null;
  }

  let html = -1;
  let markdown = -1;
  let htmlSpecific = false;
  let markdownSpecific = false;

  for (const range of accept.split(",")) {
    const [rawType = "", ...params] = range.split(";");
    const type = rawType.trim().toLowerCase();
    let q = 1;
    for (const param of params) {
      const [key, value] = param.split("=");
      if (key?.trim().toLowerCase() === "q") q = Math.min(1, Math.max(0, Number.parseFloat(value ?? "") || 0));
    }

    if (MARKDOWN_TYPES.has(type)) {
      if (!markdownSpecific || q > markdown) markdown = q;
      markdownSpecific = true;
    } else if (HTML_TYPES.has(type)) {
      if (!htmlSpecific || q > html) html = q;
      htmlSpecific = true;
    } else if (type === "*/*" || type === "text/*") {
      if (!markdownSpecific) markdown = Math.max(markdown, q);
      if (!htmlSpecific) html = Math.max(html, q);
    }
  }

  if (html <= 0 && markdown <= 0) return null;
  return markdown > html ? "markdown" : "html";
}
