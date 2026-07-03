# BUILD DOC — Personal AI Answer Engine (v3, single-session autonomous build)

## 0. Execution contract (Claude Code — read first)

- This build completes in ONE session with minimal owner involvement. The owner
  has pre-approved the plan direction; optimize for autonomous completion.
- Read this entire file before proposing the plan. The plan must map to the
  phases in §12 and use subagents as specified there.
- Decisions in §2 are LOCKED. §9 non-goals are a hard fence.
- §11 lists pre-authorized fallback decisions — take them silently when
  triggered. Do NOT stop to ask the owner anything that §11 or the
  OWNER-RUNBOOK already covers. Only interrupt for: missing env values, or a
  blocker with no listed fallback.
- Dev machine: Windows 10 + PowerShell. No unix-only commands in npm scripts.
  All owner-facing steps live in OWNER-RUNBOOK.md, not here.

## 1. What we're building

Single-user AI answer engine: question → live web search → streamed answer
with inline numbered citations and a sources panel → follow-ups in-thread →
threads persist.

Design principles:
1. **Model/search agnostic by construction** — exactly two vendor-aware
   modules (`lib/llm.ts`, `lib/search.ts`). Nothing else imports provider SDKs.
2. **Logic/skin separation** — a later design-only session will restyle the
   app without touching logic. All visual identity lives in design tokens and
   component markup (§8, §13).
3. **Modular for future work** — pipeline, data, UI, and auth are separate
   modules with typed contracts frozen before parallel work begins.

## 2. Locked decisions

| Area        | Decision                                                              |
|-------------|-----------------------------------------------------------------------|
| Framework   | Next.js (App Router) + TypeScript                                     |
| Styling     | Tailwind + shadcn/ui + AI Elements; ALL color/type via CSS-var tokens |
| Markdown    | Streamdown for streaming markdown                                     |
| Database    | Supabase Postgres, server-side only; schema applied by `scripts/migrate.ts` over `DATABASE_URL` (owner never pastes SQL) |
| Search      | Behind `lib/search.ts`; v1 impl: Tavily (`advanced`, 8 results)       |
| LLM         | Behind `lib/llm.ts`, AI SDK provider registry (§4)                    |
| Default model | `anthropic` / `claude-sonnet-4-6`                                   |
| Env         | Zod-validated at boot; fail fast with readable errors                 |
| Auth        | Password gate middleware (signed httpOnly cookie, 30d). No accounts.  |
| Repo        | Create + push with `gh` CLI (already authenticated on this machine)   |
| Deploy      | Vercel via CLI in API-key mode; env pushed with `vercel env add`      |
| Secrets     | `ACCESS_PASSWORD` + `COOKIE_SECRET` auto-generated into `.env` and echoed at session end |
| Thread titles | Truncated first question (no extra LLM call)                        |

Verify current AI SDK / provider idioms against the AI SDK docs and
https://docs.claude.com/en/api/overview rather than assuming from training.

## 3. Reference repos — context, not codebase

Clone into `reference/` (gitignored). Never import/copy code.

1. **Morphic** — `git clone https://github.com/miurla/morphic reference/morphic`
   STUDY: model registry pattern (`public/config/models.json` → AI SDK
   providers) for §4; search-provider abstraction for `lib/search.ts`;
   citation/sources UI. IGNORE: Redis, generative UI, Supabase Auth, Docker.
2. **Perplexica** — `git clone https://github.com/ItzCrazyKns/Perplexica reference/perplexica`
   STUDY: synthesis prompt structure (how citations are demanded/formatted).
   IGNORE: everything else.

Timebox reference study to ~10 minutes total (one subagent may do this in
parallel with scaffolding and report findings to the main agent).

## 4. LLM abstraction (model-agnostic core)

`lib/llm.ts` exports `getModel()` → AI SDK `LanguageModel`. Env-driven:

```
LLM_PROVIDER=anthropic | openai | google | openrouter | openai-compatible
LLM_MODEL=<model id>
LLM_BASE_URL=<only for openai-compatible>
LLM_API_KEY=<key; dummy allowed for local endpoints>
```

- `openai-compatible` + `LLM_BASE_URL` covers Ollama, LM Studio, gateways,
  and local subscription bridges with zero code changes.
- Same model for synthesis and query rewrite. No provider imports elsewhere.

## 5. Subscription mode (config-only; nothing to build)

