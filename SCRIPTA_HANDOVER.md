# Scripta design handover

Checkpoint: 9 September 2026. Read this file and `DESIGN_SYSTEM.md` before editing.
The user resumed the design continuation, then explicitly requested an immediate
push to main and Lovable sync. The earlier checkpoint was still uncommitted when
this session resumed; this checkpoint includes that integrated work.
**The redesign is not complete across all screens.** The implementation and
review status below deliberately distinguish finished work from pending QA.

The Intake, Contract Drafting and Research agents reached the account usage limit.
Their replacement drafts were not integrated, tested or included in this commit.
The repository remains the source of truth; do not treat scratch drafts as finished.

## User direction and scope

Scripta is an existing, functional application, not a rebuild. Progressively
improve composition, hierarchy and interactions while preserving authentication,
Supabase, routes, queries, mutations, permissions, validation, exports and state.
The user explicitly asked to work screen by screen, pace the work, and use
subagents for individual screens with the same standards. Continue that approach
when they resume; do not restart authentication or redesign everything at once.

The latest visual decisions override the broader original brief:

- Pure white `#FFFFFF`, never cream/off-white (the user rejected a “condensed milk” background).
- Clean law-firm aesthetics: deep navy, restrained teal, readable Inter UI,
  selective serif display/reading, fine rules and 6px control corners.
- No decorative corner brackets, edge highlights, crosshairs, rings, gloss,
  gradients, arbitrary pills, nested cards or filler slogans (“AI slop”).
- Keep functional focus, selection, status and source/provenance distinctions.
- Inspect implementation and rendered screen, design purposefully, implement,
  then test desktop, narrow layout and relevant states before advancing.
- Reuse the emerging design system. The original sign-in proposal approval gate
  was fulfilled earlier; it is not a new approval requirement for each screen.

## Repository and local app

- Local repo: `/Users/kwame/praxis`.
- Remote: `https://github.com/kwamzzzz/praxis-legal-workbench.git`, branch `main`.
- Baseline before this checkpoint: `5437a8f`. Use `git log` for the checkpoint
  commit containing this file. Do not amend, rebase or force-push published history.
- `AGENTS.md` says pushes to the connected branch sync back to Lovable. The user
  explicitly authorized this checkpoint push; no separate deployment was run.
- Stack: React 19, TanStack Start/file routes, Vite, TypeScript, Supabase,
  TanStack Query. Read `src/routes/README.md`; never hand-edit `routeTree.gen.ts`.
- Running development URL: `http://127.0.0.1:8085`.
- If needed: `cd /Users/kwame/praxis` then
  `npm run dev -- --host 127.0.0.1 --port 8085`.
  Check whether port 8085 is already running before starting another server.
- Existing local environment and dependencies work. Do not print, copy into the
  handover or commit credentials. No migrations or backend changes are required
  for the design continuation.
- The user's browser has an authenticated session on `127.0.0.1:8085`.
  `localhost:8085` is a different origin and was signed out. Reuse the authenticated
  origin; do not sign out or create another account just for visual review.
- The user is navigating the app themselves. Rediscover the current tab/state
  instead of assuming the URL from earlier messages. Browser viewport override
  was reset at handover. Preserve their sidebar and assistant preferences.

## Design implementation to reuse

- `src/lib/tokens.ts`: additive `identity`, `space`, `scriptaTheme` CSS bridge.
  Existing `C` palette was intentionally not globally replaced.
- `src/components/scripta-controls.css`: scoped native form/control patterns.
  `.scripta-field` is a wrapper, not a class for an input itself.
- `src/components/scripta-shell.css`: shared white navigation, header and assistant.
- `src/components/scripta-workbench.css`: common `.scripta-page` scrolling/content
  container, heading/title/description/actions, section rules, `.scripta-form-field`
  label wrapper, `.scripta-input`, and flat existing `px-btn` / `wf-button` variants.
- `src/components/Library.tsx` + `library.css`: shared table/board/cards, search,
  selection/bulk actions, column visibility, sort, row menus and detail pane.
  Optional `title`, `description`, and `beforeToolbar` slot avoid duplicate headings.
- `primitives.tsx`: same existing buttons/empty-state components with calmer
  styling and hooks. Do not create competing button systems in each feature.
- Legacy `wireframe.css` contains strong/important styles. Some specific scoped
  important overrides are necessary. Do not append another blanket skin there.
- Common buttons/panels affect existing consumers, but that does **not** mean the
  remaining feature bodies have been individually redesigned or visually approved.
- Layout must respond to actual remaining width when the assistant is open,
  preferably with container queries. Body scrolling is intentionally disabled;
  each workspace must retain its bounded local scroll surface.

## Implemented screens and actual review coverage

All files listed here are included in the checkpoint, not partial agent drafts.

