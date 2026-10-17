# Make the app open faster

Today the first screen appears only after a chain of steps that happen one
after another, each waiting for the one before it. Nothing is asked for in
parallel, and a full-screen "Loading…" covers everything until the last step
finishes.

## Why it is slow (confirmed by reading the code)

1. **A five-step queue before anything shows.** On opening, the app checks the
   stored sign-in, then re-verifies it with the server, then reads your
   profile, then your workspaces, then the matters in the workspace, then the
   overview data. Only the last one puts anything on the screen. Each step
   waits for the previous one.
2. **A blocking "Loading…" screen.** The whole app is hidden until the profile
   step finishes, so none of the page can be drawn early.
3. **A single large overview read.** The workspace overview reads matters
   first, then nine more tables, then the people — three rounds of database
   work for every screen that needs it.
4. **A heavy first download.** The document editor, table and charting code is
   pulled into the first bundle even on screens that never open an editor.

## What changes for the user

- The app frame (rail, top bar, tabs) appears almost immediately instead of a
  blank "Loading…" page, with the content filling in.
- Opening the app makes its requests at the same time rather than in a queue,
  so the first screen shows in a fraction of the time.
- The first download is smaller, because editor and chart code only loads on
  the screens that use it.

## Technical plan

1. **Unblock the shell.** In `src/lib/auth.tsx` / `src/components/Authed.tsx`,
   stop gating on the profile read: show the app as soon as a session exists
   and let `profile` arrive as `null` briefly. Keep the blocking screen only
   for the initial session check.
2. **Collapse the auth waterfall.** Trust the locally stored session for the
   first render and run `getUser()` verification in parallel rather than
   before the profile read; sign out and clear only if verification fails.
   Fire `profiles` and `workspaces` reads together instead of profile →
   workspaces.
3. **Prefetch the workspace early.** `src/store/app.tsx` already prefetches
   matters for the remembered workspace; add the same remembered-workspace
   prefetch for `["board", id]` so the overview is in flight while auth
   settles.
4. **One round trip for the overview.** Add a Postgres RPC (SECURITY INVOKER,
   so RLS still applies) that returns the workspace board as one JSON payload,
   and have `fetchBoard` in `src/lib/home-data.ts` call it, falling back to the
   present multi-query path on error. This replaces three sequential rounds
   with one.
5. **Split the heavy code out of the first load.** Load Tiptap-based editors
   (`src/wireframe/ContractEditor.tsx`, `rich-text.tsx`,
   `screens/tasks/HandoverDesk.tsx`, `editor/StructuredEditor.tsx`) and the
   recharts chart wrapper through `React.lazy` so they are fetched on the
   screens that use them. Viewers (pdf, docx, pptx, zip) are already lazy.
6. **Measure before and after.** With the dev server running, use Playwright
   with a restored session to record time-to-first-content and the number of
   backend calls on a cold open of `/`, and report both numbers.

## Out of scope

- No visual redesign, no route restructuring, no change to what any screen
  shows.
- No change to how tab switching caches data (that was a separate, rejected
  proposal); this is about the cold open only.
