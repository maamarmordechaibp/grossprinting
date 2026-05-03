-- =============================================================
-- 0004_stage_tracking.sql  —  Production stage time tracking
-- =============================================================

-- ─── stage_entered_at on orders ───────────────────────────────
-- Tracks when the order last entered its current production stage
alter table public.orders
  add column if not exists stage_entered_at timestamptz not null default now();

-- ─── order_stage_history ──────────────────────────────────────
-- Full audit log of every production_stage transition
create table if not exists public.order_stage_history (
  id          uuid primary key default gen_random_uuid(),
  order_id    uuid not null references public.orders on delete cascade,
  from_stage  text,
  to_stage    text not null,
  changed_by  uuid references auth.users on delete set null,
  changed_at  timestamptz not null default now()
);

create index if not exists idx_osh_stage_order_id  on public.order_stage_history(order_id);
create index if not exists idx_osh_stage_changed_at on public.order_stage_history(changed_at);

-- ─── trigger: log stage changes + update stage_entered_at ─────
create or replace function public.log_order_production_stage()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (old.production_stage is distinct from new.production_stage) then
    -- Update timestamp to "now" when entering new stage
    new.stage_entered_at := now();

    -- Append to history
    insert into public.order_stage_history
      (order_id, from_stage, to_stage, changed_by)
    values
      (new.id, old.production_stage::text, new.production_stage::text, auth.uid());
  end if;
  return new;
end;
$$;

create or replace trigger trg_log_order_production_stage
  before update on public.orders
  for each row execute function public.log_order_production_stage();

-- RLS: staff/admin can read stage history
alter table public.order_stage_history enable row level security;

create policy "staff_read_stage_history" on public.order_stage_history
  for select using (
    exists (
      select 1 from public.users
      where id = auth.uid() and role in ('staff', 'manager', 'admin')
    )
  );
