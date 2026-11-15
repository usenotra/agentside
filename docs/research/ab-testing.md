# A/B testing what agents read

Status: research draft, November 2026. Per-agent variants already ship in `@usenotra/agentside` (see "What exists today"). Everything after that section is a proposal.

## The question we want to answer

GEO and AEO teams change a page and hope the answers from ChatGPT, Claude, Perplexity and the rest get better. Today they ship the change for everyone and compare answers before and after, which mixes the edit with model updates, index refreshes, competitor changes and plain sampling noise. We want a way to say "this edit moved the answer, and here is by how much" or "this edit made it worse, roll it back".

Agentside sits in front of every markdown request an agent makes, so it can decide which version of a page each agent gets. That makes it the natural place to run the experiment.

## Is this cloaking?

Cloaking in SEO means showing a search crawler different content from what a human sees in order to rank for something the page doesn't deliver. Search engines penalise it because the person who clicks through gets something else.

Serving agents markdown is a different situation, and it's now normal practice. `llms.txt`, `Accept: text/markdown` and `.md` twins are widely adopted, several CDNs convert pages to markdown for agents automatically, and agent vendors ask for it because it's cheaper to read. The content is the same page in a different format, so nobody is misled.

An A/B test pushes one step further: two agents can read slightly different copy. We think that's fine under these guardrails, and the SDK should make them the default:

1. Both variants must be true. Testing wording, structure, ordering, headings or how much detail a section gives is fair. Showing one engine a lower price than the one you'll actually charge is not.
2. Never vary what classic search crawlers get. Agentside's agent list doesn't include Googlebot or Bingbot, and it should stay that way. (`Google-Extended` is a robots.txt token rather than a real user agent, so it never matches a request; we keep it in the list only for parity.)
3. Experiments end. Every experiment needs an end date, after which the winner becomes the only version.
4. Responses say what they are. Every markdown response carries `X-Agentside-Variant`, so the setup can be audited.

## How agents fetch, and why it matters for the design

Agents fetch pages for three reasons, and only some of them can show an effect within an experiment's lifetime.

| Purpose | Examples | Effect on answers | Usable for A/B? |
| --- | --- | --- | --- |
| `user-action` | ChatGPT-User, Claude-User, Perplexity-User, MistralAI-User | The page is fetched while the answer is written and quoted right away | Yes. This is the clean signal. |
| `search` | OAI-SearchBot, Claude-SearchBot, PerplexityBot | Feeds the engine's own index, which answers read later | Yes, with lag. The index can keep the old version for days. |
| `training` | GPTBot, ClaudeBot, CCBot | Shows up in a future model months later | No |

So the experiments that give answers within days are the ones aimed at user-action fetchers, with search bots kept on the same variant so the index doesn't contradict the live fetch.

## What exists today

`variants` lets a route serve a different source to selected agents:

```ts
import { agentside, remote } from "@usenotra/agentside";

const md = agentside({
  routes: {
    "/pricing": () => buildPricingMarkdown(),
  },
  variants: {
    "/pricing": [
      { id: "pricing-b", vendors: ["OpenAI"], source: remote("https://cms.example.com/pricing-b.md") },
    ],
  },
  onServe: (event) => exposures.push(event),
});
```

- The first variant whose `agents`, `vendors` or `purposes` match the request wins, otherwise the route's own source (`control`) is served.
- A source can be inline markdown, a local function or a `remote()` URL, so a local site can test against a remote draft without redeploying.
- If a variant fails (CMS down, timeout, 5xx) the agent gets `control`, and `onError` is told. A broken experiment never breaks the page.
- `onServe` emits an exposure event per markdown response: path, variant, agent, whether it came from cache and how long it took.
- Cache keys include the variant, so variants never leak into each other.

That covers "show ChatGPT this and Claude that". It doesn't yet cover splitting one engine's traffic, storing experiments outside the code or measuring the outcome.

## Experiment designs

### 1. Vendor split (works today)

OpenAI agents get B and everyone else gets A. It's simple, but the engines differ in more ways than the variant: different models, indexes and retrieval. A difference between ChatGPT's and Claude's answers says little on its own.

Make it a crossover instead. Week 1 OpenAI gets B and Anthropic gets A, week 2 they swap. Compare each engine with itself across the two weeks (difference in differences). Model and index differences cancel out, and what's left is the variant's effect plus whatever changed between the weeks.

### 2. Switchback

Every agent gets the same variant, alternating on a fixed schedule (for example every 6 hours, in a randomised order). Compare answers collected in A windows with answers collected in B windows. This works well for user-action fetchers, which read the page live. Search indexes lag, so either exclude search-bot traffic from the switch (keep them on control) or use windows of several days.

