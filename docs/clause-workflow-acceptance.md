# Clause workflow — acceptance report

Independent acceptance review of the Scripta clause workflow, run jointly with
Codex: Codex reviewed and verified, Claude implemented. 16 September 2026,
against `d57e2f3` on `main`.

Evidence is tiered throughout and the tier is always stated, because the single
most useful correction of the session was Codex's: a programmatic `.click()`
proves a handler works, not that a lawyer can reach the control.

    [UNIT]       a test in the suite
    [LIVE-SQL]   run against the live database
    [BROWSER]    driven in Chrome as a signed-in lawyer
    [SOURCE]     read, and reasoned about, but not executed

---

## The verdict

**The clause workflow is accepted.**

Thirteen defects were found and all thirteen are fixed and verified, including
the architectural one — the server-side wording writers never having been
migrated to the document — which was held open for a decision and then closed
once Kwame took it.

Two decisions were his: an accepted AI suggestion is recorded as **the accepting
lawyer's own tracked change**, and the Playbook review judges the **If accepted**
reading. Both are implemented.

Codex was rate-limited partway through and could not continue, so the review,
the verification and the push were carried by Claude from that point. Two
commits reached `main` without Codex reviewing the diff; that is recorded here
because it is a departure from how the session was set up.

---

## One theme

Phase 5 made a clause **a ProseMirror document in `clauses.doc`**, with tracked
changes as marks inside it, and made `save_clause_doc()` the only way that
document may be written. `clause_segments` — the older flat list of `n`/`i`/`d`
runs — was kept as an export fallback.

Nearly every defect found is the same defect: **something still treating the
shadow as if it were the clause**, or keeping its own copy of a rule that had
moved. The workflow's design is sound. Its migration was incomplete, and the
incompleteness was invisible because the two representations agree until
somebody edits.

A second, smaller theme: **three defects were invisible to code review and
visible in ten seconds of clicking.** One of them had a comment beside it
explaining why it was fine.

---

## Findings

### 1. `See changes` contradicted the Changes pane — FIXED

`hasClauseChange` computed from `segs`, so the toolbar reported "Nothing has
changed yet — no clause is redlined and no proposal is outstanding" while the
Changes pane, two inches away, showed **5 OUTSTANDING**. The filter and the
clause-tree navigation believed the stale one, so a lawyer could not navigate to
their own changed clauses.

Found by Codex [SOURCE]. Now derives from `changesIn()`, the same function the
pane uses, so the two cannot disagree again.

Checked before switching, so nothing would be lost: across the repo, **417 of
417 clauses carry a document, and none knows about a change only through its
segments** [LIVE-SQL]. Verified enabled, reading 4, filtering the tree to
clauses 1.2, 1.3, 1.4, 1.6 and restoring on a second click [BROWSER], and
independently re-tested by Codex at 1200px and 1440px [BROWSER].

### 2. The Changes pane contradicted its own buttons — FIXED

`useClauseActions.done()` invalidated the clause, its standing and the matter,
but not `matter-changes`. Because `ChangesPane` settles changes with its own
buttons, the pane went on showing a change **after the pane's own button
settled it**.

The cause was drift, not omission: three writers each kept their own list of
what a clause write makes stale, and only the restore path in
`clause-versions.ts` listed the pane. They now share one list,
`CLAUSE_WRITE_CACHES`, with a guard test that fails against the pre-fix text of
both other files [UNIT].

Verified live: with the pane open, withdrawing a proposal took it from
**6 OUTSTANDING / "You 5 across 5 sittings" to 5 / "You 4 across 4 sittings"**,
with no reload [BROWSER].

### 3. Withdraw and settle were decided in two places — FIXED

Whether a lawyer is offered *Withdraw* or *Accept/Reject* was computed inline in
both `ChangesPane` and `ClauseReadings`. Now one function, `settleControls`,
with the rule stated once: **your own proposal offers Withdraw and nothing
else**, asked before any settling right [UNIT].

### 4. The Playbook review judged wording from before every tracked edit — FIXED

`reviewClauses` and `buildContextPackets` both built the clause text from
`clause_segments`, which `save_clause_doc` has never written. Since Phase 5 the
shadow has been frozen, so the AI review — and the definitions it reasons from —
have been assessing the clause as it stood before any tracked edit on the file.

Found by Codex [SOURCE]. Both intended the right reading already:
`rebuildAmendment` drops deletions, and the packet builder dropped its `d` runs
under a comment calling it "the amended reading". Both now read the document,
through one shared rule in `review-reading.ts` [UNIT].

