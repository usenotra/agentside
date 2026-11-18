import type { FooterColumn, NavLink } from "../types/landing";
import { BENCHMARKS_URL, DOCS_URL, GITHUB_URL, NOTRA_URL, NPM_URL } from "./site";

export const ANNOUNCEMENT = {
  label: "Agentside now converts your built HTML to markdown and writes llms.txt for you",
} as const;

export const NAV_LINKS: readonly NavLink[] = [
  { label: "Features", href: "#features" },
  { label: "Benchmarks", href: "#benchmarks" },
  { label: "FAQ", href: "#faq" },
  { label: "GitHub", href: GITHUB_URL },
];

export const FOOTER_COLUMNS: readonly FooterColumn[] = [
  {
    heading: "Docs",
    links: [
      { label: "Quickstart", href: `${DOCS_URL}/quickstart` },
      { label: "Routes and sources", href: `${DOCS_URL}/routes` },
      { label: "Content negotiation", href: `${DOCS_URL}/negotiation` },
      { label: "A/B variants", href: `${DOCS_URL}/variants` },
      { label: "Error handling", href: `${DOCS_URL}/error-handling` },
    ],
  },
  {
    heading: "Frameworks",
    links: [
      { label: "Next.js", href: `${DOCS_URL}/frameworks/nextjs` },
      { label: "Astro", href: `${DOCS_URL}/frameworks/astro` },
      { label: "TanStack Start", href: `${DOCS_URL}/frameworks/tanstack-start` },
      { label: "Hono", href: `${DOCS_URL}/frameworks/hono` },
      { label: "Workers and Bun", href: `${DOCS_URL}/frameworks/workers-and-bun` },
    ],
  },
  {
    heading: "Project",
    links: [
      { label: "GitHub", href: GITHUB_URL },
      { label: "npm", href: NPM_URL },
      { label: "Benchmark harness", href: BENCHMARKS_URL },
      { label: "Migrate from Dualmark", href: `${DOCS_URL}/migrating-from-dualmark` },
      { label: "Notra", href: NOTRA_URL },
    ],
  },
];
