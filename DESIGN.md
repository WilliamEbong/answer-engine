# DESIGN.md — Design-Session Handoff

This app was built logic-first (BUILD.md). **All visual identity lives in design
tokens and component markup** — a design-only session can restyle the entire app
without touching any logic. This document is that session's contract and map.

---

## 1. Token inventory — `app/globals.css`

Every color/radius token is a CSS variable following the shadcn token model.
Light values live under `:root`, dark values under `.dark` (dark is the default —
`<html class="dark">` is set in `app/layout.tsx`). All are currently neutral
near-monochrome `oklch` grayscale.

| Variable | Role |
|---|---|
| `--background` / `--foreground` | Page background / default text |
| `--card` / `--card-foreground` | Card surfaces (source cards, thread list, gate card) / their text |
| `--popover` / `--popover-foreground` | Popovers, tooltips, dropdowns |
| `--primary` / `--primary-foreground` | Primary buttons (send, Enter) / their text |
| `--secondary` / `--secondary-foreground` | Secondary surfaces (citation chips) / their text |
| `--muted` / `--muted-foreground` | Muted fills (skeletons) / secondary text (domains, timestamps, hints) |
| `--accent` / `--accent-foreground` | Hover states (thread rows, cards) / their text |
| `--destructive` | Errors: stream error card, "Wrong password" |
| `--border` | All borders (cards, inputs, header, dividers) |
| `--input` | Input borders (query input at rest) |
| `--ring` | Focus rings (`focus-within:border-ring`, `outline-ring/50`) |
| `--chart-1` … `--chart-5` | Chart palette (unused in v1; keep defined for shadcn) |
| `--sidebar*` (8 vars) | Sidebar tokens (unused in v1; keep defined for shadcn) |
| `--radius` | Base radius; `--radius-sm/md/lg/xl/2xl/3xl/4xl` derive from it in `@theme` |
| `--font-sans` / `--font-mono` / `--font-heading` | Map to Geist / Geist Mono `next/font` variables set in `app/layout.tsx` |

Component classes only ever use the **semantic Tailwind names** backed by these
vars (`bg-background`, `text-muted-foreground`, `border-border`,
`bg-destructive/10`, `rounded-lg`, …). There are **zero hardcoded colors, font
families, or radii** in `app/(app)`, `app/gate`, and `components/chat` (grep-
verified in the acceptance checklist).

## 2. Component inventory

### App shell & routes
| File | Purpose |
|---|---|
| `app/layout.tsx` | Root layout: fonts, `dark` class, TooltipProvider. |
| `app/(app)/layout.tsx` | App shell: slim header (brand link, "New thread" button), full-height flex column. |
| `app/(app)/page.tsx` | Home (server): hero + recent threads via `listThreads()`. |
| `app/(app)/t/[id]/page.tsx` | Thread view (server): loads the persisted exchange, seeds the chat surface. |
| `app/gate/page.tsx` + `gate-form.tsx` | Password gate: centered card, password input, inline error. (`actions.ts` is logic — off-limits.) |

### Chat surface — `components/chat/`
| File | Purpose |
|---|---|
| `chat.tsx` | The client chat surface: hero mode ↔ conversation mode, streaming states, error card, pinned follow-up input. |
| `query-input.tsx` | Shared auto-growing input (hero + follow-up), Enter submits, spinner while busy. |
| `sources-row.tsx` | Horizontal row of compact source cards (favicon, domain, position badge, truncated title) + skeleton variant. Card anchor ids: `source-{msgId}-{n}`. |
| `answer-markdown.tsx` | Streamdown markdown rendering; overrides `a` to render citation chips vs external links. |
| `citations.ts` | Pure helpers: `[n]` → `#source-…-n` linkification, favicon/domain utils. (Logic — restyle the chip in `answer-markdown.tsx`, not here.) |
| `thread-list.tsx` | Recent-threads list on home (icon, title, relative time). |
| `convert.ts`, `relative-time.ts`, `endpoint.ts` | Logic/utils — off-limits. |

### Primitives
`components/ui/*` — stock shadcn primitives (button, card, input, skeleton,
spinner, textarea, tooltip, …). `components/ai-elements/*` — stock AI Elements
(conversation and message are in use). Both restyle via the tokens; edit their
markup only if a component in use needs structural change.

### Screenshot instructions
```
npm run dev            # http://localhost:3000
```
Password: `ACCESS_PASSWORD` from `.env`. Look at:
1. `/gate` — the password card (also submit a wrong password for the error state).
2. `/` — hero + recent threads.
3. `/` → ask a question — skeleton source cards → sources row → streaming text with citation chips (throttle network to hold the skeletons).
4. `/t/[id]` (any recent thread) — restored conversation, sources rows, chips, follow-up input; click a chip to see the source-card ring highlight (`target:ring-2`).

## 3. The restyle contract

A design session **may edit only**:
- `app/globals.css` (token values, new tokens, keyframes)
- Component **markup/classNames** in `app/(app)/`, `app/gate/page.tsx` + `gate-form.tsx`, `components/chat/`, `components/ui/`, `components/ai-elements/`
- Static assets (`public/`, favicon)

It **must not touch**: `lib/` (all of it — `lib/types.ts` contracts especially),
`app/api/`, `middleware.ts`, `app/gate/actions.ts`, `scripts/`, `migrations/`,
or any hook/handler/data logic inside the component files it restyles (props,
`useChat` wiring, `linkifyCitations`, transport, anchors' id scheme).

Keep intact while restyling:
- The `source-{msgId}-{n}` anchor id scheme (chips ↔ cards linking).
- The three states: skeleton (pre-sources), streaming cursor, inline error card.
- Semantic-token-only styling — no hardcoded colors/fonts/radii in components.

## 4. Suggested opening prompt for the design session

> This is a working single-user AI answer engine (Next.js + Tailwind v4 + shadcn
> tokens). Read DESIGN.md first — it defines the files you may touch and the
> restyle contract. Restyle the app into [YOUR DIRECTION HERE — e.g. "a warm,
> editorial reading experience" / "a crisp terminal-inspired tool"]: start from
> the token values in `app/globals.css` (both `:root` and `.dark`), then refine
> component markup in `components/chat/` and the two page shells. Zero hardcoded
> colors/fonts/radii in components — everything flows from tokens. Preserve the
> anchor id scheme, the skeleton/streaming/error states, and all logic files
> untouched. Verify with `npm run dev` on /gate, /, and a thread view including
> a live streamed answer.
