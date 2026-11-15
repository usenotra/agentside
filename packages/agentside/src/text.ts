const REPLACEMENTS: Record<string, string> = {
  "​": "", "‌": "", "‍": "", "﻿": "", "️": "", "⃣": "", "­": "",
  " ": " ", " ": " ", " ": " ",
  "‐": "-", "‑": "-", "–": "-", "—": "--",
  "‘": "'", "’": "'", "‚": "'", "ʼ": "'", "ʻ": "'",
  "“": '"', "”": '"', "„": '"', "«": '"', "»": '"',
  "…": "...", "•": "-", "·": "-", "→": "->", "←": "<-",
  "×": "x", "÷": "/", "≈": "~=", "≥": ">=",
  "¢": "c", "₹": "INR ", "€": "EUR ", "£": "GBP ", "¥": "JPY ",
  "₩": "KRW ", "₽": "RUB ", "₺": "TRY ", "₨": "Rs.", "֏": "AMD ",
  "₼": "AZN ", "৳": "BDT ", "₡": "CRC ", "₾": "GEL ", "₪": "ILS ",
  "₸": "KZT ", "₦": "NGN ", "₱": "PHP ", "฿": "THB ",
};

const PATTERN = new RegExp(`[${Object.keys(REPLACEMENTS).join("")}]|[\\u{1D5D4}-\\u{1D607}\\u{1D7EC}-\\u{1D7F5}]`, "gu");
const FAST_CHECK = /[^\x00-\x7F]/;

function replace(char: string) {
  const mapped = REPLACEMENTS[char];
  if (mapped !== undefined) return mapped;
  const code = char.codePointAt(0) ?? 0;
  if (code >= 0x1d7ec) return String.fromCharCode(code - 0x1d7ec + 48);
  if (code >= 0x1d5ee) return String.fromCharCode(code - 0x1d5ee + 97);
  return String.fromCharCode(code - 0x1d5d4 + 65);
}

export function normalizeUnicode(text: string): string {
  return FAST_CHECK.test(text) ? text.replace(PATTERN, replace) : text;
}

export function estimateTokens(text: string): number {
  let count = 0;
  let inWord = false;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    const space = c === 32 || (c >= 9 && c <= 13);
    if (!space && !inWord) count++;
    inWord = !space;
  }
  return count;
}

export function toMarkdownPath(pathname: string): string {
  if (pathname.endsWith(".md")) return pathname;
  const trimmed = pathname.replace(/\/+$/, "");
  return trimmed === "" ? "/index.md" : `${trimmed}.md`;
}

export function toPagePath(pathname: string): string {
  const stripped = pathname.replace(/\.md$/, "").replace(/\/+$/, "");
  return stripped === "" || stripped === "/index" ? "/" : stripped;
}
