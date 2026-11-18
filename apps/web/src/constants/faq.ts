import type { FaqItem } from "../types/landing";

export const FAQ_ITEMS: readonly FaqItem[] = [
  {
    question: "Which frameworks does Agentside run in?",
    answer:
      "The handler takes a standard Request and returns a standard Response, so it runs in TanStack Start, Astro, Hono, Next.js middleware, Bun and Workers, and the docs have a guide for each of them.",
  },
  {
    question: "Do I have to write the markdown by hand?",
    answer:
      "You can skip that step on a static site, because prerenderHtml reads every built .html file, converts the main element to markdown and writes the result next to the page. When you pass an llms option, the same call also writes llms.txt and llms-full.txt for the whole site.",
  },
  {
    question: "What changes for people who visit in a browser?",
    answer:
      "Browsers get your HTML page untouched, and when a twin exists the response carries a Link header that points agents at the markdown version of the same URL.",
  },
  {
    question: "How does Agentside recognise an AI agent?",
    answer:
      "It matches the user agent against a built-in list that includes GPTBot, ClaudeBot and PerplexityBot, and it tags each match with a vendor and a purpose. A client that is missing from the list still gets markdown when it sends Accept: text/markdown or requests a .md URL.",
  },
  {
    question: "Do I need to know Effect to use it?",
    answer:
      "The default import is a plain function that takes a Request, so you can use Agentside without writing any Effect code. Teams that want the Effect program and its typed errors can import them from @usenotra/agentside/effect.",
  },
  {
    question: "How do I move over from Dualmark?",
    answer:
      "The migration guide in the docs maps a Dualmark route handler and middleware to Agentside routes and a single handle call, which removes the rewrite, the internal /md route and generateStaticParams.",
  },
  {
    question: "What does Agentside cost?",
    answer:
      "Agentside is free and open source under the MIT license, and you install it from npm as @usenotra/agentside.",
  },
];
