# Show real AI cost in the usage pill

## Goal
Make the top-bar AI usage pill display actual dollar cost instead of "No usage yet" / raw tokens, by filling in the missing model rates and surfacing the active provider correctly.

## Current state
- Every AI call already writes input/output tokens to `ai_usage_events` via `src/lib/ai-usage.server.ts`.
- `src/lib/ai-pricing.ts` deliberately leaves `RATES` empty, so `costUsd` returns null and the pill falls back to token counts.
- `src/components/GeminiUsage.tsx` is hard-coded as "Gemini API", but the backend can route calls through Gemini, Anthropic, or the Lovable AI gateway.
- `usageThisMonth` in `src/lib/usage.functions.ts` already recomputes cost from tokens when a rate exists.

## What we will do

### 1. Add model rates
Update `src/lib/ai-pricing.ts` with the public rates for every model the app can invoke:

| Model | Input / 1M tokens | Output / 1M tokens | Source |
|-------|-------------------|--------------------|--------|
| `gemini-3.7-flash` | $0.75 | $3.75 | Google intro pricing through 31 Dec 2026 |
| `google/gemini-3.7-flash` (Lovable gateway id) | $0.75 | $3.75 | Same model, different name prefix |
| `claude-sonnet-5` | $2.00 | $10.00 | Anthropic list pricing |

Notes:
- Gemini intro pricing doubles on 1 Jan 2027. We will either add a date-aware rate helper or document the assumption in code comments.
- Lovable gateway usage is paid in workspace credits; no public per-token rate exists, so cost will remain null for that provider and the pill will continue to show tokens. We will not invent a rate.

### 2. Generalize the pill label
Change `src/components/GeminiUsage.tsx` so the label reflects the active provider:
- "Gemini" when Gemini is configured.
- "Claude" when Anthropic is configured.
- "Lovable AI" when the Lovable gateway is configured.
- Keep the compact logo and meter styling unchanged.

### 3. Surface rate status in the popup
In the existing breakdown popup:
- Keep the "rates not set" message only for the Lovable gateway case.
- When rates are known, show the per-feature dollar cost and the total.
- Add a small footer note about Gemini intro pricing expiry if the current date is before 1 Jan 2027.

### 4. Verify
- Run the existing tests for `ai-pricing.ts` and `usage.functions.ts`.
- Open the preview, trigger an AI analysis, and confirm the pill shows a dollar amount.
- Confirm the breakdown popup lists costs by feature.
- Confirm no horizontal scrolling or layout shift in the top bar.

## Out of scope
- Changing the monthly cap source (still read from `harness_versions`).
- Adding new database columns or tables.
- Building a full billing/settings UI.
- Implementing credit-to-dollar conversion for the Lovable gateway.

## Acceptance criteria
- The pill shows a dollar figure after any AI call when Gemini or Claude is configured.
- Token-only fallback still works for Lovable gateway usage.
- Provider label matches the active backend.
- Existing tests pass and the build is green.
