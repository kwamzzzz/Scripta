-- What each AI call spent, so the cap is enforced against real numbers.
-- Append-only: no update or delete policy, so a usage record cannot be
-- rewritten after the fact.

create table if not exists public.ai_usage_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  workspace_id uuid references public.workspaces (id) on delete set null,
  feature text not null,
  provider text not null,
  model text not null,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  -- Null when the model has no rate configured: tokens are known, money is not.
  cost_usd numeric(12, 6),
  ok boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists ai_usage_events_user_created_idx
  on public.ai_usage_events (user_id, created_at desc);

alter table public.ai_usage_events enable row level security;

create policy "ai_usage_events_read_own"
  on public.ai_usage_events for select
  using (auth.uid() = user_id);

create policy "ai_usage_events_insert_own"
  on public.ai_usage_events for insert
  with check (auth.uid() = user_id);
