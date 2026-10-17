# Handover — 16 September 2026

Phase 4 is built. Everything below is committed and pushed.

---

## Where we are

| Phase | State |
|---|---|
| 1 — Foundation | Closed. |
| 2 — Matter team | Closed. |
| 3 — Security boundary | Closed and accepted, including the two-user test. |
| 3b / 3c / 3d | Closed. |
| 4 — Structured collaboration | **Built, asserted, and accepted in a two-user browser test.** |
| 5 — Collaborative Legal Work | **Architecture presented, awaiting approval.** Two workstreams: collaborative legal editing, and collaboration awareness (folded in, not a separate 4.5). |

## The next action

**Kwame reviews the Phase 5 architecture** and either approves it or sends
changes. Nothing is implemented.

https://claude.ai/artifact/7QQYocxjJtmC4WUwX1FmoH

Phase 4 is closed and accepted. `docs/phase4-acceptance-report.md` has the
result, the four defects the browser found, and the punch list. Test data from
the acceptance run has been cleared; the audit rows were kept.

### What the Phase 5 inspection found, in case the plan is read later

- `clause_segments` (428 rows, kinds i/d/n) has **no author, no timestamp and no
  durable identity** — `writeSegs()` deletes every row and reinserts on each
  save. The redline is a diff recomputed from original versus now, so no
  individual change can be attributed, anchored to or accepted.
- `editClauseText()` writes `prior_segments` — the whole previous redline — into
  `audit_events.metadata`, and `restorePriorText()` reads it back. Document state
  in the audit log, already, which is what Phase 5 was told not to do.
- `clauses.doc` is a ProseMirror document (Tiptap 3.31), populated for **5 of
  417** clauses. Marks are the answer; no Yjs to unpick.
- `docx.ts` already emits native `w:ins`/`w:del` with author and date, passing a
  single author because segments have none.
- `edit_locks` (0 rows) is unused and already lease-shaped — it answers
  concurrency *and* presence, the latter without the channel-authorisation
  problem Phase 4 refused presence over.
- `document_versions` (0 rows) is a **file** version table, not a text one.

---

## What Phase 4 added

Six steps, in the approved order, each with its own suite.

| Step | What |
|---|---|
| 1 — Schema and resolvers | Eleven changes, no new table. `entity_owner()` written, `comment_matter()` extended. |
| 2 — The thread | One component on matter, clause, task, document, deliverable, flow phase, research. |
| 3 — Mentions | Matter-team picker, `mentions_seen_at` marker. Creates nothing. |
| 4 — Review | Four states with the round trip, addressee, task, Lead's supervisory moves. |
| 5 — Request and handoff | Request with decline, assignment, reassignment history. |
| 6 — Realtime | Four tables, inserts and updates only. No presence, no deletes, no document text. |

### Two decisions taken during the build

**Research threads attach to the research note, not the finding.** A finding is
not a durable entity — `replaceChildren()` deletes and recreates every
`research_findings` row on each save — so a thread on one is orphaned by the
next save and becomes author-only in silence. Kwame's decision was to attach at
the research-matter level and record the requirement rather than redesign
research persistence inside this phase. Full reasoning, and what it would take
to do properly, in `docs/research-finding-identity.md`.

**`StructuredEditor` keeps its own local notes.** Its parts live in editor
metadata, not in `clauses`, so its `current.id` is not a row any
`comments.entity_id` could point at. Wiring it to the shared thread would have
attached every note to an entity that does not exist. See `PartNotesPanel.tsx`.

---

## The record worth keeping

**Eight defects across Phases 3 and 4. Five were mine, and four of those were
found by two people in a browser rather than by 158 assertions.**

The acceptance test is the reason Phase 4 is defensible; see
`docs/phase4-acceptance-report.md`. The short version: three of the four
browser-found defects were invisible to suites that were, in each case,
correctly asserting a rule the product was not using. A fixture more correct
than the product passes.

The shape: *a branch that widens access, or skips a guard, when a more specific
scope is absent — then tested against the case where the scope is present.*

- Phase 3 ×3: a fallback to firm visibility where no matter was set.
- Phase 4 ×1: `task_actions()` and `review_for()` were `security definer`, so
  their own reads bypassed RLS, and both guarded only `matter_id is not null`.
  For unfiled work the guard was skipped. `task_actions()` returned a row for
  another person's private request and named who asked.

It was found by a **regression run**, not by review — which is the argument for
running the old suites after every step rather than at the end.

**The rule left behind:** a function that *reports* on a row must not read that
row with more authority than its caller has. Security definer is for answering a
question about permissions, not for fetching the thing the permissions are
about. Both functions are now `security invoker`; the policy filters the read
and there is no branch to forget.

Two smaller findings, both recorded in their migrations:

- The mention marker used a strict `>` against `mentions_seen_at`, so a mention
  landing in the same instant as an open was **never** shown. `now()` is
  transaction-scoped, so any path doing both in one transaction produced the tie
  by construction. Now `>=`, and `clock_timestamp()` when stamping: the tie
  breaks towards being seen.
- `comment_matter()` had carried branches for `task`, `deliverable` and
  `flow_phase` since Phase 3 that **no row could ever reach** — none was a
  `source_kind` value. They read as working support and were unreachable code.

---

## How to verify nothing has drifted

Each file runs against the live database as real users and **rolls back** —
paste the whole file.

| File | Asserts |
|---|---|
| `phase1_foundation.sql` | Invitation lifecycle, Lead seeding, `completed_by` |
| `phase2_matter_team.sql` | One Lead, the handover, every route by which a Lead could be lost |
| `phase3_matter_boundary.sql` | The confidentiality boundary — 60 assertions |
| `phase3b_personal_and_firm.sql` | Personal vs firm workspaces |
| `phase3c_unfiled_work.sql` | Unfiled work is author-only |
| `phase3d_audit_visibility.sql` | An audit event reveals no more than the thing it records |
| `phase4_schema_and_resolvers.sql` | The eleven changes and both resolvers, every null branch — 30 |
| `phase4_thread.sql` | Who may comment, reply, resolve, edit — 34 |
| `phase4_mentions.sql` | The team-only rule, the marker, and that mentions create nothing — 20 |
| `phase4_review.sql` | The round trip and the supervisory rule — 23 |
| `phase4_request_handoff.sql` | Request vs assignment, decline, reassignment history — 24 |
| `phase4_realtime.sql` | What is published, and what a non-member can read — 13 |
| `phase4_reader_functions.sql` | Reader functions do not outrank their caller — 14 |

**`phase3_matter_boundary.sql` restores its own premise.** It was written when
Podrick was on matter A only and was not a firm member. He has since been added
to Atlas and joined the firm, so two assertions were failing on correct
behaviour. The file now re-establishes its starting state inside its own
transaction. If a suite starts failing, check whether its premise drifted before
assuming a regression.

Application suite: `npx vitest run` — **1033 tests**, all passing.

---

## Restarting the environment

```bash
cd ~/praxis
npx vite dev --host 127.0.0.1 --port 8085 --strictPort
```

- **Claude cannot sign in.** Passwords are never entered, so every account
  switch needs Kwame at the keyboard.
- **Sessions expire.** A long working session will log out partway through.

## Live state

Unchanged from the Phase 3 handover except that Phase 4's schema is applied.

| Id | Name | Kind |
|---|---|---|
| `d832b081` | **Forex Project** | firm — 10 matters |
| `f3c5215d` | Mawusi | personal |
| `95c2d6c8` | Podrick Robogo | personal |

- Kwame — firm **Owner**; Lead of all 10 matters.
- Podrick — firm **Lawyer**; **Editor on Atlas Industrial Supplies** (`c0c2b172`).

Test matters: `c0c2b172` Atlas (Podrick is on it) · `99bc433c` Personal Trade
Management (the control — he is not) · `d9c86cc1` WAGAS-Group.

---

## Things that are true and easy to forget

- **Matter membership is the confidentiality boundary.** Firm membership grants
  access to zero matters.
- **Unfiled work is author-only** — and that now includes the functions that
  report on it.
- **The fail-safe default is narrow.** Anything unclassified is the actor's
  alone.
- **`comment_matter()` and `entity_owner()` must be extended in the same
  migration** as any new `entity_kind`, and the null branch of each asserted
  before the feature above it is built.
- **A mention creates nothing.** Not a task, not a row. If that changes, Tasks
  stops meaning "what do I have to do" within a week.
- **`mentions_seen_at` is a column privilege, not a policy.** `select *` on
  `matter_members` fails for `authenticated` by design, and a column added to
  that table later will be invisible until it is added to the grant.
- **Never `git add -A`** in this repo.
- Lovable pushes to `origin/main` with messages like "Changes". Fetch and rebase
  before pushing.

## Open items, none blocking

