import type { Agent, AgentPurpose } from "./types.js";

const AGENTS: readonly (readonly [token: string, name: string, vendor: string, purpose: AgentPurpose])[] = [
  ["chatgpt-user", "ChatGPT-User", "OpenAI", "user-action"],
  ["oai-searchbot", "OAI-SearchBot", "OpenAI", "search"],
  ["gptbot", "GPTBot", "OpenAI", "training"],
  ["claude-user", "Claude-User", "Anthropic", "user-action"],
  ["claude-searchbot", "Claude-SearchBot", "Anthropic", "search"],
  ["claudebot", "ClaudeBot", "Anthropic", "training"],
  ["claude-web", "Claude-Web", "Anthropic", "user-action"],
  ["anthropic-ai", "Anthropic-ai", "Anthropic", "training"],
  ["perplexity-user", "Perplexity-User", "Perplexity", "user-action"],
  ["perplexitybot", "PerplexityBot", "Perplexity", "search"],
  ["mistralai-user", "MistralAI-User", "Mistral", "user-action"],
  ["google-extended", "Google-Extended", "Google", "training"],
  ["googleother", "GoogleOther", "Google", "training"],
  ["applebot-extended", "Applebot-Extended", "Apple", "training"],
  ["meta-externalagent", "Meta-ExternalAgent", "Meta", "training"],
  ["meta-externalfetcher", "Meta-ExternalFetcher", "Meta", "user-action"],
  ["duckassistbot", "DuckAssistBot", "DuckDuckGo", "search"],
  ["youbot", "YouBot", "You.com", "search"],
  ["cohere-ai", "cohere-ai", "Cohere", "training"],
  ["amazonbot", "Amazonbot", "Amazon", "training"],
  ["bytespider", "Bytespider", "ByteDance", "training"],
  ["ccbot", "CCBot", "Common Crawl", "training"],
  ["diffbot", "Diffbot", "Diffbot", "training"],
  ["imagesiftbot", "ImagesiftBot", "ImageSift", "training"],
  ["omgilibot", "Omgilibot", "Webz.io", "training"],
];

const BY_TOKEN = new Map<string, Agent>(
  AGENTS.map(([token, name, vendor, purpose]) => [token, { name, vendor, purpose }])
);

const PATTERN = new RegExp(AGENTS.map(([token]) => token.replace(/[.*+?^${}()|[\]\\-]/g, "\\$&")).join("|"), "i");

export function detectAgent(userAgent: string | null | undefined): Agent | null {
  if (!userAgent) return null;
  const match = PATTERN.exec(userAgent);
  return match ? (BY_TOKEN.get(match[0].toLowerCase()) ?? null) : null;
}

export const KNOWN_AGENTS: readonly Agent[] = [...BY_TOKEN.values()];
