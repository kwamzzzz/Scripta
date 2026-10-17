-- Research-backed clause classification shown on the clause header (see src/lib/clause-tags.ts).
alter table public.clauses
  add column if not exists classification text,
  add column if not exists classification_reason text,
  add column if not exists classification_source text default 'ai';
