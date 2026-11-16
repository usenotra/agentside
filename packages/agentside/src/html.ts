import { type Element, find, findAll, hasClass, type Node, parse, remove, textContent } from "./dom.js";
import type { HtmlToMarkdownOptions } from "./types.js";

const HEADINGS = new Set(["h1", "h2", "h3", "h4", "h5", "h6"]);
const DROP = new Set(["script", "style", "noscript", "template", "svg", "iframe", "canvas", "form", "button", "nav", "head", "select", "input", "textarea", "object", "embed", "audio", "video", "dialog", "math"]);
const BLOCK = new Set([
  "address", "article", "aside", "blockquote", "body", "dd", "details", "dialog", "div", "dl", "dt", "fieldset",
  "figcaption", "figure", "footer", "h1", "h2", "h3", "h4", "h5", "h6", "header", "hgroup", "hr", "li", "main",
  "menu", "ol", "p", "pre", "section", "summary", "table", "ul", "tbody", "thead", "tfoot", "tr", "td", "th",
  "caption", "#root",
]);
const CARD_BLOCKS = new Set(["h1", "h2", "h3", "h4", "h5", "h6", "p", "div", "ul", "ol", "section", "article", "header", "footer"]);
const CELL_ROLES = new Set(["cell", "gridcell", "rowheader", "columnheader"]);

interface Context {
  readonly siteUrl: string | undefined;
}

function isAriaTable(element: Element) {
  const role = element.attrs["role"];
  return role === "table" || role === "grid";
}

function isCard(element: Element) {
  if (element.tag !== "a" || !textContent(element).trim()) return false;
  let spans = 0;
  for (const child of findAll(element, () => true)) {
    if (CARD_BLOCKS.has(child.tag)) return true;
    if (child.tag === "span") spans++;
  }
  return spans >= 2;
}

const containsBlock = new WeakMap<Element, boolean>();

function hasBlockContent(element: Element): boolean {
  const cached = containsBlock.get(element);
  if (cached !== undefined) return cached;
  const result = element.children.some(
    (child) => child.type === "element" && (BLOCK.has(child.tag) || (child.tag !== "a" && hasBlockContent(child)))
  );
  containsBlock.set(element, result);
  return result;
}

function isBlock(node: Node): node is Element {
  if (node.type !== "element") return false;
  if (BLOCK.has(node.tag) || isAriaTable(node) || isCard(node)) return true;
  return node.tag !== "a" && hasBlockContent(node);
}

function url(value: string | undefined, context: Context) {
  if (!value) return "";
  const trimmed = value.trim();
  const absolute =
    context.siteUrl && !trimmed.startsWith("#") && !/^[a-z][a-z0-9+.-]*:/i.test(trimmed)
      ? new URL(trimmed, context.siteUrl).href
      : trimmed;
  return absolute.replace(/ /g, "%20").replace(/\(/g, "%28").replace(/\)/g, "%29");
}

function collapse(value: string) {
  return value.replace(/[ \t\r\n\f\u00a0]+/g, " ");
}

function plain(node: Node): string {
  return collapse(textContent(node)).trim();
}

function spaced(node: Node): string {
  if (node.type !== "element") return node.type === "text" ? node.text : node.markdown;
  return node.children.map(spaced).join(" ").replace(/\s+/g, " ").trim();
}

function blockTexts(element: Element): string[] {
  const out: string[] = [];
  let pending = "";
  for (const child of element.children) {
    if (child.type === "element" && (CARD_BLOCKS.has(child.tag) || BLOCK.has(child.tag))) {
      if (pending.trim()) out.push(pending);
      pending = "";
      out.push(...blockTexts(child));
    } else {
      pending += ` ${child.type === "element" ? plain(child) : textContent(child)}`;
    }
  }
  if (pending.trim()) out.push(pending);
  return out.map((part) => collapse(part).trim()).filter(Boolean);
}