**Reading confirmed with Kwame: If accepted** — the clause as the lawyer means
it to read. It tells them whether their markup solved the problem, where
*Operative* would strip their own proposals out before judging and re-raise an
issue they have already fixed.

### 5. "Note on these words" appeared only once per sitting — FIXED

The entry point to an anchored comment. `selected` was read during render as
`editor && !editor.state.selection.empty`, and **nothing re-renders React when a
ProseMirror selection changes**: `rich-text.tsx` subscribes to `onCreate`,
`onFocus`, `onUpdate` and `onDestroy`, and `onUpdate` fires only when the
document moves. Tiptap 3 does not re-render on transactions by default.

So the control appeared on the first click into a clause — because that click
also fired `onFocus` — and never again. Select wording while already in the
editor and there was no way to comment on it at all.

Worth recording how it survived: a comment at that line argued the case away —
*"a selection with no document change is caught on the next render"*. There is
no next render. Found [BROWSER]; fixed with one `transaction` listener in the
one component that cares.

### 6. The editor claimed unsaved work over a saved note — FIXED

`dirty` was `JSON.stringify(draft) !== JSON.stringify(doc)`. A clause is stored
as `jsonb`, and `jsonb` sorts object keys: the editor emits a text node as
`{type, text, marks}` and it returns as `{text, type, marks}` — proved live,
`byte_identical false` [LIVE-SQL]. After any save the draft could never compare
equal again.

Invisible on the normal path, which saves and closes in one motion. Visible the
moment anchoring a note saved the document and **left the editor open**, where
it offered "Leave without saving" over a note already safely on the clause.
Now compared canonically by `sameDoc` [UNIT], verified in the editor [BROWSER].

### 7. Undo of a tracked deletion duplicated the wording — FIXED

The sharpest defect of the review, and the readings hid it.

The plugin answers a deletion by **putting the text back** and marking it
struck. Its repair set `addToHistory: false`, so history remembered only the
lawyer's delete — and undoing it re-inserted wording the repair had already
restored. `"Payment within thirty days."` became
**`"Payment within thirty thirty days."`**, the duplicate carrying a phantom
insertion and the original still struck through.

Both derived readings looked correct: `operative()` drops the insertion and
`ifAccepted()` drops the deletion, so each showed the word once. **Only the
marked-up reading — the one actually sent to the counterparty — was wrong.**

Undo is a reflex, so every one left a pair of proposals behind that nobody made
and somebody with settling rights had to clear.

Fixed by letting the repair share the history event of the edit that provoked
it, so one press of undo takes back both, and by skipping history-driven
transactions in the tracking pass. Redo restores the same `changeId` rather than
inventing a second proposal [UNIT].

### 8. Word export dated every revision the same — FIXED

`ExportSeg` carried the author but no date, so `buildDocx` stamped every
revision with one timestamp — the moment of export. A counterparty opening a
negotiation in Word saw every proposal made in the same second, unable to tell
what was asked for last week from what was added this morning.

This lost the same argument Phase 5 already won for the author. Each run now
carries its own `at` [UNIT].

### 9. Inline Edit reported a success it did not have — FIXED

`editClauseText` wrote the redline to `clause_segments`, wrote an audit row
saying the reviewer had edited the clause, and **discarded the result of the
`clauses.update`**. `authenticated` has no `UPDATE` on `clauses.doc` — Phase 5
revoked it — and Postgres refuses the whole statement when it touches one column
the caller may not write.

Predicted by Codex from source and privilege checks; reproduced end to end on a
disposable clause [BROWSER] + [LIVE-SQL]:

| | |
|---|---|
| What the lawyer saw | editor closed, no error, clause redrew as a redline |
| `clause_segments` | 4 rows, `n \| d:thirty \| i:forty-five \| n:days.` |
| `clauses.doc` | **unchanged** |
| `analysis_source` | **unchanged** — the whole statement was refused |
| `audit_events` | 1 row, "edited by the reviewer" |

Three things beyond the prediction: `analysis_source` was lost with the column
it could have written; the audit trail records an edit the document never
received, so `restorePriorText` would undo something that never happened; and
the write is server-side, so **nothing appears in the UI, the console or the
network** — there is no surface on which this failure can be seen.

First fixed to stop the false success: the document write is attempted first
and its refusal is fatal, so a refusal leaves nothing changed and the lawyer is
told the truth. `writeSegs` no longer swallows its own errors either.

