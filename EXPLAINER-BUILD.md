# EXPLAINER-BUILD.md — Explainer Engine module for the Answer Engine (single-session, n8n-free)

## 0. Execution contract (Claude Code — read first)

- This session adds the Explainer Engine as a module INSIDE the existing
  answer-engine repo (built from BUILD.md v3). It completes in ONE session
  with near-zero owner involvement.
- If `Explainer_Engine_Standalone_Spec.md` exists in the repo root, it is the
  normative behavioral spec; this document is its execution adapter. If
  absent, §3 of this document is a complete condensation — build from it.
- Decisions in §2 are LOCKED. §7 non-goals are a hard fence. §9 fallbacks are
  pre-authorized — take them silently. Only interrupt the owner for missing
  env values or a blocker with no listed fallback.
- Respect the existing repo's contracts: DESIGN.md restyle rules (token-only
  styling), `lib/llm.ts` / `lib/search.ts` as the only vendor-aware modules,
  zod-validated env, Windows 10 + PowerShell, no unix-only npm scripts.

## 1. What we're building

A verification-first explanation pipeline: given source material, produce the
same content independently written at three reading levels (beginner /
intermediate / advanced) with key takeaways, honest limitations, and a
machine-checkable QA report — delivered only if every claim verifies against
the input (fail-closed; rejection with reasons is a valid output).

Module boundary (critical): **the engine does not research.** Retrieval,
source selection, and content enrichment happen in the host app BEFORE job
submission. Inside `lib/explainer/`, no network calls except LLM calls.

Two consumption surfaces:
1. **"Explain deeper" on any answered thread** — the app enriches that
   thread's sources to full text and submits them as a job.
2. **Standalone `/explain` page** — paste material in, get an explainer out.

Plus a CLI form for local runs (pairs with subscription mode: a full job's
LLM calls cost $0 through the local bridge).

## 2. Locked decisions

| Area | Decision |
|------|----------|
| Runtime | Pure TypeScript stage functions in `lib/explainer/` — no n8n, no external workflow service, no queue vendor |
| Orchestration (deployed) | Client-driven state machine: `POST /api/explainer/jobs/[id]/advance` runs exactly one WAVE per invocation (§4); client polls until terminal |
| Orchestration (local) | `scripts/explain.ts` CLI loops the same waves in-process; file in → artifact out |
| Waves | W1 compile+self-check · W2 design · W3 writers ×N parallel · W4 QA-A ×N parallel · W5 QA-B ×N parallel + assembly (11 LLM calls at N=3, ~5 invocations) |
| Models | Tier mapping via env (§8): compile=SMALL, design=STRONG, writers=MID, QA-A=MID, QA-B=STRONG; every tier defaults to existing `LLM_MODEL`; all through `getModel()` |
| Structured output | Zod schema per stage; invalid JSON → one retry with the validation error appended → else wave status `error` (resumable) |
| State | `explainer_jobs` table in existing Supabase, applied by `scripts/migrate.ts` (migration 002) |
| Idempotency | Caller-supplied `job_id` (else generated); resubmission returns the existing job untouched |
| Enrichment | `enrich(sources)` added to `lib/search.ts` in Phase 0 (full-page content via Tavily Extract; fallback §9.1); called only by the thread→job bridge, never by the engine |
| UI | Token-only styling per DESIGN.md; level toggle tabs; job status stepper; QA report accordion |
| Levels | N configurable via `audiences[]` config; default 3 (beginner/intermediate/advanced) |

## 3. Engine behavior (normative condensation of the spec)

**Input contract.** A job = `source_material` (text blocks with roles:
`primary` — the document/paper text; `supporting` — press releases, notes,
prior analysis; `metadata` — title/authors/venue/date/link), optional
`config` (audiences, style_guide, strictness, max correction cycles),
optional `job_id`. No URLs fetched by the engine — content only.

**Stage 0 — Briefing Compiler (restructure only).** Normalize input into the
Research Briefing schema: core finding; context/why it matters; methods
summary; key results with figures quoted verbatim + their location in the
source; limitations & open questions; terminology; citation block. The
compiler may reorganize and condense, never add claims absent from input.