1. **Two-user browser acceptance** — `docs/phase4-acceptance.md`. Needs Kwame.
2. **Collaboration awareness layer** — `docs/collaboration-awareness.md`.
   Recorded during the Phase 4 acceptance test. Tasks = what I must do,
   Notifications = what I should know happened, Matter Activity = the durable
   record; the middle one is missing. A restrained header bell with a quiet dot
   and a compact deep-linking panel. **To be sized once acceptance completes**:
   Phase 4 close-out, or the first small follow-on before Phase 5.
3. **Research finding durability** — `docs/research-finding-identity.md`.
   Revisit with Phase 5.
4. **`Cache-Control: no-store` on matter documents** — `docs/security-backlog.md`.
5. **Client/Engagement architecture** — still blocked on two questions: what an
   engagement records at Nexis, and which Nexis spelling is the legal name.
6. **Matter Overview rebuild** — deferred until Client/Engagement is settled.
7. **Lead-side visual check of Manage Team** — carried over from Phase 3.
8. **No Delete on a reply**, only on a root. The database allows the author or
   the Lead to delete either; the interface offers one. Small gap found in the
   acceptance test.

## Phase 5 — Collaborative Legal Work (complete, in the database and the repo)

Two workstreams, built in eight steps. Every migration is applied to the live
project and every suite below was run against it inside `begin; … rollback;`.

| Step | What it is | Assertions |
|---|---|---|
| 1 | The mark model — four readings, accept/reject/withdraw | 41 (vitest) |
| 2 | Migration of 417 clauses from segments to marks | 31 (vitest) |
| 3 | Authorship that cannot be forged, settlement that is earned | 11 (SQL) |
| 3c | The four readings on screen, drawn from `clause_context()` | — |
| 4 | Collaboration awareness — the bell, and both ends | 10 (SQL) |
| 5 | Leases, presence, clauses live | 24 (SQL) |
| 6 | The tracked editor, and the Changes pane | 7 (vitest) |
| 7 | Anchored comments, change-set review | 4 (vitest) |
| 8 | Compare, restore, Word | 11 (SQL) + 22 (vitest) |

1,151 application tests pass.

### The doctrines this phase added

- **A change is a mark in the document.** Never an offset in a side table, which
  the next edit invalidates. The database never reasons about documents: it
  extracts a flat set of `(changeId, authorId, kind)` and checks two rules —
  nothing introduced in another name, nothing re-attributed.
- **A lease is never a permission.** Holding a clause grants nothing;
  `can_write_matter` still decides. Asserted from both ends: holding confers no
  right to settle, and a save with no lease at all is still allowed.
- **Two rules, not one.** The lease rule refuses a save while somebody else
  holds the clause. The staleness rule refuses a save built on a stale read, and
  holds where no lease was ever taken. One rule would be both too strict and too
  weak.
- **Breaking is the Lead's, waiting is everybody else's.** Audited, and the
  interrupted lawyer is told through the bell.
- **Restoring is settling everything at once**, so it requires the right to
  settle every author whose work would go — the same right, asked for all of
  them rather than one at a time.
- **A comparison is not a redline.** The redline is attributed marks somebody
  may settle. A comparison is a word diff with nobody's name on it that nothing
  can be accepted from. The screen says which is which.
- **Presence is a row, not a channel.** Phase 4's objection to presence channels
  stands; a lease is a row with a policy on it, so showing who is in a clause
  authorises nothing new. It therefore cannot show who merely has the matter
  open, which is the right limitation.

### Two boundary holes found and closed

Both in `edit_locks`, and both the same rule: **absence of narrower scope never
widens access.**

1. The insert policy was `user_id = auth.uid()` and nothing else. Signed, so
   nobody could take a lease in a colleague's name — but silent about the
   matter, so anybody could hold a clause on a matter they cannot read. No read
   and no write gained; just a member finding their clause occupied by a person
   whose name they may not see.
2. **The first fix was also wrong**, and the suite broke it in four moves: leave
   `matter_id` off the row and the `else true` branch waves it through; name a
   matter you are on for a clause you are not; call it a `document`; or own a
   lease and move it, because UPDATE had `USING` and no `WITH CHECK`. The
   policies now derive the matter from the clause through `clause_matter()` and
   pin the kind to `clause`.

The X block of `phase5_leases.sql` also plants its own clause, after an earlier
run reported it as SKIPPED because the matter happened to have none — a security
assertion quietly not running.

### Two-user browser acceptance: PASSED, 16 September 2026

`docs/phase5-acceptance-report.md`. Mawusi (Lead) and Podrick (Editor) in
separate Chrome profiles, on clause 1.3 of the Atlas framework agreement. All
eight assertions passed, after **six defects that 1,167 unit tests did not
catch**:

1. Typing produced one tracked change **per keystroke** — "80 proposed" for one
   typed proviso. The suites inserted text in one transaction, which is not what
   typing is.
2. Deep links landed on the wrong clause, so the awareness bell led to clause
   1.1 every time.
3. The rail offered **Accept on your own wording**, contradicting the editor's
   own promise two inches above it.
4. The bell was **not in the global header** — four screens override the topbar.
5. **Presence was dead code** and had never once been drawn.
6. The write-health net called a refused RPC lost work and offered **Reload**
   next to unsaved wording.

The assertion the design exists for: with a colleague holding the clause, the
save is refused, the editor stays open, the sentence stays in it, and
`clauses.updated_at` does not move.

**Phase 5 is closed.**

### Carried forward
- `clause_segments` is now a fallback in the Word export, used only for a clause
  the step 2 migration declined to convert. Worth removing once those are dealt
  with.
- Anchors are unattributed and movable by anyone who may write the clause. That
  is deliberate — the comment carries the name — but it is a decision, not an
  oversight.

## Phase 6 — Knowledge Sharing (complete)

`docs/phase6-architecture.md`. Playbooks, precedents and templates stopped being
firm-shared by default.

**Belonging to the firm is no longer permission.** Every knowledge SELECT policy
read `is_workspace_member(workspace_id)` and nothing else — never a decision
about knowledge, just the absence of one. Four states now: Private, Shared,
Firm-wide, Approved.

**Visibility and approval are two columns.** The lawyer sees four states; the
database keeps two facts. Making something available to the firm does not make
it approved. An approval is live only while `approved_at >= content_changed_at`,
so an amendment invalidates it without anybody clearing a flag — and a
playbook's rules and a template's sections bump their parent, because they are
its substance.

**Approval authority is owner or admin**, derived from the existing model
rather than invented: playbooks have been admin-governed since Phase 1.

**Provenance visibility ≤ source visibility.** `precedents.matter_id`,
`document_id`, `clause_id` and `source_note` are revoked from `authenticated`
and come back only through `precedent_provenance()`. Somebody on the source
matter gets the matter; everybody else gets "derived from prior work".

### Three things the inspection found in code that had already shipped

1. `capturePrecedent()` sent `approved` from the client — the client declaring
   its own work approved firm knowledge, with no approver and no date.
2. It never wrote `created_by` or `owner_id`, which is why authorship is empty
   on every live row.
3. `PRECEDENT_COLUMNS` selected the matter provenance and handed it to any
   workspace member.

### Two the suite found in this phase's own work

1. The approval rule used `now()` — the transaction timestamp — so an approval
   and a later amendment in the same transaction carried the same instant and
   the approval survived the wording changing. Phase 4 learned this on mention
   markers.
2. `precedent_provenance()` was SECURITY INVOKER and could not read the columns
   it exists to protect.

### Migration

Existing knowledge → **firm-wide and unapproved**, including the one precedent
carrying `approved = true` from the client. Creator information preserved where
present, never invented.

### Carried forward

- **Phase 7 seam:** `knowledge_shares.subject_type` is `'user'`; teams add one
  value and one branch. No teams built.
- `letterheads`, `flow_presets` and `flow_preset_families` stay firm-shared.
  Firm paper and workflow scaffolding, not knowledge. A decision, not an
  omission.
- Templates and playbooks have the model and the policies but not yet a
  sharing panel on their own screens; precedents have both.

## Phase 7 — Teams (complete). Collaboration programme closed.

Reusable teams: saved lists of colleagues, in Workspace Settings under the firm
branch.

**A team is an addressing mechanism, not a security boundary.** Nothing reads a
team to decide whether somebody may open a file.

### The distinction the phase turns on

| | |
|---|---|
| Matter staffing through a team | **snapshot** — copies the people in now |
| Knowledge shared with a team | **dynamic** — follows who is in it |

"Staff this matter with Transactions" names the people who are in it *now* — an
act, performed once, resolving into ordinary `matter_members`. "Share this
precedent with Transactions" is a standing statement about a group, and the
person who joins next month is exactly who it was for.

So the first copies and the second looks. A matter that quietly acquired a
reader because an unrelated list changed would be a second confidentiality
boundary wearing a disguise.

### Rules worth remembering

