# Praxis Legal Workbench

Build **Praxis** — a desktop legal contract-review workbench. This is a faithful implementation of a finished wireframe, not a fresh design exercise. Two files are attached and they are the source of truth:

- `Praxis-Workbench-wireframe.txt` — the complete wireframe. It is HTML with **every exact inline style**, plus a state/derivation class at the bottom. It uses a small template language: `<sc-for list="{{ x }}" as="i">` = map, `<sc-if value="{{ x }}">` = conditional, `{{ ... }}` = binding, `onClick="{{ fn }}"`. Read it closely and port it 1:1 — colours, pixel sizes, font sizes, paddings, borders, copy.
- `legal-data.js` — the exact dataset (`window.LEGAL_DATA`). Port it verbatim into `src/data/legal.ts` as a typed module. **Do not invent, rename, shorten or "improve" any content** — every clause, quote, resolution and playbook position must appear exactly as written.

## Stack & scope
React + TypeScript + Tailwind + shadcn/ui. **Client-side only** — no backend, no database, no auth, no Lovable Cloud. All state is React state in one app-level store. No landing page, no hero, no marketing copy: the app opens straight into the workbench with the **Contract Review** tab active.

## Visual language (match exactly — this is a dense, calm, professional tool, not a consumer app)
Fonts (Google Fonts): **IBM Plex Sans** for UI (base 13px), **IBM Plex Mono** for clause numbers, timestamps, page refs and approved drafting, **Source Serif 4** for the Reading view.

Colours:
- Surfaces: app bg `#f4f3f0`, panels/cards `#ffffff`, reading canvas `#faf9f6`, page outer `#ecebe7`
- Borders: `#e3e1da` structural, `#eeece6` card header rule, `#f2f0ea` row rule
- Text: `#1c1b19` primary, `#3a3935` body, `#55534d` secondary, `#6d6b65` muted, `#a3a19a` faint
- Accent: `#2453c4`, hover `#16367e`, tint `#e8edfa`, selected row `#eef2fb`
- Semantic: green `#17754a`, amber `#9a6700`, red `#b0392e`
- Status pills (bg/fg): Accepted `#e6f2ec`/`#17754a` · Escalated `#f9ebe9`/`#b0392e` · Open and For discussion `#f7f0dd`/`#9a6700` · Draft `#e8edfa`/`#2453c4`
- Risk dots: Low `#9dbfa9`, Medium `#dfa63f`, High `#c4483c`
- Playbook verdicts: Consistent `#17754a`, Fallback `#9a6700`, Red flag `#b0392e`, Escalate `#b0392e`. Verdict card bg/border: Consistent `#f0f7f3`/`#cde3d6`, Fallback `#faf5e6`/`#e8dcb4`, Red flag & Escalate `#faf0ee`/`#ecccc7`.

5–6px radii, 1px borders, barely-there shadows, 10–13px type, tight 6–9px padding. Uppercase 10px letter-spaced `0.6px` section labels in `#6d6b65`. **No dark mode.** The app fills the viewport (`h-screen`, no page scroll); each pane scrolls independently. Thin 8px scrollbars with `#d4d2ca` thumbs.

## Top bar (46px, white, bottom border)
`PRAXIS` wordmark in mono with `2px` letter-spacing · divider · matter name **Atlas Software Vendor Agreement** with muted `Meridian Group · Amendment v4 under review` · then right-aligned tab group: **Matter · Contract Review · Transcript · Playbook** (active tab = `#e8edfa` bg, `#2453c4` text, weight 600) · divider · muted `Completed wireframe`.

## Screen 1 — Matter
Three columns `300px / 1fr / 320px` with 1px gaps that let the `#e3e1da` background show through as hairlines.
- **Left:** "Documents" card (each row: name + right-aligned kind, muted version line) and "Audit trail" card (44px mono date column, then event text with `— author` in muted).
- **Centre:** "Issue register — Amendment v4 vs Original v3" with right-aligned `7 clauses · 2 escalated · 2 open`. Table columns `30px 1fr 90px 70px 110px 130px`: #, Clause / change, Change, Risk, Status, Playbook. The clause cell is `**Title** — diff` with the diff in muted. Change text is coloured (Modified amber, Added green, Deleted red). Risk is a 7px dot + label. Status is a pill. Playbook is the verdict in its colour, or `—`. **Clicking a row navigates to Contract Review with that clause selected.**
- **Right:** "Applicable playbook" card (Vendor Agreement Playbook v3, `6 positions · 5 linked to this review · owner Priya Sharma`, `Open playbook →`) and a "Workflow" card listing Contract Review `7 clauses · 2 escalated`, Transcript Distiller `9 points · 6 resolutions`, Drafting Points `6 items · 4 draft`, Playbook `1 pending suggestion` — each label a blue link — closing with the muted sentence: "Playbook informs review → review flags issues → meeting resolves them → resolutions become drafting points → accepted deviations can update the playbook."

