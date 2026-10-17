<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

<!-- house-style:start -->
## House style

Generated from Kwame's house-style skill (`~/.claude/skills/house-style/SKILL.md`). Refresh this section from the skill rather than editing it by hand.

Before building anything that might already exist, check **Use these first**. After a change, run a house style check.

### The rules
1. Dropdowns: every boxed `<select>` uses a custom chevron 12px from the right edge with 34px right padding, set once globally.
2. Every colour comes from the brand tokens, including focus rings, hover, selection, caret, autofill and validation states.
3. Side panels can be collapsed to a slim rail and resized by dragging, and remember the choice per device.
4. Pages more than one level deep show breadcrumbs.
5. No thick coloured stripe down one side of a card, banner or note. Use a soft tinted surface, hairline border and icon tile.
6. Focus rings are for keyboard users only. Opening a dialog or sheet focuses the container, not its first control.
7. Fetch on demand first, subscribe second, poll slowly as a last resort, and clean up every subscription when its screen closes.
8. One version of everything. A new version replaces the old one in the same change, and the old one is deleted. No `V2`, `New`, `Old`, `Legacy`, `Copy` or `Backup` files. A fallback is only for things outside the app's control, and says why in one line.
9. Build once, use everywhere. Anything shown in more than one place is one shared piece used with options, never a copy. The same action uses the same word everywhere.

### Use these first
- `src/components/Library.tsx`: every collection screen (table and card views, columns, filters, row actions, bulk actions). `src/components/LibraryCard.tsx` is its one card and `src/components/LibraryEmpty.tsx` its empty state.
- `src/components/MatterCard.tsx`: the matter card, kept separate because it carries matter-only content.
- `src/components/ConfirmDelete.tsx` (`useConfirmDelete`): the only delete confirmation, with the sentence built in one place. `src/components/Confirm.tsx` (`useConfirm`): the same shape for confirmations that are not deletes.
- `src/lib/archive.ts` (`setArchived`): Archive and Restore for every archivable table. `src/lib/trash.ts`: Delete, Recently Deleted (15 days) and restoring from it.
- `src/wireframe/screens.tsx` (`Modal`): the shared dialog that ConfirmDelete and most other dialogs are built on.
- `src/components/primitives.tsx`: the basic pieces (`Button`, `SectionLabel`, `EmptyState`, `Skeleton`, `ReviewBadge`, `ProvenanceTag`, `VersionLabel`, `ClauseRef`).
- `src/lib/tokens.ts`: every colour, type size, radius and motion value, mirrored as CSS variables in `src/styles.css`.
- `src/components/AppShell.tsx`: the app frame, top chips and breadcrumbs (`Crumbs`). `src/components/SectionPanel.tsx`: a section's own navigation in the panel column.
- `src/components/ActionMenu.tsx`: the "…" menu for rows and panels.
- `src/components/StatusPill.tsx`: every status, shown by tone rather than by colour.
- `src/components/SaveState.tsx`: saying whether work is saved and how the screen saves.
- `src/components/LoadError.tsx`: a list that failed to load. `src/components/ActionError.tsx` (`attempt`): an action that failed.
- `src/components/Person.tsx` (`Avatar`, `PersonPicker`, `OwnerTag`): showing and choosing people. `src/components/ClientPicker.tsx` with `src/components/client-choice.ts`: choosing a client, a new one, or none yet.
- `src/components/Thread.tsx`: the discussion on any piece of work.
- `src/components/EditableName.tsx`: rename in place. `src/components/DocThumb.tsx`: a document thumbnail with a hover peek.
- `src/components/ResizableSplitPane.tsx`: collapsible, resizable side panels.
- `src/lib/export/download.ts` (`downloadBytes`): handing a built file to the browser. `src/lib/files.ts`: saving and reading attached files.
- `src/lib/deadline.ts` (`withDeadline`): a call that is not allowed to hang for ever.
- `src/components/ui/*`: the base kit (dialog, sheet, alert-dialog, button, select and so on). `src/lib/utils.ts` (`cn`).
- Scrollbars: thin and invisible until hovered, set once globally in `src/styles.css`.

### Known to tidy (found at setup, 8 Oct 2026)
- `setArchived` exists in both `src/lib/archive.ts` and `src/lib/documents-library.ts`; the second archives documents on its own instead of going through `archive.ts` (rule 9).
- `SectionLabel` exists in both `src/components/primitives.tsx` and `src/components/praxis.tsx`, and `Panel` in both `src/components/praxis.tsx` and `src/organisation/ui.tsx` (rule 9).
- Each area has its own small kit with overlapping pieces: `Card` in `src/research/ui.tsx`, `src/review/ui.tsx` and `src/matter-flow/ui.tsx`; `Empty`, `Field`, `Chip`, `Eyebrow`, `Select`, `Segmented` repeated across `src/research/ui.tsx`, `src/review/ui.tsx`, `src/organisation/ui.tsx` and `src/matter-flow/ui.tsx` (rule 9).
- Date formatting is written more than once: `fmtWhen` in `src/matter-flow/ui.tsx` and `src/review/format.ts`; `longDate` in `src/lib/home-data.ts` and `src/lib/export/front-matter.ts`, which give different formats (rule 9).
- `errorMessage` is nearly the same function in `src/manuscripts/db.ts` and `src/matter-flow/presets/db.ts` (rule 9).
- `decodeEntities` exists in both `src/lib/parsing/blocks.ts` and `src/lib/deviations/revisions.ts` (rule 9).
- `daysLeft` exists in both `src/lib/trash.ts` and `src/lib/saved-briefing.ts` (rule 9).
- `docToParas` exists in both `src/lib/export/rich-doc.ts` and `src/wireframe/marks-to-segments.ts` (rule 9).
- Same name, different job (check whether they should be renamed or merged): `useReview` in `src/lib/review.ts` and `src/review/use-review.ts`; `useTeamActions` in `src/lib/teams.ts` and `src/lib/matter-team.ts`; `renumberPlan` in `src/lib/renumber.ts` and `src/lib/contract-plan.ts`; `Meter` in `src/review/ui.tsx` and `src/screens/career/charts.tsx`; `checkCitations` in `src/manuscripts/checks/citations.ts` and `src/wireframe/research-store.ts`; `textToBlocks` in `src/lib/parsing/blocks.ts` and `src/learning/blocks.ts`.
- `Topbar` and `Tabs` are redefined in several `src/wireframe/frames/F*.tsx` files (rule 9).
<!-- house-style:end -->