- Access is the **union** of valid paths. The team branch is another `or` in
  `knowledge_visible`, so removing one route never destroys another. No copied
  ACL anywhere.
- **Archiving** stops a team *addressing* anybody and does nothing else. Matter
  staffing untouched, no share row deleted, restoring brings it back.
- **Adding a team never changes an existing member's role**, and Lead is not
  offered as a bulk role.
- Provenance lives on `matter_members.added_via_team`, is read by no policy, and
  is `ON DELETE SET NULL` — deleting a list is not a reason to lose a file.
- Teams are addressed by **id**, never by name, so renaming moves nothing.
- Personal workspaces cannot have teams — refused by the database, not just
  hidden.

### Carried forward

- Team **mentions** (`@Transactions`) deliberately not built — §17.
- Teams are **not assignees** anywhere; responsibility stays individual.
- One team, **Transactions**, exists in Nexis Africa with Podrick in it, created
  during the browser check. Delete it if unwanted.

## Artifacts

| | |
|---|---|
| Phase 4 plan (rev 2) | https://claude.ai/code/artifact/826da65c-68ad-4804-bdd0-817f8fa73324 |
| Phase 3 results | https://claude.ai/code/artifact/9122950e-4eff-4c8a-bf05-f4b39ab016ad |
| Phase 3 cutover brief | https://claude.ai/code/artifact/064af47d-8a77-49af-83e3-63995621d985 |
| Teams architecture proposal | https://claude.ai/code/artifact/814d75ea-18e0-4a0f-9627-6aa8f59348b2 |
| Matter Team mockup | https://claude.ai/code/artifact/7bfb8ace-d8ab-4b63-8075-70db96809fcd |
| Clients and Engagements | https://claude.ai/code/artifact/24c699d8-2758-459d-be16-7be20f155f83 |
| Matters and Flow identity | https://claude.ai/code/artifact/15c5329c-f782-4c7d-8eb6-3f46f644d5bd |

## Clients, Matters and Flows (16 September 2026, evening)

"Organise, don't constrain." Client → Matter → Flow is the normal shape and not
a creation order. Any of them can be started first and filed later without being
recreated.

### The model

