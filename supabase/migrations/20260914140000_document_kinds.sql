-- The documents a matter actually accumulates.
--
-- `doc_kind` held the two a review compares — contract and amendment — plus
-- the transcript and playbook the other screens needed. Everything else a firm
-- produces arrived as "contract", because that was the only value left: a
-- letter, a board resolution, a set of minutes and a fee proposal were all
-- filed as contracts and read as though they had clauses.
--
-- Parsing does not branch on this and never has. Every document is extracted
-- and offered to the clause splitter, which records in `structure_detected`
-- whether it found any. The kind says what the document IS, so a screen can
-- file it and a lawyer can find it again.
--
-- Additive only. Existing rows keep the value they have.

alter type public.doc_kind add value if not exists 'letter';
alter type public.doc_kind add value if not exists 'resolution';
alter type public.doc_kind add value if not exists 'minutes';
alter type public.doc_kind add value if not exists 'proposal';
alter type public.doc_kind add value if not exists 'research';
alter type public.doc_kind add value if not exists 'reference';
