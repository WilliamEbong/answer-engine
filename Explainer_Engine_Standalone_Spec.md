# Explainer Engine — Standalone Specification (v1.0)

Status: independent product spec. No dependency on any other project or document — this file alone is sufficient for an AI or developer to build the tool. (Provenance note: the design is extracted from a larger system where it is proven in concept; here it is generalized as a self-contained component.)

## 1. What It Is

A pipeline that transforms provided source material into a verified, multi-level explanation of a dense document — the same content written independently at (by default) three reading depths: **beginner / intermediate / advanced** — plus key takeaways, honest limitations, and a machine-checkable QA report.

It is a **component, not a platform**: usable standalone (paste material in, get an explainer out) or embedded as a stage inside any product (news site, research tool, internal knowledge base, client-facing document simplifier).

**The engine does not research.** It receives source material from the caller — a human's research notes, a Deep Research export, a paper's text, or another system's retrieval output — and runs the production process on exactly what it was given. This is a deliberate trust boundary: every claim in the output must trace to the provided material, which makes verification possible and hallucination detectable.

## 2. Core Principles

1. **Single source of truth:** all writing derives from one normalized Research Briefing compiled from the caller's input. Writers may not introduce outside knowledge as fact.
2. **Independent drafts per level:** each reading level is written in a separate pass against the briefing — not summarized/expanded from one another — so each level is genuinely native to its audience.
3. **Fail-closed:** output is delivered only if it passes the Source Comparison gatekeeper. A rejection with notes is a valid, expected result; unverified content is never returned as approved.
4. **Structured everything:** every stage emits schema-validated JSON; unparseable output triggers one retry with the validation error appended, then a graceful stage failure.
5. **Checkpointed:** the job is a state machine; any stage can be retried without re-running (or re-billing) completed stages.

## 3. Input Contract

A job submission contains:

- **source_material** (required): one or more text blocks with roles — e.g., `primary` (paper/document text or abstract), `supporting` (press release, notes, prior analysis), `metadata` (title, authors, venue, date, canonical link/DOI). Plain text or markdown. No URLs are fetched; callers pass content, not pointers.
- **config** (optional, defaults provided): see §6.
- **job_id** (optional): caller-supplied idempotency key; resubmission with the same id returns the existing job.

### Stage 0 — Briefing Compiler (restructure only, no retrieval)
Normalizes source_material into the canonical **Research Briefing** schema: core finding; context/why it matters; methods summary; key results with figures/numbers quoted verbatim with their location in the source; limitations and open questions; terminology list; citation block. Hard rule: the compiler may reorganize and condense but may not add claims absent from the input.

### Stage 0.5 — Briefing Self-Check (input quality gate)
Validates the briefing for completeness (all sections present, ≥N verbatim-grounded figures/claims, limitations non-empty). A thin or contradictory briefing **rejects the job** with a structured report of exactly what's missing — telling the caller what additional material to supply. This gate is what lets the engine safely accept messy input without silently producing weak output.

## 4. Production Pipeline (preserved core)

- **Stage 1 — Instructional Design:** from the briefing + audience profiles, produce per-level learning objectives, structure/outline, required takeaways, and which limitations must appear. One call.
- **Stage 2 — Writers ×N:** one independent pass per level. Each writer receives: the briefing, that level's design, the style guide, and the no-outside-facts rule. Analogies and framing may vary by level; factual claims may not exceed the briefing.
- **Stage 3 — QA-A ×N (combined pass):** per level, one call checking factual fidelity to the briefing, editorial quality against the style guide, internal consistency, and bias/hype. Returns pass, or a corrected draft with change log (one correction cycle max).
- **Stage 4 — QA-B Source Comparison Gatekeeper ×N:** the authority. Extracts every substantive claim from the final draft and verifies each against the briefing: supported / unsupported / distorted. Any unsupported or distorted claim fails that level. All levels must pass for job approval; otherwise status = rejected_qa with the claim-level report (callers may resubmit with enriched material).

Default call count: 1 compile + 1 design + 3 writers + 3 QA-A + 3 QA-B = **11 LLM calls per job** (N=3).

