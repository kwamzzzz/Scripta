# Phase 6 — Knowledge Sharing: what exists, and what changes

Grounded in the live database and the repository, not in theory.

## 1. What exists now

**Three knowledge types, plus two things that are not knowledge.**

| | Rows (live) | Owner/creator | Provenance | Archive/delete |
|---|---|---|---|---|
| `playbooks` → `playbook_rules` | 2 (both deleted) / 19 | `owner_id`, no `created_by` | — | archived_at, deleted_at |
| `precedents` | 1 (deleted) | `owner_id`, `created_by` — **both empty** | `matter_id`, `document_id`, `clause_id`, `source_note` | archived_at, deleted_at |
| `templates` → `template_sections` | 2 (both deleted) / 2 | `owner_id`, `created_by` — **both empty** | — | archived_at, deleted_at |
| `flow_presets` / `flow_preset_families` | 1 / 1 | `created_by` set | — | archived_at, deleted_at |
| `letterheads` | 2 | `created_by` set | — | — |

**Every SELECT policy is `is_workspace_member(workspace_id)`.** Exactly the
firm-shared assumption Phase 3 recorded. Writes differ: playbooks and their
rules are admin-only; precedents and templates are `can_write_workspace`.

**Existing status columns are about lifecycle, not sharing.** `playbook_status`
(Active/Draft/Archived), `template_status` (Draft/Active/Retired),
`precedents.status` (free text; the one live row is `executed`), and
`precedents.approved boolean`. `playbooks.approval` reuses the Phase 4
`approval_status` enum and `playbooks.approvers` is a bare array of names.

**Workspace roles are `owner | admin | lawyer | viewer`.**

### Three findings from the inspection

1. **Approval is currently forgeable.** `capturePrecedent()` sends
   `approved: status === "approved" || status === "executed"` from the client.
   Nothing stamps or checks it.
2. **Authorship is never written.** That insert sets neither `created_by` nor
   `owner_id`, which is why both columns are empty in production.
3. **Provenance is stored and returned unguarded.** `PRECEDENT_COLUMNS`
   selects `matter_id, document_id, clause_id, source_note` and hands them to
   any workspace member. No live row carries provenance yet, so this is a
   forward-looking hole rather than an existing exposure — but the shape is
   already there and `capturePrecedent` already accepts it.

### One fact that makes Phase 6 much smaller than it looks

Server functions authenticate with `requireSupabaseAuth`, which builds a
Supabase client from the **publishable key with the caller's JWT**. There is no
service-role bypass anywhere in the knowledge path. So RLS is the single
enforcement point: tightening the SELECT policies tightens the library screens,
the precedent picker, the playbook-rule lookups in `drafting.functions.ts`,
`analysis.functions.ts`, `contract-draft.functions.ts` and `review/functions.ts`
all at once. §11 is satisfied structurally rather than by auditing callers.

## 2. What changes

### Visibility and approval are separate columns, not one status

```
knowledge_visibility : private | shared | firm
approved_at / approved_by  : the professional act
content_changed_at         : when the substance last moved
```

The four lawyer-facing states are the product of the two:

| Lawyer sees | visibility | approval |
|---|---|---|
| Private | `private` | — |
| Shared | `shared` | — |
| Firm-wide | `firm` | none, or stale |
| Approved firm knowledge | `firm` | `approved_at >= content_changed_at` |

**Approval is live only while `approved_at >= content_changed_at`.** That is the
whole of the amendment rule and it needs no digests orversion tables: a trigger
sets `content_changed_at` when *substantive* columns change and leaves it alone
for metadata. A playbook's substance is its rules, so a change to
`playbook_rules` bumps its parent; a template's substance is its sections.

Approval requires `visibility = 'firm'`. Approved knowledge is institutional by
definition, so the two cannot disagree.

### Sharing is one generic table, with the Phase 7 seam built in

```sql
knowledge_shares (kind, object_id, subject_type, subject_id, ...)
```

`subject_type` is `'user'` today and is the only thing Phase 7 has to extend to
add `'team'`. Three typed tables would have to be extended three times. No
Teams, no groups, no membership UI in this phase.

### Provenance is resolved, never selected

`precedents.matter_id`, `document_id`, `clause_id` and `source_note` are
revoked from `authenticated` — the same column-privilege pattern Phase 4 used
for `mentions_seen_at`. A resolver returns rich provenance to someone on the
source matter and a neutral "Derived from prior work" to everyone else.

**Provenance visibility ≤ source visibility.**

### Approval authority

`can_admin_workspace()` — owner or admin. Derived from the existing model
rather than invented: playbooks and their rules are already admin-governed, and
a `lawyer` can write knowledge but cannot make it authoritative. Creating and
sharing stay at `can_write_workspace`.

### Out of scope, deliberately

`letterheads` is firm paper, not knowledge. `flow_presets` /
`flow_preset_families` are workflow scaffolding. Both stay firm-shared; neither
gains the four states. Recorded as a decision, not an omission.

## 3. Migration

Conservative, per §17: **existing knowledge → Firm-wide, Unapproved.**

- `visibility := 'firm'` for every existing row.
- `approved_at := null` everywhere, including the one `executed` precedent.
  Nothing becomes retrospectively authoritative.
- `content_changed_at := coalesce(updated_at, created_at)`.
- Creator information is **preserved where present and never invented**. It is
  absent on every live precedent and template; those stay null.
- `precedents.approved` becomes a trigger-maintained mirror of live approval,
  so existing consumers keep working and the client can no longer set it.

## 4. Tests

Two real users in one firm workspace, plus a third outside it:

- **Private** — B cannot reach A's private item by listing, by id, through a
  child table, through a workflow-tool selector, or through audit.
- **Shared** — B can, C cannot; removing the share removes access.
- **Firm-wide** — members can, an outsider cannot.
- **Approved** — a `lawyer` cannot approve; an admin can; approval is stamped
  server-side and cannot be sent by the client; a substantive edit invalidates
  it and a metadata edit does not.
- **Provenance** — B uses a precedent derived from a matter B is not on, and
  cannot learn the matter through columns, resolver, audit or child rows.
- **Real client shapes** — the security assertions exercise the same inserts
  `capturePrecedent()` actually emits.

## 5. Sequence

1. Enum, columns, `knowledge_shares`, triggers, migration of existing rows.
2. Access helper + RLS on all six tables.
3. Provenance revoke + resolver.
4. Approval RPCs and the stale-approval rule.
5. Client: creation stamps, sharing, approval, the library surfaces.
6. Awareness for "shared directly with me" and "approval invalidated on
   knowledge I maintain".
7. SQL suite, regression suite, browser check.