function codeSpan(value: string) {
  const longest = Math.max(0, ...(value.match(/`+/g) ?? []).map((run) => run.length));
  const fence = "`".repeat(longest + 1);
  const pad = value.startsWith("`") || value.endsWith("`") ? " " : "";
  return `${fence}${pad}${value}${pad}${fence}`;
}

function wrap(marker: string, inner: string) {
  const trimmed = inner.trim();
  if (!trimmed) return inner;
  const leading = /^\s/.test(inner) ? " " : "";
  const trailing = /\s$/.test(inner) ? " " : "";
  return `${leading}${marker}${trimmed}${marker}${trailing}`;
}

function inline(node: Node, context: Context): string {
  if (node.type === "text") return collapse(node.text).replace(/`/g, "\\`");
  if (node.type === "raw") return node.markdown;
  const children = () => node.children.map((child) => inline(child, context)).join("");
  switch (node.tag) {
    case "br":
      return "\n";
    case "strong":
    case "b":
      return wrap("**", children());
    case "em":
    case "i":
      return wrap("_", children());
    case "del":
    case "s":
    case "strike":
      return wrap("~~", children());
    case "code":
    case "kbd":
    case "samp":
      return codeSpan(collapse(textContent(node)));
    case "img": {
      const alt = collapse(node.attrs["alt"] ?? "").trim();
      return alt ? `![${alt.replace(/[[\]]/g, "\\$&")}](${url(node.attrs["src"], context)})` : "";
    }
    case "a": {
      const inner = children();
      const text = inner.replace(/\s*\n\s*/g, " ").trim();
      const href = node.attrs["href"];
      if (!href || !text) return inner;
      const leading = /^\s/.test(inner) ? " " : "";
      const trailing = /\s$/.test(inner) ? " " : "";
      return `${leading}[${text}](${url(href, context)})${trailing}`;
    }
    default:
      return isBlock(node) ? ` ${children()} ` : children();
  }
}

function escapeLineStart(line: string) {
  return line.replace(/^(\s*)([-+>]\s|#{1,6}\s)/, "$1\\$2");
}

function paragraph(value: string) {
  return value
    .split("\n")
    .map((line) => escapeLineStart(line.replace(/ {2,}/g, " ").trim()))
    .filter((line, index, lines) => line || (index > 0 && lines[index - 1]))
    .join("\n")
    .trim();
}

function inlineText(element: Element, context: Context) {
  return paragraph(element.children.map((child) => inline(child, context)).join("")).replace(/\n+/g, " ");
}

interface Row {
  readonly header: boolean;
  readonly cells: readonly string[];
}

function table(rows: readonly Row[]) {
  const width = Math.max(0, ...rows.map((row) => row.cells.length));
  if (width === 0) return [];
  const headerIndex = rows.findIndex((row) => row.header);
  const head = rows[Math.max(0, headerIndex)];
  const body = rows.filter((row) => row !== head);
  const line = (cells: readonly string[]) =>
    `|${Array.from({ length: width }, (_, index) => (cells[index] ? ` ${cells[index]} ` : " ")).join("|")}|`;
  return [[line(head?.cells ?? []), line(Array.from({ length: width }, () => "---")), ...body.map((row) => line(row.cells))].join("\n")];
}

function cell(element: Element, context: Context) {
  return inlineText(element, context).replace(/\|/g, "\\|");
}

function closestTable(node: Element) {
  let current = node.parent;
  while (current && current.tag !== "table") current = current.parent;
  return current;
}

function htmlTable(element: Element, context: Context) {
  const rows = findAll(element, (node) => node.tag === "tr" && closestTable(node) === element).map((row): Row => {
    const cells = row.children.filter((child): child is Element => child.type === "element" && (child.tag === "td" || child.tag === "th"));
    return {
      header: cells.length > 0 && (row.parent?.tag === "thead" || cells.every((node) => node.tag === "th")),
      cells: cells.map((node) => cell(node, context)),
    };
  });
  return table(rows);
}

function ariaTable(element: Element, context: Context) {
  const rows = findAll(element, (node) => node.attrs["role"] === "row").map((row): Row => {
    const cells = findAll(row, (node) => CELL_ROLES.has(node.attrs["role"] ?? ""));
    return {
      header: cells.length > 0 && cells.every((node) => node.attrs["role"] === "columnheader"),
      cells: cells.map((node) => cell(node, context)),
    };
  });
  return table(rows);
}

const LINE_CLASS = /(?:^|\s)line(?:\s|$)/;
const BLOCK_LINE_CLASS = /(?:^|\s)(?:line|block)(?:\s|$)/;

function codeBlock(element: Element) {
  const code = find(element, (node) => node.tag === "code") ?? element;
  const language =
    element.attrs["data-language"] ??
    /(?:^|\s)(?:language|lang)-([\w+#-]+)/.exec(`${code.attrs["class"] ?? ""} ${element.attrs["class"] ?? ""}`)?.[1] ??
    "";
  const raw = textContent(code);
  const marked = findAll(element, (node) => hasClass(node, LINE_CLASS) || "data-line" in node.attrs);
  const children = code.children.filter((child): child is Element => child.type === "element");
  const blockLines =
    children.length > 1 &&
    code.children.every((child) => child.type === "element" || !textContent(child).trim()) &&
    children.every((child) => child.tag === "div" || hasClass(child, BLOCK_LINE_CLASS));
  const body = raw.includes("\n")
    ? raw.replace(/^\n/, "").replace(/\n$/, "")
    : marked.length > 1
      ? marked.map(textContent).join("\n")
      : blockLines
        ? children.map(textContent).join("\n")
        : raw;
  const longest = Math.max(2, ...(body.match(/^`{3,}/gm) ?? []).map((run) => run.length));
  const fence = "`".repeat(longest + 1);
  return `${fence}${language}\n${body}\n${fence}`;
}

function definitionList(element: Element, context: Context) {
  const items: string[] = [];
  for (const node of findAll(element, (child) => child.tag === "dt" || child.tag === "dd")) {
    let owner = node.parent;
    while (owner && owner !== element && owner.tag !== "dl") owner = owner.parent;
    if (owner !== element) continue;
    const value = blocks(node, context).join("\n").replace(/\n/g, "\n  ");
    if (node.tag === "dt") items.push(`- **${value}**`);
    else if (items.length > 0) items[items.length - 1] += `${items[items.length - 1]?.endsWith("**") ? ": " : "; "}${value}`;
  }
  return items.length > 0 ? [items.join("\n")] : [];
}

function cardParts(element: Element) {
  return element.children.map((child) => (child.type === "element" ? spaced(child) : plain(child))).filter(Boolean);
}

function pickTitle(element: Element, parts: readonly string[]) {
  const children = element.children.filter((child) => child.type === "element" || textContent(child).trim());
  if (children.length !== parts.length) return 0;
  const byClass = children.findIndex((child) => child.type === "element" && hasClass(child, /title|heading|name/i));
  if (byClass !== -1) return byClass;
  const time = children.findIndex(
    (child) => child.type === "element" && (child.tag === "time" || Boolean(find(child, (node) => node.tag === "time")))
  );
  return time === 0 && parts.length > 1 ? 1 : 0;
}

function card(element: Element, context: Context) {
  const href = url(element.attrs["href"], context);
  const heading = find(element, (node) => HEADINGS.has(node.tag));
  if (heading) {
    const title = plain(heading);
    remove(heading);
    return [`${"#".repeat(Number(heading.tag[1]))} [${title}](${href})`, ...blockTexts(element)];
  }
  const sections = blockTexts(element);
  const parts = sections.length > 1 ? sections : cardParts(element);
  const index = pickTitle(element, parts);
  const rest = parts.filter((_, position) => position !== index);
  return [`[${parts[index] ?? ""}](${href})${rest.length > 0 ? `: ${rest.join(" ")}` : ""}`];
}

function list(element: Element, context: Context): string[] {
  const ordered = element.tag === "ol";
  let number = Number.parseInt(element.attrs["start"] ?? "1", 10) || 1;
  const items: string[] = [];
  for (const child of element.children) {
    if (child.type !== "element") continue;
    const content = child.tag === "li" ? blocks(child, context) : block(child, context);
    if (content.length === 0) continue;
    const marker = ordered ? `${number++}. ` : "- ";
    const indent = " ".repeat(marker.length);
    items.push(
      content
        .join("\n")
        .split("\n")
        .map((line, index) => (index === 0 ? marker + line : line ? indent + line : line))
        .join("\n")
    );
  }
  return items.length > 0 ? [items.join("\n")] : [];
}

function block(element: Element, context: Context): string[] {
  const verbatim = element.attrs["data-ai-content"];
  if (verbatim !== undefined) return verbatim.trim() ? [verbatim.trim()] : [];
  if (isAriaTable(element)) return ariaTable(element, context);
  if (isCard(element)) return card(element, context);
  if (HEADINGS.has(element.tag)) {
    const text = inlineText(element, context).replace(/^\\(?=#)/, "");
    return text ? [`${"#".repeat(Number(element.tag[1]))} ${text}`] : [];
  }
  switch (element.tag) {
    case "ul":
    case "ol":
    case "menu":
      return list(element, context);
    case "pre":
      return [codeBlock(element)];
    case "table":
      return htmlTable(element, context);
    case "dl":
      return definitionList(element, context);
    case "hr":
      return ["---"];
    case "blockquote": {
      const inner = blocks(element, context).join("\n\n");
      return inner ? [inner.split("\n").map((line) => (line ? `> ${line}` : ">")).join("\n")] : [];
    }
    default:
      return blocks(element, context);
  }
}

function blocks(element: Element, context: Context): string[] {
  const out: string[] = [];
  let buffer = "";
  const flush = () => {
    const text = paragraph(buffer);
    if (text) out.push(text);
    buffer = "";
  };
  for (const child of element.children) {
    if (isBlock(child)) {
      flush();
      out.push(...block(child, context));
    } else {
      buffer += inline(child, context);
    }
  }
  flush();
  return out;
}

function shouldDrop(element: Element) {
  if (DROP.has(element.tag)) return true;
  if ("data-ai-ignore" in element.attrs || "hidden" in element.attrs) return true;
  if (element.attrs["aria-hidden"] === "true") return true;
  return element.tag === "img" && !(element.attrs["alt"] ?? "").trim();
}

function prepare(element: Element) {
  element.children = element.children.filter((child) => child.type !== "element" || !shouldDrop(child));
  for (const child of element.children) {
    if (child.type !== "element") continue;
    const content = child.attrs["data-ai-content"];
    if (content === undefined) prepare(child);
    else child.children = [{ type: "raw", markdown: content, parent: child }];
  }
}

const COMPOUND = /^([a-z][\w-]*)?((?:#[\w-]+|\.[\w-]+|\[[\w-]+(?:=(?:"[^"]*"|'[^']*'|[^\]]*))?\])*)$/i;
const PART = /#([\w-]+)|\.([\w-]+)|\[([\w-]+)(?:=(?:"([^"]*)"|'([^']*)'|([^\]]*)))?\]/g;

function matcher(selector: string): (element: Element) => boolean {
  const compound = COMPOUND.exec(selector.trim());
  if (!compound || !selector.trim()) {
    throw new Error(`agentside: unsupported selector "${selector}". Use a tag, #id, .class or [attribute], optionally combined like main.content, or a comma-separated list of them.`);
  }
  const tag = compound[1]?.toLowerCase();
  const checks = [...(compound[2] ?? "").matchAll(PART)].map((part): ((element: Element) => boolean) => {
    const [, id, className, attribute, double, single, bare] = part;
    if (id) return (element) => element.attrs["id"] === id;
    if (className) {
      const pattern = new RegExp(`(?:^|\\s)${className}(?:\\s|$)`);
      return (element) => hasClass(element, pattern);
    }
    const expected = double ?? single ?? bare;
    const name = (attribute ?? "").toLowerCase();
    return (element) => name in element.attrs && (expected === undefined || element.attrs[name] === expected);
  });
  return (element) => (!tag || element.tag === tag) && checks.every((check) => check(element));
}

function select(document: Element, selector: string | undefined) {
  const alternatives = (selector ?? "main, article, body").split(",").map(matcher);
  for (const matches of alternatives) {
    const found = find(document, matches);
    if (found) return found;
  }
  return undefined;
}

export function htmlToMarkdown(html: string, options: HtmlToMarkdownOptions = {}): string {
  const document = parse(html);
  const root = select(document, options.selector) ?? document;
  const hasHeading = Boolean(find(root, (node) => node.tag === "h1"));
  prepare(root);
  let markdown = blocks(root, { siteUrl: options.siteUrl })
    .join("\n\n")
    .replace(/\)\[(?=[^\]]*\]\()/g, ") [")
    .replace(/(\S)\[ +(?=[^\]]*\]\()/g, "$1 [");

  if (!hasHeading) {
    const title = find(document, (node) => node.tag === "h1") ?? find(document, (node) => node.tag === "title");
    const text = title ? plain(title) : "";
    if (text) markdown = `# ${text}\n\n${markdown}`;
  }
  return `${markdown.trim()}\n`;
}

export function readMeta(html: string) {
  const document = parse(html);
  const main = find(document, (node) => node.tag === "main") ?? find(document, (node) => node.tag === "article");
  const heading = (main && find(main, (node) => node.tag === "h1")) ?? find(document, (node) => node.tag === "h1");
  const title = heading ?? find(document, (node) => node.tag === "title");
  const description = find(document, (node) => node.tag === "meta" && node.attrs["name"] === "description");
  return { title: title ? plain(title) : "", description: description?.attrs["content"]?.trim() ?? "" };
}
