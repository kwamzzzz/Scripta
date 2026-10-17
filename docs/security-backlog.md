# Security hardening backlog

Deferred deliberately, with the reason. Not bugs; things that would raise the
floor if the product's risk profile changes.

## `Cache-Control: no-store` on matter documents

**Found:** Phase 3 two-user acceptance test, 15 September 2026.

After a member is removed from a matter, the server correctly refuses
everything: `createSignedUrl` returns "Object not found", `can_read_storage_path`
returns false, and listing the matter's folder returns zero objects. But a file
the person had already downloaded is still served to them by their own browser's
HTTP cache, because the bytes are on their disk.

This is a property of HTTP rather than a defect in Scripta's authorisation, and
no amount of policy work changes it — someone who downloaded a contract also has
it in their Downloads folder. Setting `Cache-Control: no-store` on objects in the
`matter-documents` bucket would stop the *browser cache* replaying them, which
narrows the window without closing the underlying fact.

**Why deferred:** it trades a real performance cost on every document open for a
partial mitigation of something that cannot be fully mitigated. Worth doing if
Scripta ever holds matters where post-revocation access matters more than speed.

**Decided:** Kwame, 15 September 2026 — record rather than implement.
