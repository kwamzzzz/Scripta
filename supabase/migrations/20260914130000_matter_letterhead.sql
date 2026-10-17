-- Whether this contract is drafted onto the firm's paper.
--
-- Until now every contract exported onto the workspace letterhead, and the
-- only place to say otherwise was the finalising screen — after the drafting
-- was done. That is the wrong end of the job. A draft going to the other
-- side's counsel is not on the firm's paper, and the drafter knows that
-- before they write the first clause, not after they finish the last one.
--
-- Null means nobody has said, which is on: what every contract already did.
alter table public.matters
  add column if not exists use_letterhead boolean;

comment on column public.matters.use_letterhead is
  'Print this contract on the workspace letterhead. Null means yes, the long-standing default. Set in the editor; the finalising screen follows it.';