**Stage 0.5 — Briefing Self-Check (input gate).** Validate completeness: all
sections present, ≥3 verbatim-grounded figures/claims, limitations non-empty,
no internal contradictions. Failure ⇒ status `rejected_input` with a
structured report of exactly what's missing (so the caller knows what
material to add). This gate is what makes messy input safe to accept.

**Stage 1 — Instructional Design.** From briefing + audience profiles: per-
level learning objectives, outline, required takeaways, and which limitations
each level must include. One call.

**Stage 2 — Writers ×N (independent).** One pass per level against the
briefing + that level's design + style guide. Levels are written natively,
never summarized/expanded from each other. Analogies may vary by level;
factual claims may not exceed the briefing (no-outside-facts rule stated as
inviolable in the prompt).

**Stage 3 — QA-A ×N (combined pass).** Per level, one call scoring four
dimensions: factual fidelity to briefing, editorial quality vs style guide,
internal consistency, hype/bias. Returns `pass` or a corrected draft with a
change log. Hard max ONE correction cycle.

**Stage 4 — QA-B Source-Comparison Gatekeeper ×N (the authority).** Extract
every substantive claim from the final draft; verdict each against the
briefing: `supported | unsupported | distorted` (distorted = correct fact,
misleading framing — counts as failure) with cited briefing evidence. Any
non-supported claim fails that level; all levels must pass or the job is
`rejected_qa` with the claim-level report.

**Output artifact (approved jobs).** `levels[]` (per level: title, dek, body
markdown, key_takeaways[], limitations[]) · combined markdown with
`<!-- LEVEL:key -->` markers · `meta` (citation block, audiences used,
timestamps) · `qa_report` (per-level claim table, correction log, verdicts) ·
`usage` (tokens + est. cost per stage). Rejected jobs return only status +
the structured report.

**State machine.** `received → briefing_ready | rejected_input → designed →
drafted → qa_a_complete → approved | rejected_qa`, plus additive status
`error` (wave failure; `advance` retries that wave only — completed stages
are never re-run or re-billed).

**Prompt enforcement (every prompt must encode its rules).** Compiler:
restructure-only + verbatim figures w/ locations + mandatory limitations +
schema. Design: objectives derived only from briefing + explicit per-level
required claims/limitations. Writer: audience profile + inviolable
no-outside-facts + style guide + schema'd markdown. QA-A: four-dimension
rubric + corrected-draft-or-pass + change log. QA-B: exhaustive claim
extraction + per-claim verdict citing briefing evidence + distortion=failure
+ JSON verdict schema. All structured stages demand JSON-only output.

## 4. Architecture (no n8n)

```
lib/explainer/
  types.ts        # zod schemas: SourceMaterial, Config, Briefing, Design,
                  # Draft, QaAResult, QaBVerdicts, Artifact, JobRow, statuses
  run.ts          # callStage(tier, prompt, schema): validated-JSON LLM call
                  # w/ one schema-error retry; usage capture
  stages/
    compile.ts  selfcheck.ts  design.ts  write.ts  qaA.ts  qaB.ts  assemble.ts
  orchestrate.ts  # advance(job): runs the next wave (writers/QA waves via
                  # Promise.all), persists checkpoint, returns new status
  from-thread.ts  # bridge: thread → enrich(sources) → source_material
                  # (primary = enriched source texts; supporting = the
                  # thread's Q&A; metadata = title + citation list)
app/api/explainer/jobs/route.ts               # POST create (idempotent), GET list
app/api/explainer/jobs/[id]/route.ts          # GET status/artifact
app/api/explainer/jobs/[id]/advance/route.ts  # POST run next wave
app/(app)/explain/*                           # paste-in page + job list + job view
scripts/explain.ts                            # CLI: --in file(s) --out dir
scripts/explainer-gates.ts                    # §11 gate tests
migrations/002_explainer.sql
fixtures/explainer/{rich-input.md, thin-input.md}
```

Rules: nothing outside `lib/llm.ts`/`lib/search.ts` imports vendor SDKs;
nothing in `lib/explainer/` performs retrieval; `orchestrate.advance` is the
single write-path for job state; every wave fits comfortably in one
serverless invocation (parallelize within the wave, never across waves).

## 5. UI surfaces (functional pass; DESIGN.md token rules apply)

- **Thread action:** "Explain deeper" button on any answered thread → calls
  bridge → creates job → navigates to job view.
