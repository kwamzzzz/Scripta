-- What a matter calls its phases.
--
-- "Scope of Services" is the right name for a mandate that was sold as one,
-- and the wrong name for ongoing work — managing an account has phases but no
-- scope of services. The heading is the matter's word, so the matter keeps it.
--
-- Null means the flow has never been renamed and should read "Scope of
-- Services"; the default is not written into the column, so changing the word
-- Scripta falls back to would change it for every flow that never chose one.

alter table public.matter_flows
  add column if not exists phases_title text;

comment on column public.matter_flows.phases_title is
  'What this matter calls the group of phases. Null means the default, "Scope of Services".';
