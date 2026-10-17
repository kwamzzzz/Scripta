-- Whether a section's parts are numbered when the document is produced.
--
-- A definitions clause is thirty definitions, and firms do not agree on how
-- they should look. Some number them 1.1, 1.2 and cite them that way. Others
-- print each one as a block headed by the term it defines, because "Business
-- Day" is how anybody actually refers to it and a number in the margin adds
-- nothing. Both are correct drafting; Scripta only ever did the first.
--
-- This is a fact about how the section is PRINTED, not about what it is. The
-- rows keep their `num`, so the order, the parent/child tree and every
-- cross-reference behave exactly as before — nothing downstream has to learn a
-- second way of finding a provision. `num` remains the tree, as the clause
-- structure migration said it does.
--
-- Null means nobody has decided, which is numbered: the behaviour every
-- existing document already has.

alter table public.clauses
  add column if not exists parts_numbered boolean;

comment on column public.clauses.parts_numbered is
  'Print this section''s sub-clauses with their numbers. False prints each part headed by its title alone. Null means numbered, the default. Presentation only: num still carries order and hierarchy.';
