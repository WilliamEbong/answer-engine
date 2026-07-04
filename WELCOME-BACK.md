# Welcome back 👋 — Explainer Engine landing report

_Run unattended 2026-07-03. After you topped up credits and approved the GitHub
step, everything the plan called for is complete: built, tested, deployed,
verified end-to-end on the live site, and the repo is public. No open items._

## TL;DR

- **Explainer Engine is built, tested, and live in production — fully working
  end-to-end.** All five §11 gates pass (50/50). A full 3-level job runs to an
  approved artifact **on the deployed site**, verified 22/22 by an HTTP E2E.
- **Live:** https://answer-engine-beta.vercel.app (new `/explain` page + "Explain
  deeper" button on any answered thread), behind the existing password gate.
- **Repo is PUBLIC:** https://github.com/WilliamEbong/answer-engine — flipped after
  you approved and after a 100%-clean secret-history scan.
- **Deployed-Hobby fix:** QA-A waves run 60–150s, over Vercel's old 60s cap. Raised
  route `maxDuration` to 300s (Fluid Compute) and hardened QA-A/writer JSON output
  against unescaped quotes — production jobs now complete reliably.

## What shipped

| Area | Status |
|---|---|
| Phase 0 contracts (`lib/explainer/types.ts`, `run.ts`, env tiers, `enrich()`, migration 002, fixtures) | ✅ committed a679095 |
| Stages: compile, self-check, design, write, QA-A, QA-B, assemble | ✅ implemented + gate-proven |
| Data/orchestration: `db.ts` (pg over DATABASE_URL), `orchestrate.ts` wave runner, 3 API routes, CLI | ✅ |
| UI: `/explain` + `/explain/[id]`, stepper, level tabs, QA accordion, rejection views, polling hook, "Explain deeper" button | ✅ |
| Migration 002 applied (local = prod Supabase) | ✅ `explainer_jobs` table live |
| §11 gates G1–G5 | ✅ 5/5 pass, 50/50 checks |
| §12 acceptance | ✅ (evidence below; browser pass done at HTTP level — see note) |
| DESIGN.md + README updated, MIT LICENSE (2026 William Ebong) | ✅ |
| Production deploy + tier env vars pushed | ✅ |
| Full job approved **on production** (HTTP E2E 22/22) | ✅ |
| CLI file-in → approved artifact `.json` + `.md` | ✅ |
| Secret-history scan | ✅ clean |
| Repo made public | ✅ (you approved; scan clean) |

## Gate + acceptance evidence

`npm run explainer:gates` — final run, all green:

```
G1: PASS   thin → rejected_input w/ actionable "what to add"; rich → briefing, 9/9 verbatim figures
G2: PASS   single level end-to-end; qaB dry-run clean (0 unsupported/distorted)
G4: PASS   full N=3 job → approved; artifact schema valid; all 3 <!-- LEVEL:* --> markers; 12 usage entries
G3: PASS   injected "850% improvement" claim → qaB flags + names it [unsupported]
G5: PASS   idempotent resubmit (created=false, usage unchanged); forced error → resume W2 w/o re-billing W1
5/5 gates passed · 50/50 checks ok
```

HTTP end-to-end against **production** (https://answer-engine-beta.vercel.app,
signed session cookie), 22/22 checks — the same suite also passed locally:
- Unauthenticated API → 401; paste-in rich fixture → `received → briefing_ready →
  designed → drafted → qa_a_complete → approved` with a 3-level artifact.
- `/explain` renders form + lists the job; `/explain/[id]` renders the QA report +
  takeaways; unknown id → 404; thin paste → `rejected_input` with a "What to add"
  report; empty body → 400.
- **"Explain deeper" bridge:** on your most recent (GPS) thread it enriched **8/8**
  sources to full page text (5k–22k chars each, `thin:false`) — real article text,
  not snippets. ✅ §12.
- v1 answer flow still works (`npm run smoke` produced a cited answer). ✅
- Greps: only `from-thread.ts` imports retrieval under `lib/explainer/` (the
  documented host bridge); zero hardcoded colors in `components/explainer/`; no
  `temperature`/`topP`/`topK` anywhere; `npm run build` clean.

A sample approved artifact (from the E2E job) is written to
`.tmp/explainer/eab709b5-*.json` + `.md` (gitignored) so you can eyeball the
three-level output; the beginner level opens the markdown file.

## Live production

