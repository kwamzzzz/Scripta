-- A role's kind in the client's own words.
--
-- `kind` stays the tier the app reasons with (leadership on the overview,
-- function heads and above on the escalation ladder, the colour on the chart).
-- `kind_label` is what the client calls it, e.g. "Board member" ranked as
-- leadership. Blank means the tier's own name.

alter table public.org_roles
  add column kind_label text not null default '';