That left the control refusing every time, which exposed the real problem —
**the inline editor was never tracked at all.** It used `CLAUSE_EXTENSIONS`
without the tracking extensions, so what it produced was a document with no
marks, and it was seeded from `clause.segs` rather than the clause. Three faults
hiding each other behind a button reading "Save as tracked change".

The refused write had been protecting the file. An untracked document written
over a clause would have destroyed every outstanding proposal on it, silently,
with no record of whose wording had gone.

**Kwame's decision: make it tracked.** It now tracks as the lawyer types and
saves through `save_clause_doc` like every other document write. Verified end to
end on a disposable clause: the typed wording renders underlined in the editor,
lands in `clauses.doc` as an insertion attributed to Podrick, produces a
`change.proposed` audit row, and lifts `See changes` from 4 to 5 [BROWSER] +
[LIVE-SQL].

### 10. The server-side wording writers were never migrated — FIXED

The root cause. Findings 1, 4 and 9 are symptoms of it.

Phase 5 made `clauses.doc` the authority and `save_clause_doc()` the only writer.
`save_clause_doc` is called from the client. **Every server function that edits
clause wording still writes only the shadow:**

| Function | Writes | Writes `clauses.doc` |
|---|---|---|
| `acceptSuggestion` — `review.functions.ts:118` | segments | **no** |
| `restorePriorText` — `review.functions.ts:152` | segments | **no** |
| `decideAmendment` — `review/functions.ts:1235` | segments | **no** |
| `editClauseText` — `review.functions.ts:342` | segments | tries, refused |

Three of the four **succeed silently**, because their `clauses.update` touches
only columns the caller may write. `acceptSuggestion` is the path by which AI
review output becomes wording — so accepting a suggestion updates the shadow,
clears `suggested_text`, and never touches the document the export, the Changes
pane, the four readings and now the review itself all read.

Granting `UPDATE` on `clauses.doc` would have been the wrong fix. That revoke is
what forces every document write through the attribution check, the staleness
guard and `can_settle_change`; a direct write bypasses all three.

**All four now go through `save_clause_doc`**, sharing one helper,
`proposeIntoDoc`, rather than four copies of the same decision — four copies of
one rule is how this drifted in the first place.

**Kwame's decision on attribution: the accepting lawyer's own tracked change.**
Which is what this code's own audit line has always claimed — "now recorded as
the reviewer's own" — and never did. It is somebody taking responsibility for a
machine's suggestion, so it is settled the way any other proposal is.

The helper refuses rather than guesses in the two cases where it cannot proceed
honestly, and sends nothing when it refuses:

- **Outstanding proposals on the clause.** Rebuilding from a flat word diff
  would drop every existing mark, which the server would read as settling a
  colleague's wording by omission. It would be refused anyway, with a message
  about settling rights that explains nothing; better to name what is in the way.
- **Formatting the rebuild would lose.** `isFlat` asks exactly "would rebuilding
  lose anything", and when it would, the lawyer is sent to the editor rather
  than having a rates table quietly flattened.

Verified end to end: accepting a suggestion through the UI wrote a deletion and
an insertion into `clauses.doc`, in one sitting, attributed to Podrick, with
`suggested_text` cleared and the audit line finally true [BROWSER] +
[LIVE-SQL]. Seven unit tests cover the refusals, the staleness stamp and the
set/change identity.

### 11. A typed run stored one node per character — FIXED

Inspecting a real save showed fourteen characters had produced **fourteen marked
text nodes with fourteen distinct timestamps**. The change model was right — one
changeId, one sitting — but `at` was stamped per keystroke, and ProseMirror
merges adjacent text nodes only when their marks are identical, so no two
characters ever matched.

A paragraph of typing became a document hundreds of kilobytes long, crossing the
wire on every read, every realtime payload and every export. A change now
carries one timestamp, which is also what the timestamp means: when the proposal
was made, not when each letter was typed.

After the fix, twenty-two typed characters produced **one node, one timestamp,
one change**, in a 375-byte document [BROWSER] + [LIVE-SQL].

The guard for this was written twice. The first version passed against the
defect it existed to catch, because every keystroke in the suite lands inside
the same millisecond and the timestamps matched by accident. It now advances a
fake clock between characters, and fails with "expected 7 to be 1" against the
old behaviour.

### 12. `acceptSuggestion` and `decideAmendment` diffed against the frozen shadow — FIXED

Both computed their baseline with `rebuildOriginal(segments)`, so accepting a
suggestion on a clause edited since Phase 5 would have redlined the lawyer's own
earlier wording back in. Both now diff against the clause's own text.