Post-build option, owner-side only: run a community bridge exposing Claude
Code's authenticated session as an OpenAI-compatible localhost endpoint
(prefer Agent-SDK-based bridges, e.g. Meridian, over OAuth-extraction ones),
then set `LLM_PROVIDER=openai-compatible`, `LLM_BASE_URL=http://localhost:<port>/v1`.
Constraints: localhost only; Vercel deploy stays on API keys; draws from
subscription limits; owner verifies Anthropic's current policy. Claude Code
must NOT install, bundle, or auto-start any bridge in this build.

## 6. Core pipeline (per query)

1. `POST /api/chat` receives `{ threadId?, question }`.
2. If thread has history: one small LLM call rewrites the follow-up into a
   standalone search query (log it in dev). First question skips this.
3. `search(query)` → up to 8 normalized `{ title, url, content }`. Tavily
   types never leak outside `lib/search.ts`.
4. Context block: sources numbered `[1]`..`[8]` (title, URL, content) →
   conversation history → user question.
5. Stream synthesis. System prompt requires: markdown; concise; inline bare
   `[n]` citations tied to numbered sources; every factual claim cited; no
   fabricated citations; explicitly flag thin/conflicting sources.
6. Sources array is sent to the client as a data part BEFORE token streaming
   begins.
7. On finish (server): persist thread + user msg + assistant msg + sources in
   one transaction.

## 7. Data model (3 tables — applied by scripts/migrate.ts)

```sql
create table if not exists threads (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  created_at timestamptz not null default now()
);

create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references threads(id) on delete cascade,
  role text not null check (role in ('user','assistant')),
  content text not null,
  created_at timestamptz not null default now()
);

create table if not exists sources (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references messages(id) on delete cascade,
  position int not null,
  title text,
  url text not null,
  snippet text
);
```

Server routes use the service-role key only; it never reaches the client
bundle. No RLS in v1 (no browser DB access). Migration runner uses `pg` over
`DATABASE_URL`, is idempotent, and is invoked in Phase 2.

## 8. Routes & UI

Routes:
- `/` — centered query input + recent threads (title, relative time)
- `/t/[id]` — thread view: Q/A turns, per-answer sources row, follow-up input
  pinned bottom
- `POST /api/chat` — streaming endpoint per §6; creates thread on first
  message, returns id in stream data
- `/gate` — password form; middleware redirects here without valid cookie

UI (functional pass — a design session restyles later):
- Build conversation surface from AI Elements (message, prompt input,
  sources, inline citation) restyled minimally; render streams with Streamdown.
- STRICT token rule: zero hardcoded colors/fonts/radii in components. Only
  semantic Tailwind classes backed by CSS variables in `app/globals.css`
  (shadcn token model). Ship a neutral near-monochrome dark theme as default.
- Sources: horizontal row of compact cards (favicon via
  `https://www.google.com/s2/favicons?domain={domain}`, domain, truncated
  title), rendered before text streams. `[n]` → superscript chips linking to
  the matching card.
- States: skeleton cards during search; streaming cursor; inline error card on
  search/LLM failure (never a blank page).

## 9. Non-goals (v1) — hard fence

No accounts/multi-user · no model-selector UI (env only) · no focus modes ·
no image/video panels · no file upload/doc Q&A · no suggested follow-ups ·
no bundled local models / SearXNG / bridge auto-start · no multi-hop deep
research · no sharing/export/history-search · no rate limiting beyond gate ·
no aesthetic polish beyond the token system (deferred to design session)

## 10. Environment

```
LLM_PROVIDER=anthropic
LLM_MODEL=claude-sonnet-4-6
LLM_API_KEY=
LLM_BASE_URL=                 # only for openai-compatible
TAVILY_API_KEY=
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
DATABASE_URL=                 # Supabase session-pooler URI, for migrations
ACCESS_PASSWORD=              # auto-generate if blank
COOKIE_SECRET=                # auto-generate if blank
```

Zod-validate at boot (`LLM_BASE_URL` required only for openai-compatible).
Ship `.env.example` fully commented, including a subscription-mode example
block. Owner fills values per OWNER-RUNBOOK §1 before the session.

## 11. Pre-authorized decisions (take silently; do not ask the owner)

1. AI Elements install/API friction > ~20 min → drop it; hand-roll minimal
   chat markup with shadcn primitives per §8 contract.
2. Streamdown friction → `react-markdown` + `remark-gfm` with a custom `[n]`
   chip renderer.
3. Tavily request failure → retry once, then inline error card.
4. Vercel deploy blocked (auth/quota) → finish everything local, print exact
   remaining deploy commands at session end for the owner.
