import type { ExchangeLine } from "../types/landing";

export const INSTALL_COMMAND = "npm install @usenotra/agentside";

export const BROWSER_EXCHANGE: readonly ExchangeLine[] = [
  ["req", "GET /pricing"],
  ["head", "Accept: text/html"],
  ["head", "User-Agent: Mozilla/5.0 (Macintosh) Safari/605.1.15"],
  ["gap", ""],
  ["status", "200 OK"],
  ["head", "Content-Type: text/html; charset=utf-8"],
  ["mark", 'Link: </pricing.md>; rel="alternate"; type="text/markdown"'],
  ["head", "Vary: Accept"],
  ["gap", ""],
  ["body", "<!doctype html>"],
  ["body", '<html lang="en">'],
  ["body", "  <head>"],
  ["body", "    <title>Pricing</title>"],
  ["body", '    <link rel="stylesheet" href="/assets/app.css" />'],
  ["body", "  </head>"],
  ["body", "  <body>"],
  ["body", '    <div id="app">'],
];

export const AGENT_EXCHANGE: readonly ExchangeLine[] = [
  ["req", "GET /pricing"],
  ["head", "Accept: */*"],
  ["mark", "User-Agent: GPTBot/1.2"],
  ["gap", ""],
  ["status", "200 OK"],
  ["mark", "Content-Type: text/markdown; charset=utf-8"],
  ["head", "X-Markdown-Tokens: 212"],
  ["head", "Vary: Accept, User-Agent"],
  ["gap", ""],
  ["body", "# Pricing"],
  ["body", ""],
  ["body", "Acme sends invoices your customers actually pay."],
  ["body", ""],
  ["body", "| Plan    | Price         | Invoices  |"],
  ["body", "| ------- | ------------- | --------- |"],
  ["body", "| Starter | $0 a month    | 20        |"],
  ["body", "| Team    | $49 a month   | Unlimited |"],
];
