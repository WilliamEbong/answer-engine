# Answer Engine

Single-user AI answer engine: ask a question → live web search (Tavily) →
streamed markdown answer with inline `[n]` citations and a sources panel →
follow-ups in-thread → threads persist (Supabase). Password-gated, deployed on
Vercel. Built per `BUILD.md`; design handoff in `DESIGN.md`.

Includes the **Explainer Engine** (`EXPLAINER-BUILD.md`): a verification-first
pipeline that turns source material into the same content independently
written at three reading levels (beginner / intermediate / advanced), with key
takeaways, honest limitations, and a machine-checkable QA report — delivered
only if every claim verifies against the input (fail-closed; a structured
rejection is a valid output). Reachable via "Explain deeper" on any answered
thread, the `/explain` paste-in page, or the CLI.

## Stack

Next.js (App Router, TS) · Tailwind v4 + shadcn/ui + AI Elements · Vercel AI
SDK v6 (provider registry) · Tavily search · Supabase Postgres · Streamdown.

Model/search agnostic by construction: only `lib/llm.ts` and `lib/search.ts`
know provider SDKs. Everything else is typed contracts (`lib/types.ts`).

## Run locally

```bash
cp .env.example .env    # fill in values (see comments in the file)
npm install
npm run migrate         # idempotent; applies migrations/ over DATABASE_URL
npm run dev             # http://localhost:3000 → /gate → password from .env
```

Useful:

```bash
npm run smoke -- "your question"   # CLI: one query end-to-end (search + cited answer)
npm run build                      # production build
npm run explain -- --in fixtures/explainer/rich-input.md --out .tmp/explainer
                                   # CLI explainer job: file(s) in → artifact JSON + markdown out
npm run explainer:gates            # §11 gate tests G1–G5 (real LLM calls, ~$1 at default tiers)
```

## Configuration

All env is Zod-validated at boot (`lib/env.ts`) — missing/malformed values fail
fast with a readable error. See `.env.example` for full documentation of:

- `LLM_PROVIDER` / `LLM_MODEL` / `LLM_API_KEY` / `LLM_BASE_URL` — any of
  `anthropic | openai | google | openrouter | openai-compatible` with any model
  id; swapping providers is config-only, zero code changes.
- `LLM_MODEL_SMALL` / `LLM_MODEL_MID` / `LLM_MODEL_STRONG` — optional explainer
  model tiers (compile/self-check = small, writers/QA-A = mid, design/QA-B =
  strong); every tier falls back to `LLM_MODEL` when unset.
- `TAVILY_API_KEY`, `DATABASE_URL`; `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`
  (optional — required only for the v1 thread store; the explainer module runs
  on `pg` over `DATABASE_URL` alone).
- `ACCESS_PASSWORD`, `COOKIE_SECRET` — the password gate (signed httpOnly
  cookie, 30 days).

### Subscription mode (optional, config-only)

You can point the app at a community bridge that exposes an authenticated
Claude Code session as an OpenAI-compatible localhost endpoint (prefer
Agent-SDK-based bridges, e.g. Meridian, over OAuth-extraction ones):

```
LLM_PROVIDER=openai-compatible
LLM_MODEL=<model id the bridge exposes>
LLM_API_KEY=local
LLM_BASE_URL=http://localhost:<port>/v1
```

Constraints: localhost only; the Vercel deployment stays on API keys; usage
draws from your subscription limits; verify Anthropic's current policy first.
Nothing in this repo installs or starts a bridge.

## Deploy (Vercel)

```bash
vercel                              # link/deploy (API-key mode: VERCEL_TOKEN)
# push every var from .env:
vercel env add LLM_PROVIDER production   # …repeat per var, or use the CLI loop
vercel --prod
```

`npm run migrate` must have been run once against the production
`DATABASE_URL` (same Supabase project → already done if you migrated locally).

## Architecture

```
POST /api/chat  { threadId?, question }
  ├─ middleware: signed-cookie gate (401 for API, /gate redirect for pages)
  ├─ lib/pipeline.ts
  │    ├─ follow-up? → rewrite to standalone query (small LLM call, logged in dev)
  │    ├─ lib/search.ts → Tavily REST, 8 results → numbered sources
  │    └─ synthesis streamText: cite-every-claim [n] prompt, history as turns
  ├─ stream: data-thread part → data-sources part → tokens   (AI SDK v6 UI stream)
  └─ onFinish: thread + user msg + assistant msg + sources, atomically
               (plpgsql insert_exchange via supabase-js rpc)
```

- DB schema: `migrations/001_init.sql` (threads / messages / sources).
  Migrations run over `pg` + `DATABASE_URL`; runtime queries use supabase-js
  with the service-role key, server-only.
- UI: `components/chat/` renders the stream — sources row before text,
  `[n]` → superscript chips anchored to source cards, skeleton/streaming/error
  states. Thread titles are the truncated first question (no extra LLM call).

### Explainer Engine (`lib/explainer/`)

