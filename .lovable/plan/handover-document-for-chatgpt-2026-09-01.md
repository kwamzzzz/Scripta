# Handover document for ChatGPT

## Deliverable
A single self-contained markdown file at `/mnt/documents/praxis-handover.md` that lets another AI assistant (ChatGPT) understand the Praxis codebase and make changes without prior context.

## Contents
1. **What Praxis is** — one-paragraph product summary (legal contract-review workbench, provenance chain: playbook → review → transcript → drafting → playbook).
2. **Stack** — TanStack Start v1 (React 19, Vite 7), Tailwind v4 via `src/styles.css`, Lovable Cloud (Supabase) backend, `createServerFn` for server logic, no Edge Functions.
3. **Routing map** — `/` Home board, `/matters/$matterId` workbench with four tabs (Matter, Contract Review, Transcript, Playbook), `/drafting`, `/documents`, `/transcripts`, `/playbooks`, `/knowledge`, `/tasks`, `/settings`, `/matters/new` intake.
4. **Architecture** — `src/store/app.tsx` global store (selection state, workspace/matter resolution, TanStack Query, 2s polling while parsing), `src/lib/matter-data.ts` row→`LegalData` mapping, server functions in `src/lib/*.functions.ts`, AI gateway wrapper `src/lib/ai-gateway.server.ts` (Gemini 3.7 Flash, structured tool-call output only).
5. **Database schema** — tables (workspaces, workspace_members, matters, documents, clauses, clause_segments, playbooks, playbook_rules, clause_assessments, transcripts, discussion_points, resolutions, resolution_sources, drafting_points, transcript_insights, drafts, audit_events), RLS via SECURITY DEFINER helpers, GRANT requirement on every new public table, roles table rule, private `matter-documents` bucket.
6. **Pipelines** — upload → parse (mammoth/unpdf) → block list → clause splitting → word-level LCS diff with round-trip invariant (n+d = original, n+i = amendment) → clause_segments; transcript ingestion (Otter/VTT/SRT/paste) → speaker mapping → utterances; AI analysis + transcript distillation; drafting actions vocabulary in `src/lib/drafting.ts`.
7. **Hard constraints / gotchas** — no restyling existing screens; light mode only; hard 1440px min-width with scale-to-fit wrapper (never responsive); 13px IBM Plex Sans base (drift breaks the fixed 1180×1020 decision-map board); every lawyer mutation must write an `audit_events` row; AI text always marked `source: 'ai'` until human edit; full design-token palette list.
8. **Key files index** — table of the ~20 most important files with one-line purpose each.
9. **Known quirks** — tab selection is context state not URL (refresh resets tab); upload uses `?upload=true` param; `useTranscriptImport` needs provider wrapping.
10. **How to make a change safely** — checklist: read tokens first, match visual language, add audit event on mutations, add GRANTs with new tables, run parsing tests, don't touch auto-generated files (`src/integrations/supabase/*`, `routeTree.gen.ts`).

## Technical details
- Content drawn from the existing codebase (already explored this session) plus targeted reads of `AGENTS.md`, `src/lib/matter-data.ts`, and migration history to make the schema section accurate.
- Output is a documentation artifact under `/mnt/documents/`, not project source — no app code changes.