### 3. Per-request split

Each user-action fetch is randomly assigned A or B with a sticky hash (for example, the hash of the agent name, the path and the hour, so retries inside one answer see the same page). This gives the most data per day, but it needs a way to link the fetch to the answer it produced. You only get that when you're the one asking the question, which leads to measurement.

## Measuring the outcome

The SDK sees fetches and the answers happen inside the engines, so measurement has to ask the engines. That's what Notra's GEO prompt runs already do: run a fixed prompt set against each engine on a schedule and score every answer for mention, position, citation, sentiment and factual accuracy (for example, did it state the right price).

Joining the two:

1. Exposure log: `onServe` events (timestamp, path, variant, agent) go to a sink, such as Notra's ingest endpoint or the user's own backend.
2. Answer log: every prompt run records the engine, the timestamp, the answer, its scores and the URLs it cited.
3. The join: for user-action engines, an answer that cites the page within a few seconds of a fetch from that engine is attributed to that fetch's variant. For switchback and crossover designs, attribution is by time window and no per-fetch join is needed.

Answers are noisy, so the sample sizes are real. To detect a lift in "mentions us" from 40% to 50% with 80% power at a 5% significance level you need about 390 answers per arm. That's 20 prompts asked 20 times per arm, which a scheduled prompt run can collect in a few days. The report should show the confidence interval rather than a yes or no, and say plainly when there isn't enough data yet.

The outcome is not always "more mentions". It's equally useful to learn that a rewrite made an engine misstate a price or drop a citation. That's the "does this negatively affect it" case, and it's why every experiment should track factual accuracy alongside visibility.

## Local and hosted modes

The user asked for a local version and a normal version. The proposal is one `ExperimentStore` service in Effect with two implementations.

**Local.** Experiments live in code or a JSON file in the repo (`agentside.experiments.json`). Exposures go to a callback or to stdout. No account, no network. Good for trying it out and for teams that already have analytics.

**Hosted, or bring your own backend.** The store is an HTTP endpoint that implements two calls:

- `GET /experiments?path=/pricing` returns the active variants for a path, cached in memory for a short TTL so a backend outage only freezes the current assignment and never blocks a page.
- `POST /exposures` accepts batched `onServe` events.

Notra would be the first implementation of that endpoint (which also links exposures to GEO prompt runs), but the contract is open so anyone can point agentside at their own backend.

### The "give it two blog posts" flow

```sh
npx @usenotra/agentside ab create /blog/launch \
  --a ./posts/launch.md \
  --b ./posts/launch-shorter.md \
  --design crossover --engines openai,anthropic --days 14
```

It stores both versions (locally or in the hosted store), prints the schedule ("days 1 to 7: ChatGPT gets B, Claude gets A; days 8 to 14: swapped") and, in hosted mode, sets up the matching prompt runs. When it ends it reports the winner with an interval and offers to make the winner permanent.

### Proposed API shape

```ts
const md = agentside({
  routes,
  experiments: agentside.store.http({ url: "https://api.example.com/agentside", token }),
  // or agentside.store.file("./agentside.experiments.json")
  exposures: agentside.sink.http({ url: "https://api.example.com/agentside/exposures" }),
});
```

## Pitfalls to design for

- CDN caching. Markdown responses must carry `Vary: Accept, User-Agent` (agentside sets this), and a CDN that ignores `Vary` needs the variant in its cache key or a `private` cache policy on experimented paths.
- Engine-side caching. Search indexes and some user-action fetchers reuse cached copies. Switchback windows shorter than that cache are measuring the cache.
- Agent spoofing. A user agent string can be faked. For experiments that's noise rather than a security issue, and verified-bot IP ranges can be added later if the noise matters.
- Retries inside one answer. One answer can fetch a page several times, so assignment has to be sticky within a short window or one answer sees both variants.
- Ethics drift. The guardrails above should be enforced in code where they can be (no Googlebot variants, a required end date) and documented where they can't (both variants must be true).

## Roadmap

1. Shipped: per-agent variants, local and remote sources, fallback to control, exposure events.
2. Next: weighted per-request splits with sticky hashing, crossover and switchback schedules, a required end date.
3. Then: `ExperimentStore` and exposure sinks (memory, file, HTTP), plus the CLI.
4. Then: the Notra integration that links exposures to GEO prompt runs and reports results.
5. Separately: build-time HTML to markdown for pages that don't have a hand-written twin.