```
POST /api/explainer/jobs                { sourceMaterial | threadId, config?, jobId? }
  └─ threadId path: from-thread.ts bridge → enrich() (Tavily Extract + fetch
     fallback) → source_material   (retrieval happens HERE — never inside the engine)
POST /api/explainer/jobs/[id]/advance   runs exactly ONE wave; client polls to terminal
  W1 compile → self-check   (input gate: thin material ⇒ rejected_input + what-to-add report)
  W2 instructional design   (per-level objectives/outline/takeaways/limitations)
  W3 writers ×3 in parallel (independent per level; inviolable no-outside-facts rule)
  W4 QA-A ×3                (4-dimension editorial pass; ≤1 correction cycle)
  W5 QA-B ×3 + assemble     (claim-by-claim source comparison; any unsupported or
                             distorted claim ⇒ rejected_qa with the claim table)
```

- State machine: `received → briefing_ready | rejected_input → designed →
  drafted → qa_a_complete → approved | rejected_qa` (+ resumable `error`).
  Checkpointed per wave in `explainer_jobs` (`migrations/002_explainer.sql`);
  completed waves are never re-run or re-billed; same `job_id` resubmission
  returns the existing job untouched.
- All explainer DB access is `pg` over `DATABASE_URL` (`lib/explainer/db.ts`);
  every stage emits schema-validated JSON (zod) with one validation-error
  retry (`lib/explainer/run.ts`); usage (tokens/model/ms) recorded per stage.
- Cost: a full 3-level job is 11 LLM calls (≈ $0.15–0.40 at the default tier
  mapping, input-size dependent); `npm run explainer:gates` runs ~24 calls.
  Run jobs at $0 through the subscription bridge (below) via the CLI.

## Decisions log

1. **AI SDK pinned to the v6 line** (`ai@^6`, `@ai-sdk/react@^3`, providers
   `@3`/openai-compatible `@2`): `ai@7` shipped mid-build, but
   `@openrouter/ai-sdk-provider` peer-requires `ai@^6` (§11.5 nearest stable
   combination).
2. **Atomic persistence via a plpgsql function** (`insert_exchange`) called
   through `supabase.rpc`: supabase-js has no client transactions; the SQL
   function body runs in one implicit transaction (§6.7) while runtime stays on
   supabase-js per §7.
3. **Client-generated `useChat` id**: passing `id: undefined` to AI SDK v6's
   `useChat` recreates an empty Chat instance every render (present-but-
   undefined key). The chat surface generates a stable client id; the
   server-generated thread id travels separately via the `data-thread` part.
4. **Thread id minted server-side at request start** and sent in the stream
   before tokens, so the URL can swap to `/t/{id}` mid-stream
   (`history.replaceState` — no remount).
5. **No sampling params anywhere** (`temperature`/`top_p`/`top_k`):
   `claude-sonnet-5` rejects non-default sampling params (HTTP 400). Output
   budgets are generous instead (8192 synthesis / 1024 rewrite).
6. **AI Elements installed wholesale** (conversation/message in use); unused
   components kept — they're tree-shaken out of the bundle and available to the
   design session.
7. **Explainer data layer on `pg` over `DATABASE_URL`** (owner decision,
   supersedes EXPLAINER-BUILD.md §6's "same pattern as v1 tables"):
   `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` are now optional in the env
   schema and needed only by the v1 thread store. jsonb params are passed as
   `JSON.stringify(...)::jsonb` (node-pg serializes bare JS arrays as Postgres
   array literals, not JSON).
8. **Structured output = plain text → JSON.parse → zod** with one
   validation-error retry (EXPLAINER-BUILD.md §9.2 pre-authorized fallback) —
   no `generateObject`, keeping `lib/llm.ts` the only vendor-aware module and
   sampling params untouched.
9. **G1's verbatim check uses the spec's ≥3-verbatim-figures bar**, not
   all-figures-verbatim: compilers occasionally attach units when the source
   elides them ("14.2 minutes" for "median 14.2 vs 14.9 minutes"), which is a
   faithful restatement, not a fabrication. Non-verbatim figures are logged
   informationally; Stage 0.5's code floor enforces the same ≥3 bar.
10. **`from-thread.ts` lives under `lib/explainer/` yet calls `enrich()`**:
   it is the host-app bridge from EXPLAINER-BUILD.md §4's own architecture
   diagram — enrichment runs before job submission. The §12 "engine performs
   zero retrieval" grep excludes this one file; stages and orchestrator import
   no fetch/search code.
11. **Unattended E2E evidence is HTTP-level** (dev server driven with a signed
   session cookie: job lifecycle, page markup, gate 401s) — the interactive
   browser pass was not possible in the owner's absence.
12. **QA-B distortion boundary calibrated to "misleading", not "reworded"**:
   early gate runs rejected faithful plain-language paraphrases (e.g. "steps
   requiring more physical coordination" for "steps rated as high motor
   complexity") as distorted. The spec defines distorted as correct fact with
   MISLEADING framing, so the prompt now states the test explicitly (would the
   reader believe anything materially different?) while writers are told to
   reuse briefing wording for measures/subgroups/timepoints. Genuine
   violations (invented mechanisms, unlicensed superlatives, altered figures)
   still fail — G3 proves the gatekeeper catches injected false claims.

## v1.1 parking lot (BUILD.md §15 — not built)

Model-selector UI · suggested follow-ups · image results · second search
provider · sharing/export · real auth · usage dashboard · scheduled digests.
