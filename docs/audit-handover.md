# Audit and fixes handover (1 October 2026)

For Claude and Codex, picking up the Scripta structural audit and the fix work
the next day. Read this first, then the two local files it points to.

---

## 1. Where things live

| What | Where | In git? |
|---|---|---|
| This handover | `docs/audit-handover.md` | yes |
| Shared mailbox (protocol, decisions, change log, reviews) | `/Users/kwame/praxis/.agents/AUDIT-MAILBOX.md` | no (`.agents/` is gitignored, local only) |
| Claude's audit registers and roadmap (C- IDs) | `/Users/kwame/praxis/.agents/audit/claude/registers.md` | no |
| Codex's audit registers and roadmap (X- IDs, F1-F14) | `/Users/kwame/praxis/.agents/audit/codex/registers.md` | no |
| Kwame's decision sheet (answers) | claude.ai artifact `8mksvsiU4jcd4vvRkCA4tw`, db doc `answers/kwame` | no |

**The live checkout is `/Users/kwame/praxis`.** There is a stale clone at
`~/Desktop/Praxis Workbench/repo` (8 September, 429 commits behind). Never work
there; Codex lost its first audit attempt to it.

Dev server: `npx vite dev --host 127.0.0.1 --port 8085 --strictPort` from
`~/praxis`, signed-in origin `http://127.0.0.1:8085` (not `localhost`). It is
started as a background job and stops after two hours; restart it when needed.

---

## 2. How we work (the protocol)

- **Claude builds, Codex reviews.** Codex does not edit product files. For every
  change Claude posts a "Change N for review" entry in the mailbox: commit, files,
  what changed and why, evidence, and what Codex should test. Codex replies in the
  mailbox with approve or change requests.
- **Shipping.** Once tests and a browser check pass, Claude pushes to `main` and
  publishes on Lovable without asking again (Kwame's standing instruction). Pushes
  to `main` sync to Lovable; wait for the edit to show `completed` in
  `list_edits` before `deploy_project`, or the old build is published.
- **Git.** Stage explicit paths only, never `git add -A` (the other agent's
  files may be in the tree). Never force-push or rewrite pushed history.
- **Database changes.** Write a migration file in `supabase/migrations/`, test it
  in a rolled-back `DO` block that ends in `raise exception` (acting as each
  relevant user via `set_config('request.jwt.claims', ...)`), then apply it
  through Lovable `query_database`, then commit the file. Before replacing a
  function, confirm the untouched parts match live (hash of whitespace-stripped
  `prosrc`).
- **Browser checks.** Claude uses its own Chrome tab group and a real window
  resize. **Codex tests in its own isolated browser** (headless Playwright or a
  separate Chrome profile) and clears any screen-size emulation in a `finally`.
  A tab left with a 2000x1000 override made Kwame think the page was broken
  (mailbox rule 5b).
- **Talking to Kwame.** Plain, short, human English; no em dashes; state the
  evidence level (code, live DB, browser). Kwame answers decisions through the
  interactive decision sheet or in chat; do not re-ask decided points.

---

## 3. What has happened so far

**30 Sep: audit.** Claude and Codex each ran the 17-instruction read-only audit
independently, then shared notes through the mailbox. Claude: about 100 findings
(C-1.01 to C-15.04). Codex: 225 findings (X-1.01 to X-16.12), 15 rated Critical,
roadmap F1-F14 / N / S. Claude spot-verified seven of Codex's Critical claims
against code and the live DB; all held. Joint plan adopted: Codex's release gates.

**1 Oct: Kwame's decisions** (full text in the mailbox, "Kwame's decisions"):

- Combined plan; research storage fix first.
- Client-level work (flows, tasks, discussions filed to a client, no matter)
  becomes **firm-visible**.
- New and captured knowledge defaults **Private**, with a visibility choice and
  an anonymise prompt.
- Archived matters, documents and flows are **read-only** until restored.
- Only the **matter lead** may bin a matter.
- 15-day Recently Deleted extended to **Library, Learning, Career** (not Tasks).
- "My tasks" = assigned to me + unassigned ones I created.
- Task and deliverable fully synced (done, due date, owner, one discussion).
- Flow files stay in Flow with a "File as Document" action.
- Firm admins manage people (role, remove, leave, transfer ownership); email
  password reset plus change password.
- Documents library in the sidebar; transcript upload asks for a matter; ⌘K
  searches names across every object type.

**1 Oct: changes shipped** (each posted to the mailbox for Codex review):

| # | Commit | What | Live? |
|---|---|---|---|
| 1 | `48cc4b4` | Research files locked to research members. Storage helpers gained a `research` branch (X-5.03). Migration `20261001010000_research_storage_boundary.sql`. | DB applied |
| 2 | `25aa8f1` | Research "needs attention" chip no longer stretched by the legacy `.wf-tabrow > span` rule. | published |
| 3 | `d920f52` | Pinned research discussion given padding (superseded by 4). | published |
| 4 | `02b90e4` | Research discussion moved into the page (end of Brief), and its author can post: `thread_context` research branch. Migration `20261001020000_research_thread_context.sql`. | DB applied; app publish pending at time of writing |

Codex had not yet posted reviews of changes 1 to 4 when this was written. Check
the mailbox first.

---

## 4. Next steps, in order

1. **Read Codex's reviews** of changes 1 to 4 in the mailbox and act on them.
2. **Publish** if `02b90e4` (and this handover commit) are not live yet.
3. **Gate A, boundaries** (Codex F2, F3, F6, F1):
   - Document and task moves leave files behind (X-5.01, X-7.01, X-15.04): stop
     moves that only patch the foreign key until storage and children move too.
   - Cross-matter id checks in review and AI functions (X-5.02, C-12.03).
   - Deleted matters, documents and flows open read-only, and the DB rejects
     writes to them (X-4.01, X-5.04, X-6.02, X-15.01), plus archived read-only
     (Kwame's decision).
   - Migration history repair: move `*_down.sql` rollbacks out of
     `supabase/migrations/`, fix ordering (X-10.01), reconcile
     `supabase_migrations.schema_migrations`, which stops at 20260916123517
     (later migrations, including today's two, were applied without ledger rows).
4. **Gate B, data loss**: Delete for good ordering (C-4.01, F4); affected-row
   checks in `archive.ts`, `trash.ts`, `deleteTask` (C-4.02, F5); `documents.workspace_id`
   on upload plus backfill (C-5.03, F7); Flow save flush and serialisation (C-6.01, F8).
5. **Trust pass**: F9 to F14 plus Kwame's product decisions above.

Known and not yet fixed, seen in the browser: the Dashboard shows "Your next
matter starts here" for a few seconds before matters load (C-2.04).

---

## 5. Gotchas

- Lovable sync of a pushed commit takes one to three minutes; `deploy_project`
  before `completed` publishes the previous build.
- `query_database` runs against production. Only reads, or rolled-back test
  blocks, until a change is verified.
- Chrome extension: after a Vite full reload the tab may stop answering; open a
  fresh tab. A tab that looks cut off is almost always a leftover viewport
  override, not a layout bug.
- Codex's shell reported "exit 130" reading the mailbox once. That was an
  interrupted command, not a missing file. Plain `cat` or `sed -n` works.