## Screen 2 — Contract Review
**Left rail 220px (white):** "CLAUSES" label; filter chips `All / Flagged / High risk` (Flagged = status Escalated, Open or For discussion; High risk = risk High) — active chip `#e8edfa` bg with `#2453c4` border and text. Then all 7 clauses: mono number, title, risk dot, and a second line `Change · Status` in the change colour. Selected clause = 2px `#2453c4` left border + `#eef2fb` bg. Footer: `7 clauses · 6 modified · 1 added`.

**Centre toolbar:** `VIEW` label, then a segmented control in a `#f1efe9` pill: **▤ Side-by-side** and **▦ Reading** (active = white chip, subtle shadow, `#1c1b19`). Hint text changes: "Original and amendment in parallel columns" / "One typeset column, changes tracked inline". Right-aligned `Amendment v4 vs MSA v3`.

Each clause has `segs` — ordered text runs where `k` is `"n"` unchanged, `"d"` deleted, `"i"` inserted.

- **Side-by-side:** a header row `Original · MSA v3 · uploaded May 10` / `Amendment · v4 · uploaded May 16`. Then one card per *filtered* clause: header with mono num, title, change label, right-aligned status pill and mono page ref; body split into two equal columns. **Left column renders only `n` + `d` segments** (deletions struck through, `#b0392e`, bg `#f9ebe9`). **Right column renders only `n` + `i` segments** (insertions `#17754a`, bg `#e6f2ec`). Selected card gets a `#2453c4` border plus a 1px ring. Sticky footer legend: green ■ Added, red ■ Deleted, and right-aligned `↑↓ move between clauses · Enter opens analysis`.
- **Reading:** `#faf9f6` canvas, a single 640px centred serif column. Title "Amendment v4 — read with changes", sub "Against MSA v3 · tracked changes inline · select a clause for the reviewer's note". Each clause: `N. Title` in serif 16px semibold followed by a tiny 10px uppercase status mark in the status colour — `REVIEWED` / `ESCALATED` / `OPEN` / `FOR DISCUSSION`. Body is serif 15px / 1.8 rendering **all** segments inline: deletions struck `#b0392e` on `#fbeeec`, insertions `#17754a` on `#eaf3ee`. Selected clause gets a 2px `#2453c4` left rule and `#eef2fb` bg.

**Right panel 312px (white):** "REVIEWER ANALYSIS" → `N. Title`, the diff line, then the analysis paragraph. Then, only when the clause has a playbook link, a tinted verdict card: `PLAYBOOK · TOPIC` with the verdict right-aligned in its colour, the detail text, and `View rule in playbook →` (navigates to Playbook, selecting that rule). Then, only when a drafting point targets this clause, a "LINKED DRAFTING POINT" card with its text and `Trace to resolution R5 →` (navigates to Transcript with that resolution traced). Then "SET REVIEW STATUS": three equal buttons **Accept / Discuss / Escalate** — the one matching the clause's current status renders solid-filled in its colour with white text (green / amber / red), the others outlined. Clicking one overrides that clause's status **everywhere in the app** (rail, cards, issue register, reading marks). Below: "AI-proposed analysis. Status changes are recorded as your decision in the audit trail." Pinned at the bottom: "SOURCES" pill chips — `Amendment v4 · p.N`, `Original v3 · p.N`, and `Playbook · Topic` when applicable, each hovering to `#2453c4`.

## Screen 3 — Transcript (decision map) — the signature screen, get this right
Header: **Steering Committee — May 6, 2026** · `67 min · 4 speakers · imported from Otter` · speaker chips `All speakers / Sarah / John / Priya / Mark` · right-aligned `Open items only` toggle.
Sub-bar on `#f4f3f0`: "Decision map — connectors are provenance. Click a resolution to trace its sources and outputs." with a right-aligned `Clear trace` chip that turns blue when a trace is active.