5. Any npm package version conflict → pick the nearest stable combination;
   note it in README.
6. Windows path/script issues → fix with cross-platform scripts (`node`
   scripts over shell scripts).
7. Anything ambiguous but low-stakes → choose the simpler option, log it in
   README "Decisions" section.

## 12. Execution plan — phases & subagents

**Phase 0 — Contracts (main agent, sequential, ~15 min).**
Scaffold Next.js + Tailwind + shadcn (+ AI Elements attempt). Create folder
layout; write `lib/types.ts` (SearchResult, Source, StreamDataParts,
ThreadMeta), zod env schema, and stub modules with exported signatures +
TODOs. `gh repo create` + initial commit. CONTRACTS ARE FROZEN after this
phase; only the main agent may amend them.

**Phase 1 — Parallel subagents (strict file ownership; no agent touches
files outside its lane; all code must compile against Phase-0 contracts).**
- **Agent A — pipeline:** `lib/llm.ts`, `lib/search.ts`, `lib/pipeline.ts`,
  `scripts/smoke.ts` (CLI: one query end-to-end, prints answer + sources).
- **Agent B — data:** `lib/db/*`, `migrations/001_init.sql`,
  `scripts/migrate.ts` (idempotent, `pg` over `DATABASE_URL`).
- **Agent C — ui:** `app/(app)/*` pages, `components/*`, `app/globals.css`
  tokens; develops against a mocked stream fixture so it has zero dependency
  on A/B; obeys the §8 token rule.
- **Agent D — gate:** `middleware.ts`, `app/gate/*`, cookie signing util.
- **Agent E — recon (optional, cheap):** skims `reference/` repos and reports
  the Morphic provider-registry and Perplexica prompt findings to the main
  agent before A starts synthesis prompt work.

**Phase 2 — Integration (main agent, sequential).**
Run `scripts/migrate.ts`. Wire `POST /api/chat` = pipeline + persistence.
Swap Agent C's mock for the real stream. Run `scripts/smoke.ts`, then a full
browser pass. Fix until green.

**Phase 3 — Verification & ship.**
Spawn a **verification subagent** that executes §14 checklist item-by-item
and reports pass/fail with evidence. Main agent fixes fails. Then: `vercel`
deploy + `vercel env add` for all production vars (API-key mode), final
commit/push, write `DESIGN.md` (§13) and README (run, deploy, decisions,
subscription-mode note). Print for the owner: app URL, local URL,
ACCESS_PASSWORD, and any §11.4 leftovers.

Subagent rules: parallelize Phase 1 in one wave; each agent self-verifies
(typecheck + its own unit of proof) before reporting; merge conflicts are a
main-agent failure — prevent them via file ownership, don't resolve them.

## 13. Design handoff (write DESIGN.md at session end)

DESIGN.md must contain, concretely:
- Token inventory: every CSS variable in `app/globals.css` with its role
- Component inventory: each component file + one-line purpose + screenshot
  instructions (`npm run dev`, which routes to look at)
- The restyle contract: a design session may edit ONLY `app/globals.css`,
  component markup/classNames, and static assets. It must not touch `lib/`,
  `app/api/`, `middleware.ts`, or any contract in `lib/types.ts`.
- Suggested opening prompt for the design session (one paragraph, provided).

## 14. Acceptance criteria (verification subagent runs these)

- [ ] Fresh question → streamed cited answer, ≥4 sources, ~10s
- [ ] `[n]` chips link to correct source cards
- [ ] Follow-up uses thread context (rewritten query logged in dev)
- [ ] Hard refresh of `/t/[id]` restores full exchange; home lists threads
- [ ] Gate: wrong password blocks; correct grants 30-day cookie
- [ ] Provider swap: pointing `LLM_PROVIDER=openai-compatible` at any local
      OpenAI-compatible endpoint requires zero code changes (verify config
      path parses; live test only if an endpoint is available)
- [ ] Zero hardcoded colors in `components/` (grep check)
- [ ] `npm run build` clean; no console errors in a normal session
- [ ] Deployed on Vercel in API-key mode (or §11.4 fallback printed)
- [ ] DESIGN.md and README written; secrets echoed to owner

## 15. v1.1 parking lot (do not build)

Model-selector UI · suggested follow-ups · image results · second search
provider · sharing/export (Obsidian handoff) · real auth · usage dashboard ·
scheduled digests → Kosmos pipeline
