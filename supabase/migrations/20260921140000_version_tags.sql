-- What a version of a document is, in the words a law firm uses for it.
--
-- Scripta worked this out for itself and called anything with a newer version
-- behind it "superseded" — a filing clerk's word for a fact a lawyer can
-- already read off the numbers. What they need to know is what kind of
-- document this is: the draft, the one for execution, the comparison run
-- against the last one. That is a thing a lawyer decides, so it is stored
-- rather than derived.
--
-- Text rather than an enum: the vocabulary belongs to law office practice and
-- will grow, and growing an enum in Postgres is a migration where adding a
-- word to a list is not. The client reads only the tags it knows.
--   draft | execution | comparison | conformed | signed
-- Null on every version filed before this existed, which is not the same fact
-- as "draft" and is not pretended to be.

alter table public.flow_versions
  add column if not exists tag text;

comment on column public.flow_versions.tag is
  'What kind of document this version is, in the firm''s vocabulary: draft, execution, comparison, conformed, signed. Null on versions filed before tags existed.';
