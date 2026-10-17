# Scripta design reference

First application: sign-in and account creation, September 2026. Evolve these
decisions as subsequent screens are reviewed; do not restyle the whole product
as a side effect of work on one screen.

## Character

Scripta follows a clean law-firm aesthetic: calm, precise and practical. Its visual identity starts
with the existing folded-document logo, pure white surfaces, deep navy ink and measured
teal accents. Structure comes from alignment, margins and fine rules. Use
containers and elevation only when they clarify grouping or interaction.

Do not add ornamental edge strips, corner brackets, crosshairs, decorative rings
or coloured framing around containers. Reserve colour for identity, actions,
selection and actual status. Keep interface copy factual and brief; avoid
repeating slogans in headers, captions and footers. This applies to later
screens as well as authentication. Keyboard focus and useful selected-state
indicators must remain visible.

The open editorial composition and folded-document study belong to the entry
experience. They are not a dashboard or document-editor template.

## Source of truth

- `src/lib/tokens.ts`: canonical React tokens. `identity` and `space` extend the
  existing typography, radius and motion tokens. `scriptaTheme` exposes those
  values to CSS without maintaining a second palette.
- `src/components/scripta-controls.css`: opt-in form controls under `.scripta-ui`.
  Apply `style={scriptaTheme}` to their containing surface.
- `src/screens/auth-screen.css`: authentication layout and its illustration.
- `src/components/ScriptaLogo.tsx`: the existing shared logo and local asset.

The workbench currently has both `primitives.tsx` and `ui/*` component families.
Review and adopt existing functionality before extending their presentation.
The new scoped control classes are presentation hooks for those existing native
controls, not another behavioral component framework. Do not add a competing
button implementation on each screen.

## Decisions to reuse

- **Type:** self-hosted Inter for the interface; the existing Century Schoolbook /
  Georgia stack for editorial display and document reading. Serif display is
  selective. Keep labels visible; placeholders do not replace them.
- **Colour:** pure white surfaces and fields, navy text and primary actions;
  teal for focus and small identity details. Preserve semantic error/success
  colours. Use the dedicated input-edge token for control boundaries, and
  lighter rule tokens for decoration.
- **Controls:** 6px corners, solid primary actions, comfortable 50px auth fields
  and buttons. Keep auth input text at 16px to avoid mobile focus zoom. Compact
  workbench controls may use the existing density tokens.
- **Spacing:** prefer the existing 4/8/12/16/24/32/48 scale. Large responsive
  margins are composition decisions, not extra component spacing variants.
- **Interaction:** stable positions on hover/focus; colour and border changes
  over 160ms, visible keyboard focus and a distinct pressed state. Loading keeps
  the action's dimensions, announces progress and prevents conflicting edits.
  Respect reduced motion.
- **Feedback:** errors use `role="alert"`, confirmations use `role="status"`;
  combine text with an icon rather than relying on colour. Keep provider error
  handling intact and associate field guidance with its input.

## Authentication boundaries

The Supabase submit handler, session provider, route gates and workspace
bootstrap are unchanged. Preserve native required/email/minimum-length checks,
password autocomplete, password confirmation and both signup outcomes. The
form freezes fields and mode switching only while a request is pending.

Authentication owns a bounded `100dvh` scrolling surface because the workbench
intentionally disables body scrolling. Never remove that local scroll behavior
or change the global rule to fix a single screen. Mobile hides the editorial
composition and keeps the form's primary heading and complete controls.

Future migration: reconcile older Fluent accent overrides and inconsistent
font stacks screen by screen. Do not globally change `C.accent`, the workbench
palette or component defaults before those surfaces have been reviewed.

## Dashboard and shared interior

The dashboard, shared navigation/header and assistant chrome now opt into the
same white/navy identity. `scripta-shell.css` owns the reviewed shared chrome;
`wireframe/frames/dashboard.css` owns the dashboard composition. Existing feature
frames retain their own controls until reviewed. Specific important overrides
in the scoped shell retire older important skin and inline presentation rules;
do not add another global skin layer to `wireframe.css`.

- Prioritise real matter activity. Use compact recent-matter and work-list rows,
  native buttons, accurate counts and short empty states. Do not stretch empty
  work panels to fill a viewport or invent productivity metrics.
- Keep news secondary. The briefing sits beside matters only when the remaining
  content width permits; otherwise it follows them in the dashboard scroll area.
- Shared navigation uses readable labels, unboxed icons, a restrained selected
  background and a fixed account footer. Navigation groups scroll independently
  on short screens. Preserve feature flags and permission filtering.
- The visible search trigger opens the existing workspace search with dialog
  focus containment and keyboard navigation. Workspace selection retains its
  store reset and provides native keyboard-operable menu options.
- On small screens, use an icon rail with a labelled navigation drawer. The
  mobile drawer is independent of the saved desktop preference, keeps focus
  inside, makes the main area inert and closes on Escape or navigation.
- Preserve assistant width, visibility, conversation, unsent input, source
  attribution and request handling. Its empty state uses plain text on white.
  Keyboard focus and the resizable divider remain functional indicators.

## Interior pages and libraries

The shared interior patterns now live in `scripta-workbench.css`, imported by
`AppShell.tsx`. Use `.scripta-page` for a bounded white scrolling surface with
container-aware layout; use its heading, description, action and section classes
before introducing feature-specific equivalents. Main headings use restrained
28px serif display; section titles and working controls use Inter. Forms use
visible labels and `.scripta-form-field` wrappers or standalone `.scripta-input`
controls. Compact fields are at least 40px high, with 16px input text on mobile.

`Library.tsx` and `library.css` are the shared table/board/card system. Preserve
search, sort, selected rows, column controls, saved view preferences, record
actions and detail-pane behavior. Use the optional title/description and
`beforeToolbar` slot to place feature tools without duplicating headings. Show
real counts only after loading; loading, errors and empty results are distinct.

Use open sections and ruled rows for settings, knowledge and administrative
content. Preserve useful edit boundaries and status indicators. White surfaces
and common buttons alone do not complete a feature redesign: inspect the actual
workflow and narrow layouts. See `SCRIPTA_HANDOVER.md` for per-screen implementation
and visual-review status, including the pending document, template and playbook
reviews. Existing legacy feature bodies still need individual adoption.

Shared workspace tabs in `wireframe/screens.tsx` use native buttons with arrow,
Home and End navigation. Reuse the shared modal for native focus containment and
Escape handling; supply a descriptive `label` when adopting it in a reviewed screen.
The initial authentication loading surface also uses the pure white identity.
