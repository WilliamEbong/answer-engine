# Answer Engine

Single-user AI answer engine: ask a question → live web search (Tavily) →
streamed markdown answer with inline `[n]` citations and a sources panel →
follow-ups in-thread → threads persist (Supabase). Password-gated, deployed on
Vercel. Built per `BUILD.md`; design handoff in `DESIGN.md`.

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
```

## Configuration

All env is Zod-validated at boot (`lib/env.ts`) — missing/malformed values fail
fast with a readable error. See `.env.example` for full documentation of:

- `LLM_PROVIDER` / `LLM_MODEL` / `LLM_API_KEY` / `LLM_BASE_URL` — any of
  `anthropic | openai | google | openrouter | openai-compatible` with any model
  id; swapping providers is config-only, zero code changes.
- `TAVILY_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL`
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

## v1.1 parking lot (BUILD.md §15 — not built)

Model-selector UI · suggested follow-ups · image results · second search
provider · sharing/export · real auth · usage dashboard · scheduled digests.