| Area / route | Main implementation | Review status |
| --- | --- | --- |
| Sign-in / account creation | `screens/AuthScreen.tsx`, `auth-screen.css` | Implemented and visually checked desktop/mobile; isolated mock-auth checks covered validation, pending/error and signup outcomes. Mock harness is stopped. |
| Shared navigation, search, workspace/account, assistant | `components/AppShell.tsx`, `CommandPalette.tsx`, `WorkspaceSwitcher.tsx`, shared CSS | Checked desktop/mobile, keyboard search/workspace menu and drawer focus/Escape. |
| Dashboard `/` and briefing | `wireframe/frames/F1a.tsx`, `dashboard.css`, `DailyBriefing.tsx`, `daily-briefing.css` | Checked real dashboard, narrow layout and assistant width interactions. |
| Matters `/matters` | `screens/MattersLibrary.tsx`, shared `Library`, `MatterCard.tsx` | Checked table/board/cards, search/clear, columns, select/clear, row menu/detail, desktop and mobile cards. No record mutations. |
| Tasks `/tasks` | `screens/TasksScreen.tsx`, `tasks-screen.css` | Checked actual empty state desktop/mobile. Real workspace had no tasks, so populated columns still need fixture-based visual QA. |
| Precedents `/knowledge`, detail | `KnowledgeScreen.tsx`, `PrecedentDetailScreen.tsx`, `knowledge-screen.css` | Empty library checked desktop/mobile. Duplicate empty-preview label and narrow filters fixed. Populated/detail visual QA remains. |
| Settings `/settings` | `SettingsScreen.tsx`, `settings-screen.css` | Checked desktop, tablet and phone. No profile save, sign-out or preference mutation. |
| Admin `/admin` | `AdminScreen.tsx`, `administration.css` | Desktop visual review passed. Mobile and broader role/state visual review remain. No flag/access changes performed. |
| Feedback `/settings/feedback` | `FeedbackScreen.tsx`, `administration.css` | Implemented and lint/type/build checked; final live visual review still pending. |
| Documents `/documents` and detail pane | `DocumentsLibrary.tsx`, `components/DocumentDetail.tsx`, `documents-screen.css` | Implemented; agent compared business handlers and ran 92 relevant tests. Root desktop library/search/upload and mobile detail review passed; see coverage below. |
| Templates `/templates`, detail | `TemplatesScreen.tsx`, `TemplateDetailScreen.tsx`, `templates-screen.css` | Implemented; lint/type and 7 template tests passed. Root desktop/mobile review covered the library, creation and an empty-section editor. Populated sections/facts remain pending. |
| Playbooks `/playbooks`, editor | `PlaybooksLibrary.tsx`, `PlaybookEditor.tsx`, `playbook-screen.css` | Implemented; lint/type passed. Root desktop library/model-language review passed. Editor, table/filter interactions and mobile remain pending. |

Additional root review in the resumed session:

- Documents: desktop library, text search submit/results/clear, upload open/close,
  existing contract detail metadata/actions and current version history inspected.
  Mobile library/detail stacking inspected at 390px; no files uploaded or records changed.
- Templates: mobile library, creation open/cancel, record preview, and an existing
  template editor inspected; editor also inspected at desktop width. The existing
  template had no sections, so populated sections/facts still require fixture QA.
  No existing editable field was focused or blurred.
- Playbooks: desktop library and model-language disclosure inspected. Editor,
  filters/table mode and mobile review remain pending.
- Shared tabs now use native buttons with arrow/Home/End navigation. The shared
  wireframe modal uses a native modal dialog for focus containment and Escape.
  Dedicated keyboard/dialog interaction QA remains pending. Initial auth loading
  now uses the white identity surface and announces loading through `role="status"`.

Small deliberate interaction improvements: native accessible row/sort/menu
controls, dialog focus handling, visible loading/error states, Settings native
form submit with pending guard, visible workspace-member query failures, and
template-detail deletion confirmation (the list already confirmed deletion).
Existing successful business operations and save-on-blur behaviors were retained.

## Resume here: review completed work first

1. Documents: open text-search disclosure, inspect search submit/clear and upload
   open/cancel without choosing a file; select a record, inspect labelled metadata,
   extraction status, version list and actions. Check mobile detail stacking.
   Keep the unsaved-change guard, immediate-move behavior and restore confirmation.
2. Templates: open/cancel creation, preview and open a record, inspect long sections
   and facts at desktop/mobile sizes. **Do not focus then blur existing fields:**
   original handlers may save even unchanged values. Use isolated/test data for
   saves, section reorder/removal and destructive confirmation testing.
3. Playbooks: inspect library/table modes, search/position filters, model-language
   disclosure, rule selection and editor grouping. Library rail collapses to a
   selector at narrow widths; guidance sits below rules. Governance fields also
   save on blur, so keep live QA read-only.
