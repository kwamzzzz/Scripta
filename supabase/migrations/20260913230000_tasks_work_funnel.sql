-- Tasks: the operational funnel, not a checklist.
--
-- The table already knew who a task was for, when it was due and where it came
-- from. What it could not say was how a lawyer actually works: that a deadline
-- ("due Friday") and an intention ("work on it Friday") are different facts,
-- that most professional work spends time waiting on somebody else, and that
-- finishing a task usually produces something worth keeping a pointer to.
--
-- Waiting is a status rather than a flag because it is where work sits, not a
-- quality it has. Blocked stays for work stopped by something that is nobody's
-- turn to unblock.
alter type task_status add value if not exists 'Waiting';

-- A task can now arise from anywhere in Scripta, and — most of all — from
-- somebody simply typing it.
alter type source_kind add value if not exists 'manual';
alter type source_kind add value if not exists 'flow';
alter type source_kind add value if not exists 'research';
alter type source_kind add value if not exists 'corporate';
alter type source_kind add value if not exists 'review';

alter table public.tasks
  add column if not exists priority text not null default 'normal'
    check (priority in ('high', 'normal', 'low')),
  -- The day you mean to do it, which is rarely the day it is due.
  add column if not exists planned_on date,
  -- A lightweight checklist. Work that needs phases belongs in a Flow.
  add column if not exists checklist jsonb not null default '[]'::jsonb,
  add column if not exists tags jsonb not null default '[]'::jsonb,
  -- The deliverable this task discharges, if it came from one. Soft: a task
  -- outlives the phase it was raised in.
  add column if not exists flow_deliverable_id uuid
    references public.flow_deliverables(id) on delete set null,
  -- Which Workflow Tool this is work for, so the task can offer to start it.
  add column if not exists tool text,
  -- What the work produced, so a finished task is a small record of it.
  add column if not exists output_kind text,
  add column if not exists output_id uuid,
  add column if not exists output_label text,
  add column if not exists completed_at timestamptz;

create index if not exists tasks_workspace_attention_idx
  on public.tasks (workspace_id, status, due_date);
create index if not exists tasks_deliverable_idx on public.tasks (flow_deliverable_id);