- **/explain:** textareas for primary/supporting/metadata + audience defaults
  → submit; below, recent jobs with status chips.
- **Job view:** stepper showing wave progress (client polls `advance` then
  status); on `approved` → level toggle tabs (beginner/intermediate/advanced)
  rendering body + takeaways + limitations, and a collapsible QA report
  (claim table with verdicts); on `rejected_input`/`rejected_qa` → the
  structured report rendered legibly with a "what to add" emphasis; on
  `error` → retry button (re-advance).

## 6. Data model (migration 002)

```sql
create table if not exists explainer_jobs (
  id text primary key,
  thread_id uuid references threads(id) on delete set null,
  config jsonb not null,
  source_material jsonb not null,
  status text not null check (status in (
    'received','briefing_ready','rejected_input','designed','drafted',
    'qa_a_complete','approved','rejected_qa','error')),
  briefing jsonb, design jsonb, drafts jsonb, qa_a jsonb, qa_b jsonb,
  artifact jsonb, qa_report jsonb,
  usage jsonb not null default '[]'::jsonb,
  last_error jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

Server-side access only, service-role key, same pattern as v1 tables.

## 7. Non-goals (this session) — hard fence

No n8n or external workflow/queue vendors · no standalone microservice
extraction (the in-app API is the HTTP form) · no PDF/file upload parsing
(paste text only) · no glossary stage (config key reserved, unbuilt) · no
scheduling, publishing, image handling, or CMS · no batch multi-document
jobs · no changes to the v1 answer pipeline beyond adding `enrich()` ·
no new auth (existing gate covers everything) · no aesthetic polish beyond
tokens

## 8. Env additions (all optional)

```
LLM_MODEL_SMALL=    # default: LLM_MODEL   e.g. claude-haiku-4-5-20251001
LLM_MODEL_MID=      # default: LLM_MODEL   e.g. claude-sonnet-4-6
LLM_MODEL_STRONG=   # default: LLM_MODEL   e.g. claude-sonnet-4-6
```

Extend the zod env schema; update `.env.example` with commented tier notes.
Unset ⇒ v1 behavior exactly (single model everywhere). Push to Vercel only
if the owner has set them.

## 9. Pre-authorized decisions (take silently)

1. Tavily Extract unavailable/friction → `enrich()` falls back to direct
   fetch + HTML-to-text (readability-style); paywalled/blocked pages keep
   their snippet and are marked `thin: true` — Stage 0.5 arbitrates.
2. Provider JSON-mode friction in `run.ts` → plain text completion +
   `JSON.parse` + zod validate (same retry rule).
3. A wave exceeds the invocation time budget on Vercel → orchestrator
   splits that wave per-level across advances (design supports it).
4. QA-B claim explosion on long drafts → cap at the 40 most substantive
   claims, note the cap in qa_report.
5. Correction ping-pong → hard one-cycle max (spec rule); still-failing
   level fails the job.
6. Fixture realism → synthesize `rich-input.md` (~1,200 words, ≥5 verbatim
   figures, explicit limitations, fake-but-plausible citation block) and
   `thin-input.md` (~100 vague words). Do not fetch real papers.
7. Anything ambiguous but low-stakes → simpler option; log in README
   "Decisions".

## 10. Execution plan — phases & subagents

**Phase 0 — Contracts (main agent).** Read spec + this doc. Write
`lib/explainer/types.ts` (ALL schemas + status enum + wave map), `run.ts`,
env tier extension, `migrations/002_explainer.sql`, `enrich()` in
`lib/search.ts`, fixtures, stage stubs with frozen signatures. Commit.
CONTRACTS FROZEN — only main agent may amend.

**Phase 1 — Parallel subagents (strict file ownership).**
- **Agent A — input stages:** `stages/compile.ts`, `stages/selfcheck.ts`,
  `stages/design.ts` + their prompts; unit-proof against both fixtures
  (rich → complete briefing; thin → structured rejection).
- **Agent B — production stages:** `stages/write.ts`, `stages/qaA.ts`,
  `stages/qaB.ts`, `stages/assemble.ts` + prompts; unit-proof: writer output
  validates; qaB on a hand-corrupted draft flags the injected claim.
- **Agent C — orchestration/data/CLI:** DB queries, `orchestrate.ts`
  (wave runner, checkpointing, idempotency, error/resume), the three API
  routes, `scripts/explain.ts`; unit-proof with stage functions mocked.
- **Agent D — UI:** `/explain` page, job view (stepper, polling hook, level
  toggle, QA accordion, rejection views), thread "Explain deeper" action +
  `from-thread.ts` bridge; develops against a mocked job API; token-only
  styling.

**Phase 2 — Integration (main agent).** Run migration 002. Wire real stages
into orchestrator; real API into UI. Run `scripts/explainer-gates.ts` (§11)
until green. Full browser pass: paste-in job end-to-end, then "Explain
deeper" on a real thread.

**Phase 3 — Verification & ship.** Verification subagent executes §12 with
evidence; main agent fixes fails. Update DESIGN.md component inventory +
README (module docs, CLI usage, cost notes). Commit, push, deploy (existing
Vercel project; add tier envs only if set). Print for owner: what shipped,
gate-test cost, how to run CLI, subscription-mode note for $0 local jobs.

Subagent rules: one parallel wave; no agent edits outside its lane; each
self-verifies (typecheck + its unit-proof) before reporting; contract changes
route through the main agent.

## 11. Gate tests (`scripts/explainer-gates.ts` — from the spec's build order)

- **G1:** thin fixture → `rejected_input` with actionable missing-items list;
  rich fixture → briefing with all sections + ≥3 verbatim figures.
- **G2:** single level end-to-end on rich fixture → draft whose claims all
  trace to briefing (qaB dry-run reports zero unsupported).
- **G3:** inject one false claim into an approved draft → qaB fails that
  level and names the claim.
- **G4:** full N=3 job on rich fixture → `approved`; combined markdown
  contains all three level markers; artifact schema validates.
- **G5:** resubmit same `job_id` → existing job returned, usage unchanged;
  force a wave `error` → re-advance resumes at that wave only.

## 12. Acceptance criteria (verification subagent)

- [ ] All five §11 gates pass, evidence captured
- [ ] `/explain` paste-in → live job → approved artifact with working level
      toggle, takeaways, limitations, QA claim table
- [ ] `rejected_input` and `rejected_qa` render structured, legible reports
- [ ] "Explain deeper" on an answered thread creates a job whose
      `source_material.primary` is enriched full text (not snippets)
- [ ] CLI: `scripts/explain.ts` file-in → artifact JSON + markdown out
- [ ] Tier envs unset ⇒ identical behavior to `LLM_MODEL` everywhere
- [ ] Engine performs zero retrieval (grep: no fetch/search imports under
      `lib/explainer/`)
- [ ] No hardcoded colors in new components (grep) · `npm run build` clean ·
      v1 answer flow still passes its §14 checklist untouched
- [ ] Deployed; DESIGN.md + README updated

## 13. Parking lot (do not build)

Glossary stage · PDF/URL ingestion · batch jobs · standalone microservice
packaging · publish/export targets (STEM Synapse, Obsidian) · audience
profile editor UI · per-stage model picker UI · QA-report diff viewer

---

## OWNER — how to run this session (~5 min of you, total)

Nothing new to sign up for. Same repo, same keys, same database.

1. Drop `EXPLAINER-BUILD.md` (this file) and `Explainer_Engine_Standalone_Spec.md`
   into the answer-engine repo root. Optionally add the three tier lines from
   §8 to `.env` (skip = one model for everything, still fine).
2. Start Claude Code in the repo → confirm Fable 5 → plan mode → paste:

> Read EXPLAINER-BUILD.md and Explainer_Engine_Standalone_Spec.md fully.
> Produce an implementation plan following §10's phase structure exactly,
> including the Phase 1 parallel subagents with stated file ownership and the
> §11 gate tests. Flag anything malformed in .env before starting.

3. Skim the plan for Phases 0–3 + subagents → approve → switch to
   auto-accept → walk away.
4. When it finishes: open a thread → "Explain deeper" → watch the stepper →
   flip the three-level toggle → open the QA report. Then paste something
   dense into `/explain` and do it again.

Cost note: the gate tests run a handful of full jobs — roughly a dollar or
less on API at default tiers, or $0 if you run them later locally through
the subscription bridge.
