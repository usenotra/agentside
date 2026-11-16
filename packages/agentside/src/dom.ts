export interface Element {
  readonly type: "element";
  readonly tag: string;
  readonly attrs: Record<string, string>;
  children: Node[];
  parent: Element | null;
}

export interface Text {
  readonly type: "text";
  text: string;
  parent: Element | null;
}

export interface Raw {
  readonly type: "raw";
  readonly markdown: string;
  parent: Element | null;
}

export type Node = Element | Text | Raw;

const VOID = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr"]);
const RAW_TEXT = new Set(["script", "style", "textarea", "title", "noscript", "template", "xmp", "iframe", "svg", "math"]);
const CLOSES_P = new Set([
  "address", "article", "aside", "blockquote", "details", "div", "dl", "fieldset", "figcaption", "figure", "footer",
  "form", "h1", "h2", "h3", "h4", "h5", "h6", "header", "hgroup", "hr", "main", "menu", "nav", "ol", "p", "pre",
  "section", "table", "ul",
]);
const IMPLIED_END: Record<string, { readonly closes: readonly string[]; readonly scope: readonly string[] }> = {
  li: { closes: ["li"], scope: ["ul", "ol", "menu"] },
  dt: { closes: ["dt", "dd"], scope: ["dl"] },
  dd: { closes: ["dt", "dd"], scope: ["dl"] },
  tr: { closes: ["tr", "td", "th"], scope: ["table", "thead", "tbody", "tfoot"] },
  td: { closes: ["td", "th"], scope: ["tr", "table"] },
  th: { closes: ["td", "th"], scope: ["tr", "table"] },
  thead: { closes: ["thead", "tbody", "tfoot", "tr", "td", "th"], scope: ["table"] },
  tbody: { closes: ["thead", "tbody", "tfoot", "tr", "td", "th"], scope: ["table"] },
  tfoot: { closes: ["thead", "tbody", "tfoot", "tr", "td", "th"], scope: ["table"] },
  option: { closes: ["option"], scope: ["select", "datalist"] },
};

const NAMED: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", copy: "©", reg: "®", trade: "™",
  hellip: "…", mdash: "—", ndash: "–", lsquo: "‘", rsquo: "’", sbquo: "‚", ldquo: "“", rdquo: "”", bdquo: "„",
  laquo: "«", raquo: "»", middot: "·", bull: "•", times: "×", divide: "÷", euro: "€", pound: "£", yen: "¥",
  cent: "¢", deg: "°", plusmn: "±", para: "¶", sect: "§", shy: "­", zwj: "‍", zwnj: "‌",
  larr: "←", rarr: "→", uarr: "↑", darr: "↓", harr: "↔", check: "✓", hearts: "♥", star: "☆", frac12: "½",
  frac14: "¼", frac34: "¾", sup2: "²", sup3: "³", micro: "µ", thinsp: " ", ensp: " ", emsp: " ",
  auml: "ä", ouml: "ö", uuml: "ü", Auml: "Ä", Ouml: "Ö", Uuml: "Ü", szlig: "ß", eacute: "é", egrave: "è",
  aacute: "á", agrave: "à", ccedil: "ç", ntilde: "ñ", oacute: "ó", iacute: "í", uacute: "ú",
};

export function decodeEntities(value: string): string {
  if (!value.includes("&")) return value;
  return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]*);?/gi, (match, entity: string) => {
    if (entity[0] === "#") {
      const code = entity[1] === "x" || entity[1] === "X" ? Number.parseInt(entity.slice(2), 16) : Number.parseInt(entity.slice(1), 10);
      return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match;
    }
    return NAMED[entity] ?? match;
  });
}

