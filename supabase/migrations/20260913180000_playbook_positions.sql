-- A playbook the lawyer can read, and a position that knows where it belongs.
--
-- Positions were a flat ordered list, so a playbook with twenty-five of them
-- was a wall of rules with no way in. A category is how a lawyer already thinks
-- about them — risk allocation here, boilerplate there — so the overview can
-- group what the list could only enumerate.
--
-- `our_role` is the side the playbook is written from. A liability cap that is
-- prudent for a customer is unacceptable to a supplier, and a playbook that
-- does not say which side it speaks for cannot be applied to either.

alter table public.playbook_rules add column if not exists category text;
alter table public.playbooks add column if not exists our_role text;

comment on column public.playbook_rules.category is
  'Commercial, Risk allocation, Operational, IP and data, or Boilerplate. Null groups as Uncategorised.';
comment on column public.playbooks.our_role is
  'The side this playbook is written from: Customer, Supplier, Employer, Lender and so on.';

create index if not exists playbook_rules_playbook_category_idx
  on public.playbook_rules (playbook_id, category, ordinal);
