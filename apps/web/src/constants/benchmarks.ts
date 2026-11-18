import type { BenchmarkRow, BenchmarkVendor } from "../types/landing";

export const BENCHMARK_VENDORS: readonly BenchmarkVendor[] = [
  { label: "Agentside", logo: "/logo.svg" },
  { label: "AI Inbx (homegrown)" },
  { label: "Dualmark by Dodo Payments", logo: "/dodo-payments.svg" },
];

/** The first cell of each row is Agentside, which wins every scenario. */
export const BENCHMARK_ROWS: readonly BenchmarkRow[] = [
  { scenario: "Agent gets a markdown page, cached", cells: ["2.76 µs", "2.89 µs", "38.1 µs (no cache)"] },
  { scenario: "Agent gets a markdown page, cache off", cells: ["16.2 µs", "3.3 ms", "38.1 µs"] },
  { scenario: "Agent detection", cells: ["~50 ns", "160 to 240 ns", "~500 ns"] },
  { scenario: "Browser request getting HTML", cells: ["1.40 µs", "20.5 µs", "2.03 µs"] },
  { scenario: "Agent hits a page whose render throws", cells: ["Serves the HTML page", "500", "Request throws"] },
  {
    scenario: "Agent hits a page with no markdown version",
    cells: [
      "Serves the HTML page",
      { before: "HTML page, or 406 for ", code: "Accept: text/markdown", after: " alone" },
      "404",
    ],
  },
  {
    scenario: "Prerender twins to static files",
    cells: [
      { code: "agentside/build", after: ", fails the build on errors" },
      "Yes, fails the build on errors",
      "Next.js static params only",
    ],
  },
];