## 5. Output Contract

An approved job returns one artifact containing:

- **levels[]** — per level: rendered markdown, plus structured fields (title, dek, body, key_takeaways[], limitations[])
- **combined markdown** — all levels in one document separated by explicit level markers (`<!-- LEVEL:beginner -->` … ) for products that render a toggle
- **meta** — source citation block, terminology/glossary (optional stage, see §6), audience profiles used, timestamps
- **qa_report** — per-level claim verification table, correction log, gatekeeper verdicts
- **usage** — tokens and estimated cost per stage

Rejected jobs return status (`rejected_input` | `rejected_qa`) + the corresponding structured report. Nothing else.

## 6. Configuration Surface

- **audiences[]** (default 3): each = key, display name, description of assumed knowledge, tone guidance. The engine is domain-agnostic — the same pipeline serves research papers, technical RFCs, legal or policy documents, medical literature summaries — by swapping audience profiles and style guide.
- **style_guide**: injectable text block (a sane neutral default ships with the engine).
- **models**: tier mapping per stage (default: strong model for Design and QA-B; mid model for Writers and QA-A; small model for Compile). Provider-agnostic; reference implementation uses the Anthropic API.
- **strictness**: gatekeeper tolerance (strict = default; lenient allows clearly-flagged "context" statements).
- **options**: glossary stage on/off (one extra small-model call producing term→plain-definition JSON), max correction cycles, output formats.

## 7. Job State Machine & Storage

`received → briefing_ready | rejected_input → designed → drafted → qa_a_complete → approved | rejected_qa`

Storage is minimal and pluggable: one `jobs` table/collection (id, config, briefing, per-stage outputs JSONB, status, qa_report, usage, timestamps). Reference implementations: Postgres/Supabase table, or filesystem JSON for CLI mode. The engine owns job state only — publishing, scheduling, image handling, and distribution are explicitly the caller's concern.

## 8. Deployment Forms

- **A. n8n workflow package** (reference implementation): an importable workflow exposing a webhook (submit job) and callable as a sub-workflow by any parent automation. Stages as checkpointed nodes; state in Supabase.
- **B. HTTP microservice:** thin API (e.g., single POST /jobs, GET /jobs/{id}) wrapping the same stage functions — the "add-on to another product" form.
- **C. CLI / script:** local one-shot: input file(s) in, artifact out. Same stage functions, filesystem state.

All three share the contracts in §3–§7; the spec, not the runtime, is the product.

## 9. Prompt Specifications (per stage)

Full prompt text is implementation work; each prompt MUST enforce the following. **Compiler:** restructure-only rule; verbatim figures with source locations; mandatory limitations section; output schema. **Design:** objectives per audience derived only from briefing; explicit list of claims/limitations each level must include. **Writer:** audience profile adherence; no-outside-facts rule stated as inviolable; style guide; required structural elements; markdown output in schema. **QA-A:** four-dimension rubric (fidelity, editorial, consistency, hype/bias); return corrected draft + change log or pass. **QA-B:** exhaustive claim extraction; per-claim verdict citing briefing evidence; distortion (correct fact, misleading framing) counts as failure; JSON verdict schema. All prompts must demand JSON-only output where structured data is expected.

## 10. Build Order & Validation Gates

1. Schema + job state + Compiler + Self-Check. GATE: thin input is rejected with an actionable report; rich input yields a complete briefing.
2. Design + one Writer + QA-A for a single level end-to-end. GATE: draft contains zero claims absent from briefing (manual audit).
3. QA-B gatekeeper. GATE: a deliberately corrupted draft (one injected false claim) is caught and failed.
4. Expand to N levels; assembly + combined markdown. GATE: full job approved on a real document; toggle-ready output renders.
5. Deployment form(s) + usage logging + idempotency. GATE: same job_id resubmitted returns cached result; crash mid-job resumes at last checkpoint.

## 11. Explicit Non-Goals

No retrieval/web research, no source selection/triage, no scheduling or publishing, no image acquisition, no CMS. These belong to host products. The engine's promise is narrow and strong: *given material, produce multi-level explanations that are provably faithful to it — or refuse.*