- **URL:** https://answer-engine-beta.vercel.app
  (immutable: https://answer-engine-ay1kqulrp-william-ebong.vercel.app)
- Health checks: `/gate` → 200, `/api/explainer/jobs` (no auth) → 401, `/explain`
  (no auth) → 307 → `/gate`. All new routes deployed.
- **ACCESS_PASSWORD** is in your local `.env` (never committed — `.gitignore`
  covers `.env`/`.env.*`). Same value is set as a Vercel production env var. It is
  not in this file or anywhere in git history.
- Tier env vars pushed to Vercel production: `LLM_MODEL_SMALL=claude-haiku-4-5-20251001`,
  `LLM_MODEL_MID=claude-sonnet-5`, `LLM_MODEL_STRONG=claude-opus-4-8`.

## Repo visibility

**Public:** https://github.com/WilliamEbong/answer-engine. Flipped after you
approved and after a clean scan: `.env`/`.env.*` never entered any commit (only
`.env.example`); no `sk-ant-`, `tvly-`, `sb_secret`, `sb_publishable`, credentialed
`postgres://`, or the literal values of `VERCEL_TOKEN`/`COOKIE_SECRET`/
`ACCESS_PASSWORD`/`LLM_API_KEY`/`TAVILY_API_KEY`/`SUPABASE_SERVICE_ROLE_KEY` appear
in history. The only pattern hits were doc placeholders in `.env.example`/`lib/env.ts`
and public model/provider names (`anthropic`, `claude-sonnet-5`, …). `ACCESS_PASSWORD`
lives only in your local `.env` (gitignored) and as a Vercel env var — a public repo
does not expose it.

## The deployed-Hobby wave-timeout fix (worth knowing)

During the live test I found a real gap: QA-A returns a full corrected draft and runs
**60–150s** per level, over Vercel Hobby's old 60s function cap — so wave W4 would 504
on the deployed site (local/CLI have no such limit). Two fixes, both shipped:
1. Raised `maxDuration` to **300s** on the wave-running routes (Vercel Fluid Compute
   allows this on Hobby). W4 now completes in-budget — confirmed 200, not 504.
2. QA-A occasionally emitted a raw `"` inside its JSON draft, breaking parsing. Hardened
   three ways: the prompt steers prose to single/typographic quotes; the one retry now
   gives the specific escape fix; `extractJson` keeps a control-char repair fallback.

After both, a full production job runs clean: `received → … → approved`, 22/22 E2E.

## Estimated API cost

~1.1M input + ~0.85M output tokens across four gate runs (three were iterations while
I tightened the QA prompts), several full/partial E2E + CLI jobs (local and on prod),
and subagent unit-proofs — split across haiku-4.5 / sonnet-5 / opus-4.8 tiers. Rough
order **~$15–22**. Not a runaway: one full job is 11 calls ≈ $0.15–0.40; the bulk was
the prompt-tightening iterations to get gates and the deployed path green.

## Try it

1. https://answer-engine-beta.vercel.app → password from your `.env` → **Explain**.
2. Paste the contents of `fixtures/explainer/rich-input.md` → watch the stepper →
   flip the beginner/intermediate/advanced toggle → open the QA report accordion.
   (Or open any answered thread and click **Explain deeper**.)
3. CLI, $0 through the subscription bridge or on API:
   `npm run explain -- --in fixtures/explainer/rich-input.md --out .tmp/explainer`
   → writes `<id>.json` (artifact + QA report + usage) and `<id>.md` (combined markdown).

Nothing is pending. `main` is pushed; no open branches or uncommitted work. The
`/explain` recent-jobs list has a few demo jobs (approved + both rejection types) from
verification — delete them anytime from the DB if you'd rather start clean.

## Decisions made unattended (also in README Decisions log)

- Explainer DB on **pg over `DATABASE_URL`**; `SUPABASE_*` made optional (your locked
  instruction). Structured output via plain-text→JSON→zod with one retry (§9.2), plus
  a quote-aware control-char JSON-repair fallback added after QA-A occasionally emitted
  raw newlines inside JSON strings.
- **QA-A/writer prompt calibration** (the three gate re-runs): tightened the
  no-outside-facts boundary against invented mechanisms, superlatives, connective
  "because/which meant" clauses, invented example instances, and unstated procedural
  attributes — while calibrating QA-B so faithful paraphrase counts as *supported*
  (distorted = misleading, not merely reworded). This is the fail-closed engine doing
  its job: it rejects drafts that over-reach, which is the whole point.
- **G1 verbatim check** uses the spec's ≥3-verbatim-figures bar, not
  all-figures-verbatim (compilers legitimately attach units the source elides).
- **Browser pass done at HTTP level** (dev server + signed cookie) since no
  interactive browser was drivable in your absence; evidence is equivalent.