const ATTRIBUTE = /([^\s"'>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;

function element(tag: string, attrs: Record<string, string>, parent: Element | null): Element {
  return { type: "element", tag, attrs, children: [], parent };
}

export function parse(html: string): Element {
  const root = element("#root", {}, null);
  const stack: Element[] = [root];
  const current = () => stack[stack.length - 1] ?? root;
  const append = (node: Node) => {
    const parent = current();
    node.parent = parent;
    parent.children.push(node);
  };
  const text = (value: string) => {
    if (value) append({ type: "text", text: decodeEntities(value), parent: null });
  };
  const closeTo = (index: number) => {
    stack.length = Math.max(1, index);
  };
  const open = (tag: string) => {
    if (CLOSES_P.has(tag)) {
      const index = stack.findLastIndex((node) => node.tag === "p");
      if (index > 0 && !stack.slice(index).some((node) => node.tag === "button" || node.tag === "table")) closeTo(index);
    }
    const implied = IMPLIED_END[tag];
    if (implied) {
      for (let index = stack.length - 1; index > 0; index--) {
        const node = stack[index];
        if (!node || implied.scope.includes(node.tag)) break;
        if (implied.closes.includes(node.tag)) {
          closeTo(index);
          break;
        }
      }
    }
  };

  let position = 0;
  while (position < html.length) {
    const start = html.indexOf("<", position);
    if (start === -1) {
      text(html.slice(position));
      break;
    }
    if (start > position) text(html.slice(position, start));
    const next = html[start + 1];

    if (html.startsWith("<!--", start)) {
      const end = html.indexOf("-->", start + 4);
      position = end === -1 ? html.length : end + 3;
      continue;
    }
    if (next === "!" || next === "?") {
      const end = html.indexOf(">", start);
      position = end === -1 ? html.length : end + 1;
      continue;
    }
    if (next === "/") {
      const end = html.indexOf(">", start);
      if (end === -1) {
        text(html.slice(start));
        break;
      }
      const tag = html.slice(start + 2, end).trim().toLowerCase();
      const index = stack.findLastIndex((node) => node.tag === tag);
      if (index > 0) closeTo(index);
      position = end + 1;
      continue;
    }
    if (!next || !/[a-z]/i.test(next)) {
      text("<");
      position = start + 1;
      continue;
    }

    let end = start + 1;
    let quote = "";
    while (end < html.length) {
      const char = html[end];
      if (quote) {
        if (char === quote) quote = "";
      } else if (char === '"' || char === "'") quote = char;
      else if (char === ">") break;
      end++;
    }
    const body = html.slice(start + 1, end);
    position = end + 1;
    const nameEnd = body.search(/[\s/>]|$/);
    const tag = body.slice(0, nameEnd).toLowerCase();
    const attrs: Record<string, string> = {};
    const rest = body.slice(nameEnd);
    for (const match of rest.matchAll(ATTRIBUTE)) {
      const name = match[1]?.toLowerCase();
      if (name && !(name in attrs)) attrs[name] = decodeEntities(match[2] ?? match[3] ?? match[4] ?? "");
    }

    open(tag);
    const node = element(tag, attrs, null);
    append(node);
    if (VOID.has(tag) || body.endsWith("/")) continue;
    if (RAW_TEXT.has(tag)) {
      const close = html.toLowerCase().indexOf(`</${tag}`, position);
      const content = html.slice(position, close === -1 ? html.length : close);
      if (content) node.children.push({ type: "text", text: tag === "title" || tag === "textarea" ? decodeEntities(content) : content, parent: node });
      const after = close === -1 ? -1 : html.indexOf(">", close);
      position = after === -1 ? html.length : after + 1;
      continue;
    }
    stack.push(node);
  }
  return root;
}

export function textContent(node: Node): string {
  if (node.type === "text") return node.text;
  if (node.type === "raw") return node.markdown;
  let out = "";
  for (const child of node.children) out += textContent(child);
  return out;
}

export function* descendants(node: Element): Generator<Element> {
  for (const child of node.children) {
    if (child.type !== "element") continue;
    yield child;
    yield* descendants(child);
  }
}

export function find(node: Element, predicate: (element: Element) => boolean): Element | undefined {
  for (const element of descendants(node)) if (predicate(element)) return element;
  return undefined;
}

export function findAll(node: Element, predicate: (element: Element) => boolean): Element[] {
  const out: Element[] = [];
  for (const element of descendants(node)) if (predicate(element)) out.push(element);
  return out;
}

export function remove(node: Node) {
  const parent = node.parent;
  if (!parent) return;
  parent.children = parent.children.filter((child) => child !== node);
  node.parent = null;
}

export function hasClass(element: Element, pattern: RegExp) {
  return pattern.test(element.attrs["class"] ?? "");
}
