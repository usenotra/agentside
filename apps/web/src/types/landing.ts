export type ExchangeLineKind = "req" | "head" | "gap" | "status" | "mark" | "body";
export type ExchangeLine = readonly [kind: ExchangeLineKind, text: string];

export interface NavLink {
  label: string;
  href: string;
}

export interface FooterColumn {
  heading: string;
  links: readonly NavLink[];
}

export type Vendor = "OpenAI" | "Anthropic" | "Perplexity" | "Google";

export interface VendorLogoProps {
  vendor: Vendor;
}

export interface Feature {
  title: string;
  body: string;
  frameTitle: string;
  frameSub: string;
  headers: readonly string[];
  /** Per column: render the cells in the monospace font. */
  mono: readonly boolean[];
  /** Index of a column of vendor names, which get the vendor logo inline. */
  vendorColumn?: number;
  rows: readonly (readonly string[])[];
}

export interface FaqItem {
  question: string;
  answer: string;
}

export interface CodeThemes {
  light: string;
  dark: string;
}

export interface BenchmarkVendor {
  label: string;
  logo?: string;
}

/** A plain cell, or a cell with an inline code span. */
export type BenchmarkCell = string | { before?: string; code: string; after?: string };

export interface BenchmarkRow {
  scenario: string;
  cells: readonly BenchmarkCell[];
}

export interface HttpExchangeProps {
  title: string;
  lines: readonly ExchangeLine[];
  /** Highlights the dot to mark the agent's side of the exchange. */
  agent?: boolean;
}

export interface FeatureCardProps {
  feature: Feature;
}

export interface CodeCardProps {
  title: string;
  code: string;
  lang: "ts" | "json";
}

export interface SplitRowProps {
  title: string;
  body: string;
  href: string;
  linkLabel: string;
}