| | Belongs to | Stored link | Who can open it |
|---|---|---|---|
| Client | the workspace | `clients.workspace_id` | every workspace member (the firm's register) |
| Matter | a client, or none | `matters.client_id` (nullable) | matter members, unchanged |
| Flow | a matter, a client, or neither | `matter_flows.matter_id` **or** `client_id`, never both | filed: the matter. Unfiled: `created_by` only |
| Task | a matter, a flow, a client, or none | `matter_id` / `flow_deliverable_id` / `client_id` | unchanged: matter members, or the author |

**One path to a client.** A flow on a matter gets its client from the matter. A
task on a matter or a flow deliverable gets it from that. Only work filed to
neither holds `client_id` itself. This is enforced by check constraints plus
the `tasks_file_context` and `guard_flow_filing` triggers.

**A client grants nothing.** No policy reads `client_id`. A client page and the
list counts are made from ordinary RLS reads, so they show each person only the
work they could already open.

**Filing a flow is one-way.** `guard_flow_filing` refuses to unfile a flow,
move it to another matter, move an unfiled flow to another workspace, file into
a matter the caller can't write, or file across two different clients.
`after_flow_filed` passes the flow's client to a matter that has none, moves the
flow's tasks into the matter, and writes `flow.filed` to the matter's activity.

A matter can now hold **several flows** (the unique constraint is gone).
`/matters/:id/flow` opens the matter's first flow and creates one if there is
none. Every flow also has its own address at `/flows/:flowId`, which keeps
working after it is filed.

Files attached in an unfiled flow go to `<ws>/flows/<flowId>/…`. The storage
policy checks the flow at that path, so once the flow is filed those files
follow the matter's rules without being moved.

`matters.client` (text) is now the display name of the linked client, kept in
sync by triggers (`matter_client_name`, `client_renamed`). The text a matter was
opened under is preserved in the `matter.client_linked` audit event written by
the backfill. A matter moved to another workspace drops `client_id` and keeps
the text.

Clients are **archived, not deleted.** Deleting one would unfile matters the
person deleting it may not be allowed to see.

### Migration (applied to the live project)

`20260917100000_clients_matters_flows.sql`. Seven clients were created, one per
exact trimmed name per workspace, with the single confirmed merge (Nexis Africa
Ghana → Nexis Africa Ghana Ltd, decided 14 Sep). 9 matters linked, 2 left
unassigned, `updated_at` untouched, no flow, matter or task ids changed. Nothing
was inferred for unfiled tasks or from counterparties.

### Screens

- **Clients** (`/clients`, `/clients/:id`), placed between Tasks and Matters. The
  client page has Matters | Flows | Tasks | Documents | Activity tabs and New
  matter / New flow / New task actions. `src/clients/`, `src/lib/clients.ts`.
- **New matter** is now a two-field dialog (`NewMatterDialog`). Contract Review's
  own button is "New review", which still opens the guided intake at
  `/matters/new`. The dashboard's "start new" goes to `/matters?new=true`.
- **Client picker** (`ClientPicker`): pick an existing client, create one
  inline, or leave it as "No client yet". Used in New matter, New flow,
  Organise, matter details, the matter File card, the intake and task detail.
- **Create Flow** (`NewFlowDialog`): belongs to nothing / a client / a matter;
  start blank, from a preset, or by asking Scripta (opens the assistant with the
  request pre-typed; there is no structure-generating endpoint).
- **Organise** on an unfiled flow (`FileFlowDialog`): file under a client, into an
  existing matter, or into a new matter made from the flow.
- The **matter Overview** gained a File card (client, flows, open tasks,
  documents, deliverables). The Flow board lists every flow with its filing
  label. The command palette searches clients and flows.

### Found on the way

- **`insert … returning` on `matters` is refused by RLS**, because the Lead is
  seeded by an AFTER trigger. Contract Review intake did exactly this
  (`.insert().select("id")`). Both creation paths now choose the id on the client
  side. This dates from the Phase 3 boundary; no matter was created after 15 Sep.
- The deliverable list collapsed to a sliver on short screens once the phase
  discussion sat under it (`.mf-list` is now `flex: 1 0 auto`).

### Verification

- `supabase/tests/clients_matters_flows.sql`: 60 assertions, two users, rolled
  back. All passed before the migration was applied.
- Browser, as Podrick: all ten organising paths in the mandate, plus archive and
  restore of an unfiled flow. Test records were deleted afterwards. A client
  "ggg" created in Nexis Africa at 13:43 UTC was not made by the test run and was
  left alone.

### Carried forward

- A thread on an unfiled flow (like one on an unfiled task) has no composer,
  because `thread_context()` answers `may_comment = false` when there is no
  matter. Once the flow is filed, the composer appears.
- The tools "new" routes (Contract Drafting, Corporate Drafting, Legal Research)
  do not accept a matter, so a matter's Tools card lists what is filed there but
  cannot start a tool already filed to it. Clause extraction still only happens
  in the Contract Review intake.

### The matter as a file (same evening)

A matter opens as a file: **Overview · Flows · Tasks · Documents · Activity**,
with **Contract Review** as a tab that switches the row to that tool's own tabs
(**← File · Summary · Review · Issues · Redline · Final**). `src/matter-file/`.

- New screen ids `flows`, `tasks`, `documents`, `activity` and `contract` (the
  old review overview, now "Summary"). `matter` is the file Overview. A matter
  link with no screen lands on the file, not the editor.
- Links that mean the review go to `contract`: the Contract Review library, the
  review card's moves, Final's "back", and the intake's no-summary landing.
- Overview: Where it stands (each flow's phase, progress, next deliverable),
  What needs attention (overdue, today, waiting across tasks and deliverables,
  open review issues), Recent activity, the matter discussion; beside it File
  (client picker and the matter's facts), Matter team, Tools in use.
- Documents uploads onto the matter; only contracts and amendments link to the
  editor. The File card that was on the review overview is gone.
- A matter's client line in exports and Scripta's context is the synced
  `matters.client` text.

### Reading, starting and preparing from the file; the Template Bank (same evening)

- **Documents** open beside the list on a matter's Documents tab: PDFs and
  Word files laid out page by page (pdf.js, docx-preview), anything else as
  extracted text; contracts and amendments also offer Contract Review. Uploads
  can say what the file is. `src/matter-file/DocumentViewer.tsx`.
- **Tools** start filed to the matter: `/matters/contract-drafting/new`,
  `/matters/corporate-drafting/new` and `/research/new` accept `?matter=`.
- **Contract Review's Summary** prepares the clause register from a document
  already on the matter (on its own, or compared with an earlier version) —
  only while the matter has no clauses, because preparing rebuilds the register.
  `src/review/PrepareReview.tsx`.
- Research no longer grounds model calls in the workspace's first matter (the
  app store's fallback); it uses the matter the research is filed to.

Template Bank (`~/Desktop/Scripta Template Bank`) is now the reference for
corporate and contract exports:
- Letterhead templates: page one's header/footer and distances follow the
  template; a template's sample text is never spliced into page one.
- Letters: Our Ref, long-form date, optional multi-line sender, addressee,
  greeting, RE: subject, body, purpose, closing, dotted rule, bold name, title,
  entity line. Setup offers two presets from the bank: employment and salary
  confirmation, and confirmation of address (a `letterType` on the letter).
- Resolutions: bank typography (`HOUSE_TYPE`, `HOUSE_RESOLUTION` in
  house-style.ts) and a borderless director signature table. No page numbers or
  running head on letters and resolutions; contracts unchanged.
- Contracts: an execution page from the front-matter parties; sub-clauses keep
  their numbers in Word; the PDF honours paragraphs, alignment and marks.
- Paper uploaded before artwork was measured is measured on first load and saved
  (`withMeasuredReach` in letterheads.ts). Letters and resolutions clear the
  paper's header and footer on page one of the PDF too.

Open decisions: execution wording for an individual party ("Signed by NAME"
rather than "for and on behalf of"), which the matter does not record; parties on
the contract cover; schedules and key/value tables. The Nexis Africa letter paper
in the bank (`NexisAfrica-Letterhead-Corprate Drafting-Left-Aligned`) is not
uploaded as a letterhead, so letters default to the contract paper, whose page
one is a cover.

## The client as an organisation (17 September 2026)

A client that is an organisation now opens as that organisation's workspace,
headed with its own name: **Overview · Organisation · Matters · Flows · Tasks ·
Documents · Activity**. There is no "My Organisation" module. The Organisation
tab has the Column 7 list of areas, headed with the client's name:
Organogram, Group structure, People & responsibilities, Authority & approvals,
Entities, Licences & registrations, Compliance calendar, Key documents,
Processes, Ask about the organisation, plus the Chart studio. Individuals get no
Organisation tab. Address: `/clients/:id?tab=organisation&area=…&item=…&mode=…`.
Code: `src/organisation/` (model.ts derivations, db.ts reads/writes, ui.tsx kit,
areas/, dialogs/, charts/, licences/, registers/, processes/).

### Model (migration `20260918100000_client_organisation.sql`, enum values in `20260918095900`)

- Organogram = `org_roles` (+ `org_role_lines` for dotted functional lines).
  Group structure = `org_entities` + `org_holdings` (a directed graph; holder is
  an entity, a person or an outside name). They share no rows.
- People `org_people`; formal offices with dates `org_appointments`;
  `org_responsibilities` (owner role, deputy role).
- Authority: `org_authority_instruments` (superseded, not overwritten),
  `org_authority_rules` (band, entity scope, basis recorded | inferred),
  `org_authority_parties` (role, or capacity × count, or body).
  Roles hold authority; a role a rule names cannot be deleted.
- `org_licence_types` (configuration; Scripta defaults have no workspace),
  `org_licences` (verified flag, field sources, prerequisites),
  `org_obligations` (recurrence) with `org_obligation_occurrences` stored only
  when something is done with one. Standing, licence state, overdue items and
  structure flags are derived in model.ts, never stored.
- `org_processes` + `org_process_steps`; publishing writes a Flow preset in the
  family "<client> — processes"; Run creates a flow filed to the client.
- `org_structure_changes`: planned changes; holdings/entities can be proposed by
  or removed by one (Target / Compare views).
- Every org table: `(workspace_id, client_id)` into clients, references between
  org rows are composite `(client_id, id)` keys, so nothing can cross clients.
- History: trigger `org_record_change` writes `audit_events` (entity_type
  client) with changed fields, before values, and the effective date/reference
  from `last_change_on` / `last_change_ref`.
- Documents: `documents.matter_id` is nullable; a client document has
  `workspace_id` + `client_id` + `org_category`, lives at
  `<ws>/clients/<client>/…`, and never moves home (`guard_document_home`).
  `org_record_documents` links a document to a record (must be the client's own
  document or one on the client's matter).
- `matters.client_entity_id`: a matter may concern one of its client's entities;
  cleared when the matter changes client or workspace.
- Tasks: obligations and renewals become ordinary tasks (`origin_kind`
  `org_obligation` / `org_licence`), filed to the client, author-private as
  before.

### Security

The organisation is firm business (workspace members read, writers write,
viewers read only). It grants nothing: no matter/flow/task policy reads it, an
entity's related matters are read through the matter policy, a linked matter
document stays unreadable to non-members. Suites (all run against the live DB,
rolled back): `supabase/tests/client_organisation.sql` 45/45;
`phase3_matter_boundary.sql` 62/62 after restoring its premise (Podrick was added
to "Playbook Test" on 16 Sep; matter A now sits in the personal workspace);
`clients_matters_flows.sql` 61/61 including F02 (a moved matter drops its entity).

### Charts

Layout in `charts/layout.ts` drives screen, PDF, PowerPoint and SVG. Every line
meets a card at the middle of an edge; lines run straight wherever the cards
allow (a holder with one holding sits over it). Chart style ▾ (per browser, per
client, per chart): squared or straight connectors; a second shareholder enters
the side of the card or joins above it (as the Template Bank decks draw 51% and
25/75); arrowheads; line weight/colour; tinted or white-navy cards; corners.
PowerPoint connectors are glued custom paths; PDF titles are UTF-16.

### AI (needs a provider key; local dev has none)

`read-fields.functions.ts` (licence/entity facts from a parsed document, per
field with page and confidence), `read-process.functions.ts` (SOP → steps),
`ask.functions.ts` (free-text organisation Q&A with record citations). The
Ask chips and "Who signs this?" are deterministic (`answers.ts`) and work
without a key.

### Not built, deliberately

Chart import from Visio and from
PDF/images, live .ics subscription (download only), licence-type editing, and
past reporting lines "as at" a date (roles are dated; parent changes are in
history only).

### Acceptance data left in the Nexis Africa workspace

Fictional clients **Volta Ridge Group** (multi-entity) and **Kpone Bakery
Supplies Ltd** (single company), with a matter "VR Minerals — corporate
housekeeping", one client task, one flow, the preset family "Volta Ridge Group —
processes" and a one-page test certificate PDF. Archive them when no longer
useful.

## A client's marketing, deleting clients and entities, moving chart cards (17 September 2026, later)

### Marketing (Column 7j and 7k merged), private to the client's owner

Migration `20260918120000_client_marketing_and_deletion.sql` is applied live.
Test suite `supabase/tests/client_marketing.sql` passes 36/36, rolled back.

- **Who owns a client.** The owner is the person who created it (`clients.created_by`).
  If a client has no recorded creator, the workspace's owners and admins stand in.
  `is_client_owner(client)` decides this.
- **Who can see marketing.** By default only the owner. The owner adds people as
  contributors or approvers in `client_marketing_access`. Nobody else sees the tab,
  its rows, its files (`<ws>/marketing/<client>/…`) or its history
  (audit `entity_type = 'marketing'`). `marketing_level(client)` returns
  owner, approver, contributor or null.
- **What each level can do.**
  - Contributors draft posts, upload assets and ask for review.
  - Approvers also write the campaign brief, brand kit and consents. They approve
    or retire assets, decide on reviews, override checks with a reason, schedule
    and publish.
  - Only the owner grants access.
- **A post goes out only if** the current version has an approval and every
  blocking check is overridden for that version. The database enforces this in
  `guard_mkt_content`.
- **The checks** come from `mkt_content_checks`:
  - brand-kit words to avoid
  - licence claims, against the licences of the campaign's "speaks as" entity
  - named parties, against consents
  - whether the image is approved and in date
- **Changing a post's text** creates a new version (kept in `mkt_content_versions`).
  If the post was scheduled or published, it goes back to review.
- Scripta does not post to LinkedIn. People mark a post as published and record its
  results themselves.
- **Screens:** `src/marketing/`, shown as the client's Marketing tab (`?tab=marketing&view=…&item=<post>`).
  - Content: board and month schedule
  - Post editor: checks, approvals, versions
  - Campaigns
  - Brand kit
  - Assets
  - Consents
  - Access
  - History

### Deleting a client

- **Who.** Only the owner can move a client to Recently Deleted, restore it or delete
  it for good. The `guard_client_bin` trigger and the delete policy enforce this.
- **Where.** On the client page and as a row or bulk action in Clients. The button is
  shown only to owners (`ownsClient`).
- **Deleting for good:**
  - removes the client's organisation, marketing and documents
  - keeps its matters, flows and tasks, but unfiles them (the FKs are now
    `on delete set null (client_id)`)
  - keeps the client's name on each matter as text
- **Clearing old deletions.** `purge_recently_deleted` now includes clients.

### Deleting an entity

- **Where.** "Delete" appears in the entity dialog and in the side panel of the
  group-structure chart (`dialogs/useDeleteEntity.tsx`). Archive stays available for
  companies that really existed.
- **What goes with it:** shareholdings, appointments and signing rules.
- **What stays, no longer linked to it:** licences, obligations, roles, campaigns and
  matters.
- **Document links** to the entity are removed first. History keeps a record of the
  removal.

### Moving chart cards

- **Moving and panning.** Drag a card to move it; lines re-route from the middle of
  its edges. Drag the background to pan.
- **Snap back** clears both the moves and the pan.
- **Saving.** Moves are saved per browser, per client, chart and view
  (`charts/positions.ts`). Exports use the moved layout.
- **Re-parenting.** In reporting-lines view, dropping a card onto another still offers
  to change the reporting line.
- **Known gap:** a re-routed line does not steer around other cards.

### Verified

- **[LIVE-SQL, rolled back]**
  - client_marketing 36/36
  - clients_matters_flows 61/61
- **[BROWSER], Volta Ridge Group, as the owner.** The test post was taken through
  these steps:
  1. brand kit set up
  2. campaign created, speaking as VR Minerals
  3. post drafted
  4. sent for review with a legal review
  5. checks blocked it: the word "guaranteed" and a lapsed PMMC licence
  6. version 2 approved
  7. both blocks overridden with reasons
  8. scheduled for 24 September
  9. text edited, which sent it back to review as version 3
- **[BROWSER], also checked:**
  - History and Access
  - entity delete, with the confirmation, on a throwaway entity
  - chart moves, panning, persistence and Snap back (done by a background fork)
- **Not checked in the browser:** a second user's view. There is no second login
  locally. SQL tests M02–M09 and M25–M28 cover it.
- **Left in Volta Ridge Group:** the brand kit, the "VR Minerals export launch"
  campaign and the post "First export shipment", with its overrides.

## Essentials or full corporate services (17 September 2026, morning)

### What changed

- **`clients.optional_areas`** (migration `20260919090000_client_optional_areas.sql`,
  applied to the live project). A subset of `licences`, `calendar`, `processes`,
  `marketing`. Empty means essentials: organogram, group structure, people,
  authority, entities, key documents and Ask. Existing clients were given all four,
  with `clients_updated_at` held off so their dates did not move.
- **New client** has a "Full corporate services" switch, off by default, for
  organisations. **Edit** on a client (and "Manage areas" under the organisation
  list) has the switch plus a tick box per area. Changes are logged as
  `client.areas_changed`.
- **What follows the setting:** the organisation list, the Marketing tab, the
  overview (Licences tile, licence panel, compliance items and Calendar link), the
  licence and obligation panels on an entity, "Licences owned" on a person, and
  the Processes shelf in Ask. An area that is off, reached by a link, says so and
  offers Manage areas. Nothing is deleted when an area is switched off.
- **It is a display setting, not a permission.** Any writer in the workspace may
  change it; RLS is unchanged.
- **Helpers:** `areaOn`, `isFullService`, `optionalAreasFor` in `src/lib/clients.ts`;
  the control is `src/clients/ServiceAreas.tsx`.

### Fixed on the way

- **Group structure crashed** ("This page didn't load") for any client with no
  entities: `layoutLayered` ran its straightening pass over `order(0, -1)`, which
  is `[0, -1]`, not empty.
- **Client ownership** (the Delete button) comes from `marketing_level`; it must
  not be gated on the marketing area.
- **Bugatti** had been created while signed in as Podrick, so Kwame could not
  delete it. It was recreated under Kwame (`630daa6d-…`) with its three tasks and
  the old row removed.

### Verified

- **[LIVE-SQL, rolled back]** client_optional_areas 6/6.
- **[BROWSER]** client created with the switch off shows the essentials only, no
  Marketing tab, no Licences tile; an off area by link shows the notice; Licences
  turned on alone appears on its own and is logged; an existing client keeps all
  ten areas and Marketing; Delete shows for the owner with marketing off; every
  area and chart studio opens on an empty client.
- **Not checked in the browser:** creating with the switch on; areas switched off
  on a client that already has licences, filings or processes; a second user.

## Drawing the organogram and group structure (17 September 2026, later)

Kwame could not build a group structure from the chart: no edit control, no way
to draw a shareholding or type a share, no colours, no containers. Both charts
now have **Edit chart** (`?mode=edit`).

### What a lawyer can do in edit mode

- **Draw lines on the chart.** Drag from a dot on a box to another box. On the
  group structure that is a shareholding (holder → company) and asks for the
  share; on the organogram it is a reporting line (manager → report) or a
  dotted line. Dragging to empty space adds a new box there, already joined.
- **+ buttons** on a selected box: add a shareholder or manager above, a
  company or report below, one alongside. Names offer what is already
  recorded, so typing an existing company joins it rather than duplicating it.
- **Double-click** a box to rename it; empty space to add a box or a note.
- **Format panel** (right): fill (palette plus any colour), outline, solid or
  dashed border, a line above the name, a replacement subtitle, an italic
  note, a corner tag; for a line: its share, its own label, solid or dashed,
  colour, arrowhead; containers: label and colour; notes: text.
- **Containers** (Group / Ungroup), **legend** built from what is drawn with
  editable labels, **direction** top-down or left to right, **card width**.
- **Undo/redo** for design and record changes alike (⌘Z, ⇧⌘Z), Delete key,
  shift-click and shift-drag multi-select.

### How it is built

- **Records stay the facts.** Every box and line on the chart is a record
  (entity, person, outside holder, role, holding, reporting line), written
  through `insertRecord`/`updateRecord` so history is kept; `charts/records.ts`
  returns an undo step for each. Deleting a company or role still goes through
  the confirm dialogs and is not undoable.
- **The design is the drawing**: `org_chart_designs` (migration
  `20260919100000`, applied), one jsonb document per client per chart, readable
  by the workspace, written by writers, versioned for optimistic saves
  (`useChartDesign`), never copied into history. Replaces the per-browser
  `px.org.chart-style.*` and `px.org.chart-positions.*` keys; the style is
  carried over on first open, old hand moves are not.
- **Placements are absolute** now, per view and direction (`current:right`),
  so a moved box stays put when the layout changes.
- **One composition** (`charts/compose.ts`: `arrange` then `compose`) feeds the
  canvas, SVG, PDF and PowerPoint. Card height grows for every card when any
  card has a line above the name or a note, so rows stay aligned.
- **PowerPoint**: drawing shapes are named `Scripta · …`; `parsePptx` skips
  them, so an exported deck reads back as cards and lines only.
- Editor: `charts/editor/useChartWorkspace.tsx` (toolbar, panel, canvas
  wiring), `adapters.tsx` (what gestures mean per chart), `fields.tsx`.

### Verified

- **[LIVE-SQL, rolled back]** org_chart_designs 9/9.
- **[UNIT]** design ops, composition, left-to-right routing, absolute
  placement, PowerPoint round trip (1409 tests).
- **[BROWSER]** on a test client, the Bugatti ownership chart was drawn from
  nothing: double-click add, + shareholder (company, person, outside), + held
  companies, drag-to-connect with share, left to right, colours, multi-select
  colour, container, legend, eyebrow/note/tag, dashed labelled line with arrow,
  undo/redo of design and of a removed shareholding, Delete key, reload
  persistence. Organogram: role by double-click, + report with holder,
  drag-to-empty, dotted line. SVG, PDF (rendered with pdf.js) and PowerPoint
  (slide XML read) checked from the real export buttons.
- **Not checked in the browser:** Target/Compare views while editing (the
  "Part of: planned change" choice in the forms), By function view in edit
  mode, a second user seeing the same design.

### Lining boxes up (same day, after Kwame's screenshots)

- **Forks and joins share one upright** (`routeSideways`): a box leading to
  several turns all its lines on one upright; every holder of one box comes
  down one upright, owned by a holder that also splits when there is one.
  Each share sits on its holder's own arm unless that arm is shared by the
  holder's own split. Top down, a moved box redraws its parent's lines on one
  shared run (`applyPositions` bus).
- **Snapping while dragging** (`charts/arrange.ts` `snapMove`): edges and
  centres snap to other boxes within 12 screen px, connected boxes win ties,
  otherwise an 8-unit grid; a pink guide shows the line-up; Alt places freely.
- **Arrange** in the Format panel: align left/centre/right/top/middle/bottom
  and space evenly (3+) for a selection; for one box, line up with the box
  before it, centre over the boxes it leads to, space those evenly; for a
  line, Straighten this line. Arrow keys nudge (Shift for 10).
- Drag listeners are attached when a drag starts, not after React renders, so
  a fast drag is not lost.
- Where lines share a run, clicking the share label selects that line alone.
- ⌘Z / ⇧⌘Z work anywhere on the page in edit mode (not only with the chart
  focused), except inside text fields.
- For one box, "Centre under/beside the boxes leading to it" joins the other
  centring options.
- **[UNIT]** arrange 8 tests, the Bugatti routing case. **[BROWSER]** on the
  test client (Kwame handed over his tab): a dragged box snapped its left edge
  onto its neighbour's; Centre beside the boxes it leads to / leading to it;
  arrow nudges (3 units, undone with ⌘Z); Straighten this line, undone with
  ⌘Z from the panel; selecting a line by its share label; the Bugatti chart
  left symmetrical about Rimac Group on both sides.

### Known gaps

- Lines do not route around boxes placed by hand.
- Legend colour entries start named after the colour ("Navy"); rename them.
- Test client **"ZZ Chart editor test (delete me)"** (`7e57c4a2-…c4a7`) is left
  in the Nexis Africa workspace with the Bugatti drawing on it.

## Client page: editing in place, notes, full width (17 September 2026, afternoon)

- **Header.** The client's own actions (Edit client details, Archive client,
  Delete client) sit in a ⋯ menu beside its name; creating is one "New ▾" menu
  (Note, Task, Matter, Flow). No always-on Edit/Archive/Delete buttons, so it is
  never unclear whether the page or the list below is being changed. Editing
  the client is a dialog titled with it (`EditClientDialog.tsx`), which also
  holds the corporate-services areas ("Manage areas" opens it).
- **Work listed on the client can be acted on there** (`WorkList.tsx`):
  matters and flows open, rename in place (pencil on hover or ⋯ → Rename;
  Enter saves, Esc cancels), archive/restore and delete (confirmed); "Show
  archived" per tab. A flow filed to a matter is archived and deleted with the
  matter, as on the Flow screen. Tasks tick off (instant, a second click reads
  the tick), rename, take a due date, and delete. Each tab carries its own
  create button.
- **A flow shown on the client but not on Flow.** Its matter ("Bugatti Pitch
  Deck") was in Recently Deleted: Flow hides a flow with its matter, the client
  page did not. `loadClientWork` now gives a filed flow, and a matter's task,
  its matter's archived/deleted state.
- **Notes tab** (`ClientNotes.tsx`, `lib/client-notes.ts`, table
  `client_notes`, migration `20260919110000`, applied): Instructions, Meeting
  notes, Note; optional title and date; cards in a grid, filters, search;
  written and edited in place (⌘Enter / Esc); Archive/Restore; Delete asks and
  removes for good. Firm-readable like the client record.
- **Full width.** `.cl-body` no longer caps at 980/1180px; the overview's side
  column grows to 30% (320–480px); notes and rows fill the page.
- **Flow repository.** The "Drop the document here" tile shows only while a
  deliverable has nothing attached; after that "Attach version" (and dropping a
  file anywhere on the deliverable) attaches the next one.
- **[BROWSER]** Bugatti: header menus, note create/edit/archive/restore/delete,
  task rename (pencil and menu), tick and untick, due date; WAGAS: matter
  archive, Show archived, restore; Flow repository with and without uploads.
  Test data reverted (task names, status, due date; WAGAS matter restored).
- **Full screen charts.** "Full screen" in a chart's zoom controls. On the
  organogram and group structure the whole chart page (header, edit toolbar,
  chart, Format panel) fills the window and the panels under the chart are
  hidden; in Chart studio the chart itself fills the window. Esc leaves, after
  closing any open popover or selection first. Containment on `.og-area` and
  `.og-page` is switched off while full screen (`:has`), because container
  queries otherwise trap `position: fixed`. Chart pages also no longer cap at
  1180px (`OrgPage wide`).
- **Boxes of any size.** In edit mode a selected box has square handles on its
  corners; dragging one resizes it (opposite corner fixed, 4-unit grid, 80×36
  minimum), and the Format panel's Size section takes a width and height for
  one or several boxes, with Reset size. Sizes live on `NodeFormat.w/h` and
  apply in every view; `applyPositions` treats a resized box as moved, so its
  lines are drawn again to the middle of its edges. A box given its own height
  wraps a long name (`wrapTo`); PowerPoint keeps a wrapped name as one
  paragraph with line breaks, so it reads back whole.
- **Client Activity tab removed**, with the Activity button on the overview's
  work panel and the audit query that fed it. Old `?tab=activity` links open
  the overview.

## Renaming a flow where its name is shown (2026-09-17)

A flow's name can be changed in two places: the breadcrumb on the flow page, and its card on the matter's Flows tab. Click the pencil beside the name or double-click the name. Enter or clicking away saves, Escape cancels. Both use the shared `src/components/EditableName.tsx`, which saves through `renameFlow` in flow-db. The orange phases card label ("What this matter calls its phases") is `flow.phasesTitle`, a separate field from the flow's name.

## Document previews (2026-09-18)

`src/preview/` is a self-contained previewer used from the flow Repository:

- **FileViewer.tsx** — full-screen viewer in the wireframe `Modal` (a native `<dialog>`, so containers cannot trap it). Light chrome, dark stage, filmstrip on the left, a floating pill with paging and zoom. Arrow keys page, +/− zoom, 0 fits, Escape closes.
- **document.ts** — `useDocument(fileRef, name)` fetches the bytes once per tab, sniffs the kind and opens the file; the stage and the filmstrip share one parsed document.
- **kinds.ts** — kind from the bytes (PDF header, the part names inside an Office zip, image headers), falling back to the extension in the storage path. A `Version` still has no name or mime column; the extension survives in `fileRef`.
- **pdf.ts** (PDF.js), **word.ts** (docx-preview, falling back to the text in `word/document.xml`), **slides.ts** (PptxViewJS), **sheet.ts** (own xlsx reader on JSZip: sheets, shared strings, number formats, column widths, merges, frozen panes, plus CSV).
- **views.tsx** — one view per kind; Word and PDF pages are scaled to the same width so a document and a bundle read alike.

**Why slides.ts rewrites the deck before drawing it.** PptxViewJS takes both the height of a line and the baseline within it from the paragraph's default font size, not from the runs in the paragraph. A 50pt title in a paragraph that defaults to 18pt was drawn at 50pt with 18pt of leading, so wrapped titles landed on top of each other and centred text sat too high. `spaceLines()` writes an exact `a:lnSpc` (1.2 × the largest run) and a matching `a:defRPr sz` into any paragraph whose runs are bigger than its default, in slides, layouts and masters. Checked against PowerPoint's own PDF export of the same deck: every band on the slide now lands within about 1% of where PowerPoint puts it. Remove this if the library fixes the bug upstream.

New dependencies: `pptxviewjs` (MIT, lazily imported) and `chart.js` (its optional peer, for decks with charts).

Tiles in the Repository take the shape of what they show — a page is tall, a slide is wide — and the kind and the count sit in the caption under the name, never drawn over the document itself. A tile opens the viewer from its Preview button or a double-click. Thumbnail storage keys are prefixed `px.flow.thumb.2.`; bump this again if the drawing changes, and older keys are purged on write.

## The clock: time spent on a piece of work (2026-09-22)

One timer serves every workflow tool, and adding a tool to it is one line at
the screen that wants it:

```tsx
<TimeSpent subject={{ kind: "matter", id: matter.id, label: matter.name }} />
```

No column, no migration, no second timer. It is in the matter workbench header
today; the kinds it accepts are `TIME_SUBJECTS` in `src/lib/time-spent.ts`
(`matter`, `document`, `research`, `deliverable`, `flow`, `task`, `learning`),
and adding one is a word in that array.

- **`src/lib/time-spent.ts`** — the model, and the only place the rules live:
  `countedIn`, `totalOf`, `isRunning`, `formatSpan`, `formatWorked`. Pure, and
  tested in `time-spent.test.ts`.
- **`src/lib/time.functions.ts`** — four calls: `loadTimeSpent`, `startTiming`
  (adopts an open sitting rather than opening a second), `beatTiming`,
  `pauseTiming` (`{ stop: true }` closes the sitting).
- **`src/components/TimeSpent.tsx`** — the pill. Reads the record, ticks,
  heartbeats, and writes on the way out of the page.
- **`time_sessions`** (migration `20260922120000_time_spent.sql`, applied to
  the live project) — one row per sitting. `subject_kind`/`subject_id` are a
  loose reference on purpose, with no foreign key and no check constraint, so
  a new tool times itself without a migration. RLS is the author alone, for
  reads as well as writes.

**Three rules it is built on.**

*Nothing starts by itself.* A timer that runs whenever a screen is open records
the tab somebody forgot about, and one number like that makes every other
number worthless. Start is an act.

*Nothing is counted while the app is shut.* A running sitting holds
`running_since`, what it has already counted in `seconds`, and `beat_at` — the
last moment the app said it was watching, written every `BEAT_EVERY` (20s) and
on `pagehide`. A sitting whose heartbeat stopped is read, and settled on the
next start, at that last beat: a tab closed at six counts until six. Up to one
beat of real work is lost, which is the right way round to be wrong for a
number a lawyer signs. `GONE_AFTER` is three beats, because one missed beat is
usually a throttled background tab.

*Totals are derived.* The total is the sum of the sittings, computed on every
read. There is no total column anywhere, for the same reason nothing else in
this schema caches one.

**Pause and Stop are different on purpose.** Pause leaves the sitting open, so
five minutes away does not split a morning into two entries. Stop closes it, so
the next start is a new sitting on the record.

## Inserting a clause (2026-09-22)

A lawyer can add a clause where one is needed: select a clause, press **Insert**
beside Edit, and give the new clause a number, an optional heading and optional
wording.

**The new clause takes a letter. Nothing else moves.** A clause added after 5.2
is offered as 5.2A, not 5.3. Renumbering was never an option: the contract's own
prose says "clause 11" and "clause 3.4", the review's findings cite clause
numbers, and a schedule points back at the clause that calls it up. Those are
words, not links, so a register that renumbers itself leaves every one of them
pointing at the wrong provision, silently and unfixably. The field is editable
for the cases the rule does not fit.

- **`src/lib/clause-insert.ts`** — `suggestClauseNumber` (next free letter,
  case-insensitive), `insertionDoc` (the wording as a tracked insertion),
  `countsInList`. Tested in `clause-insert.test.ts`.
- **`isInsertedNumber`** in `src/lib/export/structure.ts` — a counted number
  with a letter added. Such a clause is read as a clause of the contract (same
  level, listed in the table of contents, headed by its title) but is NOT given
  to Word's list engine: it prints the number it was given, so 5.2 and 5.3 keep
  counting as they did. The docx test asserts three `w:numPr` for four clauses.
- **`insertClauseAfter`** in `src/lib/review.functions.ts` → the
  **`insert_clause`** function (migration `20260922140000_insert_clause.sql`,
  applied to the live project), which shifts the register and inserts in one
  transaction, `security invoker` so RLS still decides.
- The wording is written through **`save_clause_doc`**, never by updating the
  row. `clauses.doc` is the one column `authenticated` may not update
  (column-level grants — every other column it may), because that function is
  what checks the matter, the edit lock and that a tracked change is made in the
  author's own name. Writing the column directly fails with "permission denied
  for table clauses", which is how this was found.

**It survives a re-read.** An inserted clause has no counterpart in the
counterparty's file, so rebuilding the register from that file would have
deleted it. `clauses.drafted_here` marks it; `extractClauses` keeps those rows
and `placeDraftedClauses` puts each one back after the clause it used to
follow, found by wording — so the insertion survives the renumbering that the
re-read was asked for. Document clauses are now written at ordinals spaced by
`ORDINAL_SPACING` (10) so an insertion can sit between two of them without the
register being shifted; an ordinal is an ordering and never a count.

## Mark-up history (2026-09-22)

A **History** tab on Contract Review: every version of every clause, and what
each step of the mark-up did. It answers the question the product could not —
"what did we change here, and what did it say before?" — after the change has
been settled and there is no mark left to look at.

- **`clause_revisions`** is now written on **every save**, from inside
  `save_clause_doc` (kind `step`), plus a `baseline` per clause when a document
  is read. `kept`, `milestone` and `restored` are unchanged.
- **`src/lib/markup-step.ts`** — `describeStep(before, after)` derives the step
  from the two documents rather than from a log: the word-level redline, what
  was proposed, what was settled **and whether it was accepted or rejected**,
  and which phrases were highlighted or unhighlighted. `intoSittings` groups
  steps into a lawyer's sittings (same author, gaps under 45 minutes).
- **How accepted and rejected are told apart:** settling a change removes its
  mark, so the newer document holds no evidence either way. The test is whether
  the words survived — an accepted insertion leaves them, a rejected one takes
  them away; a deletion reads the other way round. Tested in `markup-step.test.ts`.
- **`src/lib/history.functions.ts`** — `loadMarkupHistory` builds the chain per
  clause, describes each step and sends the descriptions, never the documents.
  A `baseline` is read as a starting point, not as a diff, so a re-read does not
  appear as somebody striking out their own accepted wording.
- **`src/review/HistoryTab.tsx`** — the screen. Read-only.

**Three things this migration fixed or found (`20260922160000_markup_history.sql`).**

*A matter with any kept version could not have its document re-read.*
`clause_id` was NOT NULL with ON DELETE CASCADE and the revision was immutable
against DELETE, so the cascade hit the trigger and the whole re-read was
refused. Eight matters were in that state. A revision now outlives its clause:
`clause_id` may be null, ON DELETE SET NULL, with `clause_num`/`clause_title`
kept on the revision so the record still reads.

*The immutability trigger now allows exactly one change* — re-pointing
`clause_id` — so `carryReviewOver` reattaches the history of a clause whose
wording survived a re-read. Everything a revision RECORDS is still unchangeable
and nothing can be deleted.

*RLS had no UPDATE policy*, so that re-pointing failed **silently**: the grant
exists, the policy did not, and an update with no policy matches no rows and
reports success. Found by reading the rows back after a re-read instead of
trusting a call that returned no error. Policy: `writers repoint clause
revisions` — RLS says who may, the trigger says what may change.

**Known limits.** The record starts at the first save after this went in
(nothing is reconstructed). A re-read still rebuilds a clause's wording from
the document, so an amendment of your own that you had accepted is replaced —
the history keeps what it said, and `restore_clause_revision` exists in the
database but has no button yet.

## Writing time up (2026-09-22)

The clock now ends somewhere. Three controls were added to the pill — **⟲
discard**, **✓ Record** beside pause and stop — and a **Time on this file**
card on the Contract Review summary.

**A sitting is not a time entry.** `time_sessions` is what the clock saw, to
the second. `time_entries` is what a lawyer *said the work was*: a date, a
figure in the firm's units, a narrative a client will read, a UTBMS activity
code and whether it is billable. The first is a measurement, the second is a
statement somebody signs, and only the second goes near a bill.
`time_sessions.entry_id` says which sittings an entry accounts for, which is
what stops the same minutes being recorded twice and what puts the clock back
to zero for the next piece of work.

- **Units.** `UNIT_MINUTES` is 6 — a tenth of an hour — and the clock's reading
  is rounded **up** (`unitsFor`), which is the profession's convention; the
  alternative writes off the first three minutes of every piece of work. The
  figure is adjustable a unit at a time in the form, because the lawyer signs
  it, not the clock.
- **The narrative is drafted from the mark-up history.** `proposeTimeNarrative`
  reads the steps in the window the unrecorded sittings cover and writes
  "Reviewing and marking up X; amendments to clauses 4 and 5.1; drafting clause
  3A." It never counts words or marks — a client reads this. Editable, always.
- **Activity codes** are the eleven UTBMS A-codes, so an entry can be exported
  to an e-billing system without being re-coded by hand.
- **Discard** (`resetTiming`) deletes the unrecorded sittings after a
  confirmation: the honest answer to a clock left running over lunch is that
  the measurement was wrong. Time already written up is untouched.
- **Taking an entry back** (`unrecordTime`) deletes it, and its sittings return
  to the clock — the FK is ON DELETE SET NULL, so nothing is lost by undoing a
  mistake.
- Recording writes a `time.recorded` audit event, so the file's Activity shows
  it beside everything else.

Migration `20260922180000_time_entries.sql`, applied to the live project. RLS is
the author alone, for reads as well as writes: how long somebody took is a
conversation with their supervisor, not a column colleagues can browse.

## The Final tab on the deployed app (2026-09-22)

Reported as: no letterhead, no button to press, preview never loads. Three
separate faults, all of them real.

**1. The screen load downloaded the letterhead to decide a checkbox.**
`loadMatterExport` called `loadWorkspacePaper`, which downloads the page image,
the continuation image and the firm's Word template, then unzips the template —
three storage round trips and a JSZip parse, on every load of the Final tab,
to set `hasLetterhead`. Measured against the production Cloudflare Workers
build (`vite build` then `wrangler dev` on the same port, so the session
carries): **3,598 ms**, against 1,170 ms after replacing it with a one-row
metadata read. On the deployed worker that was enough for the request not to
come back at all. The comment at the call site had said not to do this since
the day it was written.

**2. A stalled load rendered an empty contract rather than an error.** The
query had `retry: false` and no deadline, so `doc.data` stayed undefined and
`FinalDocument` fell through to the compare view, which with no data reads
"0 CLAUSES · NOTHING TRACKED" and "Loading…" for ever. `src/lib/deadline.ts`
(`withDeadline`) now bounds both calls — 25s for the document, 60s for the
preview, which is real work — so a stall becomes a sentence and a Retry.

**3. The letterhead controls were two clicks deep.** The panel lived inside the
cover page's edit form, which only appears after selecting the title block and
pressing Edit — and the Edit button itself only appeared once the block was
selected. A lawyer looking for the letterhead found nothing and concluded there
was none. The panel is now drawn on the card under the page, and the Edit
button is shown for any editable part rather than only for a selected one.

**How to reproduce the deployed runtime locally**: `npx vite build` (the output
is a Cloudflare Worker — nitro, `.output/server/wrangler.json`), copy the
non-`VITE_` lines of `.env` to `.output/server/.dev.vars`, then
`npx wrangler dev --config .output/server/wrangler.json --port 8085` — the same
port as the dev server, so the Supabase session in the browser still works.
`vite preview` does not work with this preset.

## Document thumbnails, everywhere (2026-09-22)

`<DocThumb file={{ id, fileRef }} name meta />` — page one of any stored file,
at any size, with a **peek** on hover: the same page drawn at 330px beside the
row, so a reader can tell what a file is without opening it. That is the point:
they are deciding *which* file to open, and every file opened to find out is one
they did not need.

- **`src/lib/thumbnails.ts`** — the renderer, moved out of `matter-flow` so it
  is not a flow thing. `useFileThumbnail(ThumbFile)` is the general hook;
  `useVersionThumbnail(Version)` still exists and delegates. PDFs via PDF.js,
  Word via its own embedded thumbnail or a docx-preview render, decks via slide
  one, workbooks via the first sheet, images themselves. Cached per file id in
  memory and in browser storage, so a list scrolled twice renders once.
- **`src/components/DocThumb.tsx`** — the tile and the peek. `fileKindLabel`
  lives in `src/lib/file-kind.ts` so the component file exports a component.
- In use: Key documents (rows and shelf tiles) and the matter's Documents list.
  Anywhere else that lists files is one line.

## Key documents: the client's own shelves (2026-09-22)

- **Any category.** `documents.org_category` was one of eleven words in a check
  constraint; it is now any non-empty text (migration
  `20260922200000_own_document_categories.sql`). The eleven are still offered
  with their labels — `SelectOrOther`, the area's own "never box the user in"
  control — and what somebody types is kept as typed. `categoryLabel()` reads
  either.
- **The client's order.** `clients.doc_category_order` holds the shelves in the
  order that client files them; `shelfOrder()` puts that first, then the firm's
  order, then anything else they have named, alphabetically. Drag a shelf to
  set it (only in "In shelf order", since dragging in a sorted view would
  appear to do nothing).
- **Sorting**: in shelf order, by name, or newest first.

## The repository shows all versions (2026-09-22)

"✓ Latest version only" said what you were looking at and nothing about what
the other setting gives you, so the way to see a document's history was to
press a tick and hope. It is now a pair — **Latest only | All versions** — and
"All versions" lists the current version, then a rule reading "2 earlier
versions", then the rest, newest first.

## Manuscripts and Book Review (2026-09-23)

**What it is.** Theses, dissertations, books and reports as first-class records
(sidebar: WORKSPACE › Manuscripts, route `/manuscripts`, feature key
`manuscripts`), reviewed by **Book Review** at `/manuscripts/$id` with tabs
Overview · Chapters · Findings · Style sheet · Chapter map · Versions and an
Editorial report (Word) button. Code in `src/manuscripts/`.

**Principle: review locally, validate globally.** No call gets the whole book.

- `parse/` — Word (`docx.ts`, JSZip + the repo's DOM-free XML scanner, heading
  styles/outline levels, parts, "Chapter N" wording, footnotes/endnotes linked
  to their paragraph, tables with cells, captions, figures, equations, TOC,
  bibliography, tracked changes read as accepted) and PDF (`pdf.ts`, pdf.js
  lines → layout heuristics; structure is inferred and says so). Both reduce
  to `ParsedNode` atoms (`model.ts`) with chapter keys and provenance.
- `checks/` — the exact checks, no AI, pure and fast (80,000 words in ~0.1 s):
  references (tables, figures, sections, chapters, appendices, equations;
  numbering; contents vs headings; heading levels), citations vs bibliography,
  style-sheet rules, UK/US spelling families, hyphenation, capitalisation,
  abbreviations (incl. mixed-case short forms and "ABBR (expansion)"),
  numbers, dates, quotation marks, name variants, mechanics. `format: "docx"`
  lets a missing figure/table count as missing (a PDF may simply not show it).
- `functions.ts` — the AI passes (server functions, `callStructured`, usage
  feature `book-review`): `reviewChapter` (descriptive summary + facts, a
  separate editorial assessment, issues inside that chapter only),
  `proofreadPassage` (a correction is kept only if its `original` is really in
  the paragraph), `mapManuscript` (thesis, research questions, chapter roles,
  structural gaps), `crossChapterReview` (reads the summaries' facts against
  each other; with target chapters, keeps only findings touching them).
- `sentences.ts` — atomisation below the paragraph. Sentences are derived
  deterministically (abbreviations, initials, decimals, citations after the
  stop) and addressed `n29.2`. The AI passes read prose a sentence per line and
  must name the sentence; a correction is kept only if its words are in that
  sentence; facts and every saved place carry their sentence; verification
  decides what changed per sentence and proofreads only changed sentences.
  **What the user sees is paragraph atomisation** (Kwame's choice, 2026-09-23:
  sentences were too granular): `ChapterReader.tsx` draws Scripta containers —
  chapter › section › paragraph, cited "3 ¶2" — with the words each open
  finding rests on highlighted inside the paragraph. Sentence precision stays
  internal.
- `dedupe.ts` — one problem said once: every AI pass is told what is already
  raised, and a finding quoting the same words in the same paragraph, or
  restating a manuscript-wide finding about the same chapters, is dropped.
  `groupCorrections` merges the same AI correction made across a chapter
  (a name in lower case throughout) into one finding listing the places.
- `runner.ts` — client orchestration, saved as it goes, cancellable. Scopes:
  whole manuscript, chosen chapters (whole book still the context), final
  consistency, proofreading only. Bibliography-only chapters are never sent to
  a model. Open rule findings a new run no longer raises are retired as
  resolved ("the text or the style sheet has changed"). `verifyVersion` after
  an amended upload: carries every finding across as **remains / fixed /
  introduced**, keeps readings of unchanged chapters, re-reads what changed.
- Style sheet: detected conventions are **proposals** (inactive) until a person
  adopts or reverses them; adopted rules turn queries into corrections and are
  respected by the AI prompts and a code-level guard.

**Data.** Tables `manuscripts`, `manuscript_versions`, `manuscript_nodes`,
`manuscript_chapters`, `manuscript_style_rules`, `manuscript_findings`,
`manuscript_runs` (migrations `20260923100000_manuscripts.sql` and
`20260923110000_manuscripts_matter_boundary.sql`, both applied live). The
generated Supabase types do not know them yet; `db.ts` uses an untyped handle.

**Access (same line as flows).** Unfiled: firm-readable, firm writers write.
Filed to a matter: the matter's team only (`is_matter_member` /
`can_write_matter`), and filing needs write access to the matter. Private: the
author alone. Only the author deletes or changes privacy (trigger). Files:
`<ws>/manuscripts/<id>/…`, `<ws>/<matter>/manuscripts/<id>/…`, or
`<ws>/personal/<uid>/manuscripts/<id>/…`. Suite `supabase/tests/manuscripts.sql`
(16/16; ends in a RAISE carrying the results, so it rolls back).

**Local dev has no AI key**: the exact checks, import, verification carry-over
and every screen work on 127.0.0.1:8085; AI passes stop with "No AI provider is
configured". The AI passes were accepted on the Lovable preview (signed in as
Mawusi). Test files: `~/Downloads/scripta-test/Seeded test thesis - Book
Review.docx` (12 planted problems), `… v2.docx` (two fixed, one new),
`Long test thesis - Book Review.docx` (~80,000 words, ch2↔ch11 contradiction,
ch5 slips). Test manuscripts in the firm workspace are titled `ZZ …`.

**Acceptance (Lovable preview, 2026-09-23).** Seeded thesis: 12/12 planted
problems found, each once, 15 findings, no duplicates (the first run, before
`dedupe.ts`, found 12/12 but raised 30). Long thesis, Chapter 11 only: the
ch2↔ch11 date conflict found from context, ch11's own slip found, nothing from
ch5; 51 lower-case name corrections came back as 2 grouped findings. Final
consistency review added one genuine new finding and repeated nothing.
Adopting "-ise" retired the spelling query and made "organization" a
correction. Verification of v2: 2 fixed, 5 new (both planted, plus a fix that
pointed at the wrong table), 15 still there. Known borderline: an AI
hyphenation correction ("double-coded") before hyphenation was declared style.
