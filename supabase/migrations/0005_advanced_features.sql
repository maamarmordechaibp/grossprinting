-- ============================================================
-- 0005_advanced_features.sql
-- Rush surcharge · Booklets · Stock deduction · Receiving log
-- Machines · Profit tracking · Full product catalog
-- ============================================================

-- ── 1. APP SETTINGS  (single-row config) ───────────────────────────
create table if not exists public.app_settings (
  id                     int primary key default 1,
  rush_surcharge_pct     numeric(5,2) not null default 50.00,
  default_tax_pct        numeric(5,2) not null default 0,
  company_name           text default 'Gross Printing',
  updated_at             timestamptz not null default now(),
  constraint app_settings_singleton check (id = 1)
);
insert into public.app_settings (id) values (1) on conflict do nothing;

alter table public.app_settings enable row level security;
drop policy if exists "staff_read_settings" on public.app_settings;
drop policy if exists "admin_write_settings" on public.app_settings;
create policy "staff_read_settings" on public.app_settings for select
  using (exists (select 1 from public.users where id = auth.uid() and role in ('admin','staff','manager')));
create policy "admin_write_settings" on public.app_settings for all
  using (exists (select 1 from public.users where id = auth.uid() and role = 'admin'))
  with check (exists (select 1 from public.users where id = auth.uid() and role = 'admin'));

-- ── 2. ORDER COLUMNS: rush + cost tracking ─────────────────────────
alter table public.orders
  add column if not exists is_rush         boolean       not null default false,
  add column if not exists rush_deadline   timestamptz,
  add column if not exists rush_surcharge  numeric(12,2) not null default 0,
  add column if not exists material_cost   numeric(12,2) not null default 0,
  add column if not exists labor_cost      numeric(12,2) not null default 0,
  add column if not exists overhead_cost   numeric(12,2) not null default 0;

-- Convenience view: profit = total_amount - all costs
create or replace view public.order_profitability as
  select
    o.id,
    o.title,
    o.total_amount,
    o.material_cost + o.labor_cost + o.overhead_cost as total_cost,
    o.total_amount - (o.material_cost + o.labor_cost + o.overhead_cost) as profit,
    case when o.total_amount > 0
      then round(((o.total_amount - (o.material_cost + o.labor_cost + o.overhead_cost)) / o.total_amount) * 100, 2)
      else 0 end as margin_pct
  from public.orders o;

-- ── 3. BOOKLET FIELDS on product_presets and order_items ───────────
alter table public.product_presets
  add column if not exists is_booklet    boolean not null default false,
  add column if not exists default_pages integer;

alter table public.order_items
  add column if not exists is_booklet         boolean not null default false,
  add column if not exists page_count         integer,
  add column if not exists cover_paper_id     uuid references public.paper_stocks(id) on delete set null,
  add column if not exists binding_type       text,    -- 'saddle_stitch' | 'perfect_bind' | 'spiral' | 'wire_o'
  add column if not exists paper_stock_id     uuid references public.paper_stocks(id) on delete set null,
  add column if not exists sheets_used        integer  not null default 0;  -- for stock deduction tracking

-- ── 4. AUTO STOCK DEDUCTION TRIGGER ────────────────────────────────
-- When an order_item is inserted with sheets_used > 0, decrement paper_stocks.stock_qty.
-- When deleted, restore.
create or replace function public.deduct_paper_stock()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (tg_op = 'INSERT') then
    if new.paper_stock_id is not null and new.sheets_used > 0 then
      update public.paper_stocks
        set stock_qty = greatest(0, stock_qty - new.sheets_used)
        where id = new.paper_stock_id;
    end if;
    if new.cover_paper_id is not null and new.is_booklet and new.page_count is not null then
      -- 1 cover sheet per booklet copy (very rough — UI passes finalized count separately if needed)
      update public.paper_stocks
        set stock_qty = greatest(0, stock_qty - new.quantity)
        where id = new.cover_paper_id;
    end if;
    return new;
  elsif (tg_op = 'DELETE') then
    if old.paper_stock_id is not null and old.sheets_used > 0 then
      update public.paper_stocks
        set stock_qty = stock_qty + old.sheets_used
        where id = old.paper_stock_id;
    end if;
    if old.cover_paper_id is not null and old.is_booklet then
      update public.paper_stocks
        set stock_qty = stock_qty + old.quantity
        where id = old.cover_paper_id;
    end if;
    return old;
  end if;
  return null;
end;
$$;

drop trigger if exists trg_deduct_paper_stock on public.order_items;
create trigger trg_deduct_paper_stock
  after insert or delete on public.order_items
  for each row execute function public.deduct_paper_stock();

-- ── 5. PAPER RECEIVING LOG ─────────────────────────────────────────
create table if not exists public.paper_receipts (
  id              uuid primary key default gen_random_uuid(),
  paper_stock_id  uuid not null references public.paper_stocks(id) on delete cascade,
  qty_received    integer not null check (qty_received > 0),
  vendor          text,
  unit_cost       numeric(10,4) default 0,
  invoice_ref     text,
  notes           text,
  received_by     uuid references auth.users on delete set null,
  received_at     timestamptz not null default now()
);
create index if not exists idx_paper_receipts_stock on public.paper_receipts(paper_stock_id);

-- Trigger: auto-increase paper_stocks.stock_qty when a receipt is logged
create or replace function public.add_paper_receipt()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.paper_stocks
    set stock_qty = stock_qty + new.qty_received
    where id = new.paper_stock_id;
  return new;
end;
$$;

