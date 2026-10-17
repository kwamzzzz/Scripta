-- Where a task came from, for the client organisation workspace.
--
-- A compliance occurrence or a licence renewal can become ordinary Scripta
-- work. The task keeps a pointer back to what raised it, so asking twice finds
-- the task already made instead of making another. Enum values cannot be used
-- in the transaction that adds them, which is why they sit in a file of their
-- own ahead of the schema that relies on them.
alter type source_kind add value if not exists 'org_obligation';
alter type source_kind add value if not exists 'org_licence';