4. Feedback desktop/mobile, Admin mobile, then populated precedent/task fixtures.
   Never change real feedback status, feature flags, administrators or records
   simply to test visual design. No live AI generation is needed for layout QA.

Use screenshot + DOM/accessibility state from the existing browser tool. In this
session CUA `fill('')` did not actually clear a search input; the visible Clear
search button did. Verify rendered results rather than assuming a tool succeeded.
The shared Library search, view and columns persist locally; restore changes made
only for QA. Assistant width/visibility and unsent draft must survive navigation.

## Remaining implementation, in paced batches

The three most recent assignments stopped with drafts outside the repository.
There are **no partial files or imports in the repository** for Intake, Contract
Drafting or Research.
Assign disjoint files and have the lead review each finished screen in-browser.
Create new CSS before adding imports to avoid temporarily breaking the live app.

| Area | Files / route | Next work and preservation boundaries |
| --- | --- | --- |
| New matter intake | `screens/IntakeScreen.tsx`, `/matters/new` | Four stages: details, documents/file-role rows, review setup, processing/speaker mapping. Self-contained with local Field and shared primitives. Preserve `run()`, `commitSpeakers()`, file inference, persisted `draftKey`, parsing/upload and routes. |
| Contract Drafting | `screens/ContractDraftingScreen.tsx`, `/matters/contract-drafting` | Brief, clause plan and draft review; preserve generation, mutations, exports and validation. Proposed dedicated CSS has not been created. |
| Corporate Drafting | `screens/CorporateDraftingScreen.tsx`, `/matters/corporate-drafting` | Inspect workflow and callbacks before redesigning. |
| Drafting workspace/record | `screens/DraftingScreen.tsx`, `/drafting`, `/drafting/$draftId` | Inspect list/setup/editor and persistence; preserve generation/export. |
| Research | `wireframe/ResearchScreens.tsx`, `ResearchWorkspace.tsx`, `/research`, `/research/new`, `/research/library`, `/research/$researchId` | Active frames: F4e new, F4f simple report, F4g issues, F4h facts, F4i analysis, F4j risk, F4k comprehensive report, F4l export modal, F4n library holding. Overview/instructions/activity/documents also render directly in ResearchScreens. F4a–d appear unused; confirm imports rather than polishing fixtures. Preserve source/citation/provenance and all research calls. |
| Transcript intake/workspace | `wireframe/WorkspaceScreens.tsx`, active F2a/F2b/F2c and transcript children; `/transcripts`, `/transcripts/$transcriptId` | Preserve the already-completed dashboard portion of WorkspaceScreens. Review upload/paste, speaker mapping and distillation/results. No live paid generation to test appearance. |
| Matter workbench | `screens/Workbench.tsx`, `/matters/$matterId?screen=…` | Individual tabs below, including loading state and cross-pane/narrow layouts. Preserve selection/deep links, data/store and assistant scope. |

Matter workbench map (inspect active imports before changing children):

- `review`: `wireframe/ContractEditor.tsx` and related controls.
- `matter`: contract summary, `wireframe/frames/F1f.tsx`, `components/MatterWork.tsx`.
- `transcript`: transcript view within the matter.
- `playbook`: `wireframe/frames/F3c.tsx`.
- `final`: `components/FinalDocument.tsx` and imported document rendering/export.
- `notes`: `components/MatterNotes.tsx`.
- `messages`: `wireframe/RedraftSession.tsx`.
- Loading frame includes F1b. Inspect actual imports; many legacy frames are unused.

After feature reviews, audit dialogs/alerts/tables/inputs for remaining drift and
check all active routes at desktop and mobile, with assistant open/closed. Keep
the distinction between redesign completion and business-flow testing explicit.

## Verification at this checkpoint

These ran again on the integrated source before this checkpoint push:

- `npm run build`: PASS. Non-fatal build warning: `inlineDynamicImports` ignored
  because `codeSplitting` is specified.
- `npx tsc --noEmit`: PASS.
- `npx vitest run`: PASS, **568 tests in 48 files**.
- ESLint on all changed/new TypeScript files: 0 errors, three
  `react-refresh/only-export-components` warnings: one in `components/MatterCard.tsx`
  and two for the existing helper exports in `wireframe/screens.tsx`.
- `git diff --check`: PASS.
- Tests/build are not a substitute for the pending visual reviews above. Live
  database mutations, paid AI generation and destructive actions were not tested.

Local logs, if still available on this machine:
`/Users/kwame/Documents/Codex/2026-09-09/sp/work/scripta-handover-{build,tests,lint}.log`.
Earlier work/agent replacement files are scratch copies, not a source of truth;
the repository has the integrated versions. No successor needs agent session IDs
or temporary files to continue. Keep this handover and `DESIGN_SYSTEM.md` updated
as screens graduate from implementation to visual review.