The board: `#faf9f6` with a dotted grid (`radial-gradient(#dddbd2 1px, transparent 1px)`, `22px 22px`), a fixed 1180×1020 canvas, scrollable, three column labels at x=24 / x=424 / x=844: **What was said · transcript**, **What was decided · outcomes**, **What happens next · drafting**.

Absolutely positioned cards, exact tops (px):
- discussions (left, 296px wide): d1 30, d2 134, d3 244, d4 348, d5 468, d6 572, d7 682, d8 786, d9 906
- resolutions (centre, 316px wide): r1 58, r2 268, r3 388, r4 496, r5 706, r6 890
- drafting points (right, 300px wide): dp1 62, dp2 272, dp3 392, dp4 500, dp5 710, dp6 894

Behind the cards, an SVG layer (`pointer-events: none`) draws a bezier per link:
- discussion → resolution: `M 320 {dY+42} C 372 {dY+42}, 372 {rY+44}, 424 {rY+44}`
- resolution → drafting point: `M 740 {rY+44} C 792 {rY+44}, 792 {pY+40}, 844 {pY+40}`
Default stroke `#c9c6bd` at 1.4px; when a resolution is traced its own edges become `#2453c4` at 2px and every other edge fades to `#e6e3db`.

Card content: transcript cards show mono timestamp, bold first name, role, then the quote, with a 3px left accent. Resolution cards show mono ID (R1…), title, status pill, text, `N source points · owner First`, and — when the resolution has a playbook note — a tinted strip `Playbook · {detail}`. Drafting cards show mono ID (DP1…), title, status pill, text, and `→ Clause N in review` when linked.

Interactions:
- Click a resolution → trace mode: it gets a `#2453c4` ring and a soft blue shadow, its linked discussions and drafting points stay at full opacity with blue borders, everything else drops to ~0.4 opacity. Click again to untrace.
- Click a transcript card → also traces its resolution, and opens a bottom **Source excerpt** strip: mono timestamp, bold speaker, the quote in italics inside curly quotes, then muted "— verbatim from transcript. Feeds R5." with a `✕ Close`.
- Click a drafting card → traces its parent resolution.
- Speaker chips and `Open items only` dim non-matching cards rather than removing them.
- A **selected** resolution whose status is `Accepted` shows a blue `Accept & create drafting point` button that jumps to Contract Review at the linked clause.
- `→ Clause N in review` jumps to Contract Review with that clause selected.

## Screen 4 — Playbook
**Left rail 320px:** "Vendor Agreement Playbook" with `v3 · Active`. One row per position: topic (weight 500) with the live matter verdict right-aligned in its verdict colour, then muted `Preferred: …`. Selected row = 2px `#2453c4` left border + `#eef2fb`. Footer note: "Positions marked with a matter note are live in the Atlas review."

**Main pane** (max 780px): rule topic 17px semibold + muted `Applied in N matters · owner Name`. When the rule has a `note`, a blue banner (`#eef2fb` on `#d7dff2`): "**Suggestion from matter history.** {note}" with `Update position` (blue) and `Dismiss` (muted) actions. Then the ladder — a bordered white table, rows `130px 1fr`, the label cell uppercase 11px semibold on its own tint: **PREFERRED** green on `#f0f7f3`, **FALLBACK** amber on `#faf5e6`, **RED FLAG** red on `#faf0ee`, **ESCALATE IF** `#55534d` on `#f4f3f0`. Then "APPROVED DRAFTING" — the clause text in a white card set in IBM Plex Mono 12px/1.7 — under it the muted line "Insert into drafting point · copy to clipboard · view precedent source". Finally, when the rule is linked to a clause in this matter, "LIVE IN THIS MATTER": a verdict pill, `Clause N (Title) — {diff}`, and `Open clause →` jumping to Contract Review.

## Shared behaviour
One store holds: active screen, selected clause, selected rule, selected resolution, selected discussion, speaker filter, open-items-only, clause filter, review view mode, and per-clause status overrides. Every `→` link both navigates *and* sets the right selection, so provenance can be walked in either direction. Hover states everywhere (rows lighten to `#f8f7f4` or `#f5f7fc`), `cursor: pointer` on anything clickable.

Structure it cleanly: `src/data/legal.ts`, `src/lib/tokens.ts` (colour maps for status / risk / change / verdict), a `src/store` or context, and one component per screen under `src/screens/`, with shared bits (StatusPill, RiskDot, DiffText, SectionLabel, Panel) in `src/components/`. Build all four screens in this first pass.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/826afa46-9506-4c36-883b-69cabee06c0e).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