drop trigger if exists trg_add_paper_receipt on public.paper_receipts;
create trigger trg_add_paper_receipt
  after insert on public.paper_receipts
  for each row execute function public.add_paper_receipt();

alter table public.paper_receipts enable row level security;
drop policy if exists "staff_paper_receipts" on public.paper_receipts;
create policy "staff_paper_receipts" on public.paper_receipts for all
  using (exists (select 1 from public.users where id = auth.uid() and role in ('admin','staff','manager')))
  with check (exists (select 1 from public.users where id = auth.uid() and role in ('admin','staff','manager')));

-- ── 6. MACHINES + assignment to finishing options ─────────────────
create table if not exists public.machines (
  id           uuid primary key default gen_random_uuid(),
  name         text not null unique,
  description  text,
  is_active    boolean not null default true,
  created_at   timestamptz not null default now()
);

alter table public.finishing_options
  add column if not exists machine_id uuid references public.machines(id) on delete set null;

alter table public.machines enable row level security;
drop policy if exists "staff_machines" on public.machines;
create policy "staff_machines" on public.machines for all
  using (exists (select 1 from public.users where id = auth.uid() and role in ('admin','staff','manager')))
  with check (exists (select 1 from public.users where id = auth.uid() and role in ('admin','staff','manager')));

-- Seed default machines and link to existing finishing options
insert into public.machines (name, description) values
  ('Cutter',         'Guillotine / die cutter'),
  ('Laminator',      'Heat laminator (gloss/matte)'),
  ('Folder',         'Automatic folder'),
  ('Scorer',         'Scoring machine'),
  ('Stapler',        'Saddle-stitch / booklet maker'),
  ('Perfect Binder', 'Hot-glue perfect binder'),
  ('Spiral Coil',    'Spiral / wire-o binder')
on conflict (name) do nothing;

update public.finishing_options f
  set machine_id = m.id
  from public.machines m
  where m.name = 'Cutter'
    and f.name ilike '%cut%' and f.machine_id is null;

update public.finishing_options f
  set machine_id = m.id
  from public.machines m
  where m.name = 'Laminator'
    and f.name ilike '%lamination%' and f.machine_id is null;

update public.finishing_options f
  set machine_id = m.id
  from public.machines m
  where m.name = 'Folder'
    and f.name ilike '%fold%' and f.machine_id is null;

update public.finishing_options f
  set machine_id = m.id
  from public.machines m
  where m.name = 'Scorer'
    and f.name ilike '%scor%' and f.machine_id is null;

update public.finishing_options f
  set machine_id = m.id
  from public.machines m
  where m.name = 'Stapler'
    and (f.name ilike '%staple%' or f.name ilike '%saddle%') and f.machine_id is null;

-- ── 7. EXPAND PRODUCT CATALOG (9 missing categories) ───────────────
insert into public.product_presets (name, finished_width_in, finished_height_in, description, is_booklet, default_pages) values
  ('Booklet — 5.5×8.5',  5.5,  8.5,  'Saddle-stitched booklet (half letter)', true,  16),
  ('Booklet — 8.5×11',   8.5,  11,   'Saddle-stitched / perfect-bound booklet (letter)', true, 24),
  ('Yard Sign 18×24',    18,   24,   'Coroplast yard sign', false, null),
  ('Banner 24×36',       24,   36,   'Vinyl banner medium',  false, null),
  ('Banner 36×72',       36,   72,   'Vinyl banner large',   false, null),
  ('Invitation 5×7',     5,    7,    'Wedding / event invitation', false, null),
  ('Envelope #10',       9.5,  4.125,'#10 business envelope', false, null),
  ('Envelope A7',        7.25, 5.25, 'A7 invitation envelope', false, null),
  ('Brochure Tri-fold',  8.5,  11,   'Letter tri-fold brochure', false, null),
  ('Greeting Card 5×7',  5,    7,    'Folded greeting card (flat 10×7)', false, null),
  ('Rack Card 4×9',      4,    9,    'Standard rack card', false, null),
  ('Label 2×3',          2,    3,    'Adhesive label small', false, null),
  ('Label 3×4',          3,    4,    'Adhesive label medium', false, null),
  ('Receipt Book 5.5×8.5', 5.5, 8.5, 'NCR receipt / invoice book', true, 50),
  ('Die Cut Custom',     4,    4,    'Custom die-cut shape (specify in notes)', false, null),
  ('Simcha Bag Insert',  4,    6,    'Printed insert for simcha favor bag', false, null),
  ('Self Ink Stamp',     2.5,  1,    'Pre-inked rubber stamp', false, null),
  ('Plastic ID Card',    3.375,2.125,'CR80 plastic ID / badge card', false, null),
  ('Presentation Folder',9,    12,   '9×12 pocket folder (flat 18×12)', false, null),
  ('Magnet 4×6',         4,    6,    '4×6 refrigerator magnet', false, null)
on conflict do nothing;

-- ── 8. PRINTABLE INVOICE VIEW (denormalized for QuickBooks export) ─
create or replace view public.invoice_export as
  select
    i.id                           as invoice_id,
    i.invoice_number,
    i.issue_date,
    i.due_date,
    i.status                       as invoice_status,
    i.total                        as invoice_total,
    i.amount_paid,
    coalesce(c.company_name, c.contact_name) as customer_name,
    c.email                        as customer_email,
    c.phone                        as customer_phone,
    c.address                      as customer_address,
    o.title                        as order_title,
    o.id                           as order_id,
    o.is_rush
  from public.invoices i
  join public.orders    o on o.id = i.order_id
  join public.customers c on c.id = o.customer_id;

-- ============================================================
-- end 0005
-- ============================================================
