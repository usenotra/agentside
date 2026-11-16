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
const IMPLIED_END = new Map<string, { readonly closes: readonly string[]; readonly scope: readonly string[] }>(Object.entries({
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
}));

const NAMED = new Map(
  "AElig:198,Aacute:193,Acirc:194,Agrave:192,Alpha:913,Aring:197,Atilde:195,Auml:196,Beta:914,Ccedil:199,Chi:935,Dagger:8225,Delta:916,ETH:208,Eacute:201,Ecirc:202,Egrave:200,Epsilon:917,Eta:919,Euml:203,Gamma:915,Iacute:205,Icirc:206,Igrave:204,Iota:921,Iuml:207,Kappa:922,Lambda:923,Mu:924,Ntilde:209,Nu:925,OElig:338,Oacute:211,Ocirc:212,Ograve:210,Omega:937,Omicron:927,Oslash:216,Otilde:213,Ouml:214,Phi:934,Pi:928,Prime:8243,Psi:936,Rho:929,Scaron:352,Sigma:931,THORN:222,Tau:932,Theta:920,Uacute:218,Ucirc:219,Ugrave:217,Upsilon:933,Uuml:220,Xi:926,Yacute:221,Yuml:376,Zeta:918,aacute:225,acirc:226,acute:180,aelig:230,agrave:224,alefsym:8501,alpha:945,amp:38,and:8743,ang:8736,aring:229,asymp:8776,atilde:227,auml:228,bdquo:8222,beta:946,brvbar:166,bull:8226,cap:8745,ccedil:231,cedil:184,cent:162,chi:967,circ:710,clubs:9827,cong:8773,copy:169,crarr:8629,cup:8746,curren:164,dArr:8659,dagger:8224,darr:8595,deg:176,delta:948,diams:9830,divide:247,eacute:233,ecirc:234,egrave:232,empty:8709,emsp:8195,ensp:8194,epsilon:949,equiv:8801,eta:951,eth:240,euml:235,euro:8364,exist:8707,fnof:402,forall:8704,frac12:189,frac14:188,frac34:190,frasl:8260,gamma:947,ge:8805,gt:62,hArr:8660,harr:8596,hearts:9829,hellip:8230,iacute:237,icirc:238,iexcl:161,igrave:236,image:8465,infin:8734,int:8747,iota:953,iquest:191,isin:8712,iuml:239,kappa:954,lArr:8656,lambda:955,lang:9001,laquo:171,larr:8592,lceil:8968,ldquo:8220,le:8804,lfloor:8970,lowast:8727,loz:9674,lrm:8206,lsaquo:8249,lsquo:8216,lt:60,macr:175,mdash:8212,micro:181,middot:183,minus:8722,mu:956,nabla:8711,nbsp:160,ndash:8211,ne:8800,ni:8715,not:172,notin:8713,nsub:8836,ntilde:241,nu:957,oacute:243,ocirc:244,oelig:339,ograve:242,oline:8254,omega:969,omicron:959,oplus:8853,or:8744,ordf:170,ordm:186,oslash:248,otilde:245,otimes:8855,ouml:246,para:182,part:8706,permil:8240,perp:8869,phi:966,pi:960,piv:982,plusmn:177,pound:163,prime:8242,prod:8719,prop:8733,psi:968,quot:34,rArr:8658,radic:8730,rang:9002,raquo:187,rarr:8594,rceil:8969,rdquo:8221,real:8476,reg:174,rfloor:8971,rho:961,rlm:8207,rsaquo:8250,rsquo:8217,sbquo:8218,scaron:353,sdot:8901,sect:167,shy:173,sigma:963,sigmaf:962,sim:8764,spades:9824,sub:8834,sube:8838,sum:8721,sup:8835,sup1:185,sup2:178,sup3:179,supe:8839,szlig:223,tau:964,there4:8756,theta:952,thetasym:977,thinsp:8201,thorn:254,tilde:732,times:215,trade:8482,uArr:8657,uacute:250,uarr:8593,ucirc:251,ugrave:249,uml:168,upsih:978,upsilon:965,uuml:252,weierp:8472,xi:958,yacute:253,yen:165,yuml:255,zeta:950,zwj:8205,zwnj:8204,apos:39,AMP:38,LT:60,GT:62,QUOT:34,COPY:169,REG:174"
    .split(",")
    .map((entry): [string, string] => {
      const [name = "", code = "0"] = entry.split(":");
      return [name, String.fromCodePoint(Number(code))];
    })
);

const LEGACY = new Set(["amp", "lt", "gt", "quot", "nbsp", "copy", "reg", "AMP", "LT", "GT", "QUOT"]);

export function decodeEntities(value: string, attribute = false): string {
  if (!value.includes("&")) return value;
  return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]*)(;?)/gi, (match, entity: string, semicolon: string, offset: number) => {
    if (entity[0] === "#") {
      const code = entity[1] === "x" || entity[1] === "X" ? Number.parseInt(entity.slice(2), 16) : Number.parseInt(entity.slice(1), 10);
      return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match;
    }
    const decoded = NAMED.get(entity);
    if (decoded === undefined) return match;
    if (semicolon) return decoded;
    const next = value[offset + match.length] ?? "";
    if (!LEGACY.has(entity) || (attribute && /[=a-z0-9]/i.test(next))) return match;
    return decoded;
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
    if (!value) return;
    const decoded = decodeEntities(value);
    // Comments (e.g. React's `<!-- -->` between interpolations) split one run of text into several nodes.
    const last = current().children.at(-1);
    if (last?.type === "text") last.text += decoded;
    else append({ type: "text", text: decoded, parent: null });
  };
  const lastIndex = (tag: string) => {
    for (let index = stack.length - 1; index > 0; index--) if (stack[index]?.tag === tag) return index;
    return -1;
  };
  const closeTo = (index: number) => {
    stack.length = Math.max(1, index);
  };
  const open = (tag: string) => {
    if (CLOSES_P.has(tag)) {
      const index = lastIndex("p");
      if (index > 0 && !stack.slice(index).some((node) => node.tag === "button" || node.tag === "table")) closeTo(index);
    }
    const implied = IMPLIED_END.get(tag);
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
      const index = lastIndex(tag);
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
    const attrs: Record<string, string> = Object.create(null);
    const rest = body.slice(nameEnd);
    for (const match of rest.matchAll(ATTRIBUTE)) {
      const name = match[1]?.toLowerCase();
      if (name && !(name in attrs)) attrs[name] = decodeEntities(match[2] ?? match[3] ?? match[4] ?? "", true);
    }

    open(tag);
    const node = element(tag, attrs, null);
    append(node);
    if (VOID.has(tag) || body.endsWith("/")) continue;
    if (RAW_TEXT.has(tag)) {
      const closing = new RegExp(`</${tag}(?=[\\s/>]|$)`, "gi");
      closing.lastIndex = position;
      const close = closing.exec(html)?.index ?? -1;
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