### 13. `ContractEditor` had its own copy of the jsonb comparison bug — FIXED

The same defect as finding 6, in a second place: `draftDirty` compared
stringified JSON against a document that had been through `jsonb`. Now `sameDoc`.

---

## Verified, and found correct

- **Anchored comments, end to end.** A note added to selected wording persists,
  renders with its quotation, and the mark's `threadId` equals the comment's id
  [BROWSER] + [LIVE-SQL].
- **An anchor-only save is not a change.** It introduces none, re-attributes
  none, settles none; an anchor sharing a run with a proposal neither becomes
  one nor hides one [LIVE-SQL].
- **Anchors under settlement.** All four outcomes hold — insertion accepted or
  rejected, deletion accepted or rejected — plus a thread spanning settled and
  untouched wording, which keeps the surviving half [UNIT]. Confirmed live: a
  withdrawn insertion left its note **intact but without its quotation**, shown
  rather than hidden, exactly as the model promises [BROWSER].
- **Your own wording is withdrawn, never accepted.** As an Editor, Podrick was
  offered Withdraw on his own proposals and nothing at all on the Lead's
  [BROWSER].
- **Formatting over a proposal** does not split it, re-attribute it, or invent
  one; bolding is not a proposal [UNIT].
- **Pasted wording** keeps its original author, so `save_clause_doc` refuses it —
  the safety is server-side, and the test asserts that rather than pretending
  the client prevents it [UNIT].
- **The Word file is a real Word file.** `file(1)` reports *Microsoft Word
  2007+*, the zip passes `unzip -t`, `document.xml` is well-formed, deleted text
  uses `w:delText` as Word requires, formatting survives alongside revisions,
  and per-run authorship reaches the margin: `w:del` by Mawusi Adusu, `w:ins` by
  Podrick Robogo.
- **No legacy exposure.** 417 of 417 clauses carry a document; none depends on
  segments alone [LIVE-SQL].

---

## Not verified

Stated so nobody mistakes silence for a pass.

| | Why |
|---|---|
| **The Word file opened in Word** | Never done, at any point. Validated structurally only. |
| **Accepting another lawyer's change, in a browser** | Needs the Lead's session; Claude cannot sign in. Proved [UNIT]. |
| **A Playbook review actually run** | Costs live AI credit; not spent without asking. The reading is verified [UNIT], the run is not. |
| **Clause assignment UI** | Does not exist. `entity_owner('clause')` has no way to be set, so "the clause's assignee may settle" is currently unreachable in practice. |
| **Two lawyers editing at once** | Covered by the Phase 5 acceptance, not re-run here. |

---

## Open, carried forward

1. **Another lawyer's wording can be rewritten in their name.** `save_clause_doc`
   validates *who* proposed a change and *which* change it is, never *what it
   says*: `doc_change_marks` returns only `(changeId, authorId, kind)`. Two
   documents differing only in the words inside another author's change are
   **indistinguishable to the server** [LIVE-SQL] — "liable for all losses
   however arising" becomes "liable for nothing", still in their name, and
   because `added` and `settled` are both 0 **no audit event is written at
   all**. The only trigger on `clauses` is `set_updated_at`, and revisions are
   kept on demand, so nothing records it. Reachable by a crafted request, not
   through the editor. The narrow fix is for `doc_change_marks` to carry each
   change's gathered text so the guard can refuse a rewrite it did not author.
2. **Self-acceptance** — `docs/self-acceptance.md`. Raised in severity by
   finding 3: it was reachable through ordinary UI, not only a crafted request.
3. **Clause assignment UI**, without which the assignee settling right is dead
   letter.
4. **`restorePriorText` restores a redline from an audit row**, and now writes it
   into the document as a fresh proposal. That is correct as far as it goes, but
   clause revisions are the better mechanism and the two now overlap. Worth
   collapsing into one.

---

## Fixtures

All synthetic. Three disposable clauses (99.1, 99.2, 99.3) created on the Atlas
matter and deleted with their segments, comments, revisions and audit rows; two
synthetic notes on clause 1.9 removed along with their anchors, so no mark
points at a comment that no longer exists. Verified after each, and finally:
**Atlas back to 132 clauses, no probes, no stray notes**, and Codex's five
fixture changes across 1.2, 1.3, 1.4 and 1.6 present and untouched throughout.

No client wording was used at any point.

---

## Suite

**1,235 tests across 97 files.** Typecheck clean. Lint clean on every file
touched.
