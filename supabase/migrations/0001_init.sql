-- =============================================================
-- 0001_init.sql  —  Gross Printing initial schema
-- =============================================================

-- ─── EXTENSIONS ───────────────────────────────────────────────
create extension if not exists "pgcrypto";

-- ─── ENUMS ────────────────────────────────────────────────────
create type user_role       as enum ('customer','staff','manager','admin');
create type order_status    as enum ('quote','approved','printing','finishing','completed','delivered','rejected','cancelled');
create type production_stage as enum ('pending','printing','cutting','finished');
create type priority        as enum ('low','normal','high','urgent');
create type color_type      as enum ('bw','color');
create type paper_size      as enum ('A4','A3','Letter','custom');
create type quote_status    as enum ('draft','sent','approved','rejected','expired');
create type invoice_status  as enum ('draft','sent','partial','paid','overdue','void');
create type payment_method  as enum ('cash','bank_transfer','card_manual','stripe');
create type inventory_unit  as enum ('sheet','ml','roll','piece');
create type inventory_category as enum ('paper','ink','other');

-- ─── UPDATED-AT TRIGGER FUNCTION ──────────────────────────────
create or replace function public.set_updated_at()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ─── USERS ────────────────────────────────────────────────────
create table public.users (
  id          uuid primary key references auth.users on delete cascade,
  role        user_role not null default 'customer',
  full_name   text,
  phone       text,
  customer_id uuid,                     -- FK added after customers table
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create trigger trg_users_updated_at
  before update on public.users
  for each row execute function public.set_updated_at();

-- ─── CUSTOMERS ────────────────────────────────────────────────
create table public.customers (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid references auth.users on delete set null,
  company_name  text,
  contact_name  text not null,
  email         text not null,
  phone         text,
  address       text,
  notes         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create trigger trg_customers_updated_at
  before update on public.customers
  for each row execute function public.set_updated_at();

-- Add FK from users → customers
alter table public.users
  add constraint users_customer_id_fkey
  foreign key (customer_id) references public.customers(id) on delete set null;

-- ─── ORDERS ───────────────────────────────────────────────────
create table public.orders (
  id               uuid primary key default gen_random_uuid(),
  customer_id      uuid not null references public.customers on delete restrict,
  created_by       uuid not null references auth.users on delete restrict,
  assigned_to      uuid references public.users on delete set null,
  title            text not null,
  description      text,
  status           order_status not null default 'quote',
  production_stage production_stage not null default 'pending',
  priority         priority not null default 'normal',
  deadline         timestamptz,
  total_amount     numeric(12,2) not null default 0,
  notes            text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index idx_orders_customer_id on public.orders(customer_id);
create index idx_orders_status      on public.orders(status);
create index idx_orders_assigned_to on public.orders(assigned_to);
create index idx_orders_deadline    on public.orders(deadline);

create trigger trg_orders_updated_at
  before update on public.orders
  for each row execute function public.set_updated_at();

-- ─── ORDER STATUS HISTORY ─────────────────────────────────────
create table public.order_status_history (
  id          uuid primary key default gen_random_uuid(),
  order_id    uuid not null references public.orders on delete cascade,
  from_status order_status,
  to_status   order_status not null,
  changed_by  uuid references auth.users on delete set null,
  note        text,
  changed_at  timestamptz not null default now()
);

create index idx_osh_order_id on public.order_status_history(order_id);

-- Trigger: auto-log status changes
create or replace function public.log_order_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (old.status is distinct from new.status) then
    insert into public.order_status_history
      (order_id, from_status, to_status, changed_by)
    values
      (new.id, old.status, new.status, auth.uid());
  end if;
  return new;
end;
$$;

create trigger trg_log_order_status
  after update on public.orders
  for each row execute function public.log_order_status();

-- ─── ORDER ITEMS ──────────────────────────────────────────────
create table public.order_items (
  id               uuid primary key default gen_random_uuid(),
  order_id         uuid not null references public.orders on delete cascade,
  name             text not null,
  quantity         integer not null check (quantity > 0),
  size             paper_size not null default 'A4',
  custom_width_mm  numeric(8,2),
  custom_height_mm numeric(8,2),
  paper_type       text,
  color_type       color_type not null default 'color',
  unit_price       numeric(12,2) not null default 0,
  line_total       numeric(12,2) generated always as (quantity * unit_price) stored,
  created_at       timestamptz not null default now()
);

create index idx_order_items_order_id on public.order_items(order_id);

-- ─── QUOTES ───────────────────────────────────────────────────
create table public.quotes (
  id          uuid primary key default gen_random_uuid(),
  order_id    uuid not null unique references public.orders on delete cascade,
  subtotal    numeric(12,2) not null default 0,
  tax         numeric(12,2) not null default 0,
  total       numeric(12,2) not null default 0,
  valid_until date,
  status      quote_status not null default 'draft',
  decided_at  timestamptz,
  decided_by  uuid references auth.users on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create trigger trg_quotes_updated_at
  before update on public.quotes
  for each row execute function public.set_updated_at();

-- ─── FILES ────────────────────────────────────────────────────
create table public.files (
  id          uuid primary key default gen_random_uuid(),
  order_id    uuid not null references public.orders on delete cascade,
  uploaded_by uuid not null references auth.users on delete restrict,
  bucket      text not null default 'order-files',
  path        text not null,
  name        text not null,
  mime_type   text not null,
  size_bytes  bigint not null,
  version     integer not null default 1,
  label       text,
  is_final    boolean not null default false,
  created_at  timestamptz not null default now()
);

create index idx_files_order_id on public.files(order_id);

-- ─── PRICING RULES ────────────────────────────────────────────
create table public.pricing_rules (
  id           uuid primary key default gen_random_uuid(),
  paper_type   text not null,
  size         paper_size not null,
  color_type   color_type not null,
  min_qty      integer not null default 1,
  max_qty      integer,
  unit_price   numeric(12,2) not null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique(paper_type, size, color_type, min_qty)
);

create trigger trg_pricing_rules_updated_at
  before update on public.pricing_rules
  for each row execute function public.set_updated_at();

-- ─── INVENTORY ────────────────────────────────────────────────
create table public.inventory (
  id            uuid primary key default gen_random_uuid(),
  sku           text not null unique,
  name          text not null,
  unit          inventory_unit not null default 'sheet',
  quantity      numeric(12,2) not null default 0,
  min_quantity  numeric(12,2) not null default 0,
  cost_per_unit numeric(12,4) not null default 0,
  category      inventory_category not null default 'paper',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create trigger trg_inventory_updated_at
  before update on public.inventory
  for each row execute function public.set_updated_at();

-- ─── INVENTORY MOVEMENTS ──────────────────────────────────────
create table public.inventory_movements (
  id            uuid primary key default gen_random_uuid(),
  inventory_id  uuid not null references public.inventory on delete restrict,
  order_id      uuid references public.orders on delete set null,
  delta         numeric(12,2) not null,
  reason        text,
  created_by    uuid references auth.users on delete set null,
  created_at    timestamptz not null default now()
);

create index idx_inv_mov_inventory_id on public.inventory_movements(inventory_id);

-- Trigger: apply movement delta to inventory.quantity
create or replace function public.apply_inventory_movement()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.inventory
  set quantity = quantity + new.delta
  where id = new.inventory_id;
  return new;
end;
$$;

create trigger trg_apply_inventory_movement
  after insert on public.inventory_movements
  for each row execute function public.apply_inventory_movement();

-- ─── INVOICES ─────────────────────────────────────────────────
create sequence if not exists invoice_number_seq start 1000;

create table public.invoices (
  id             uuid primary key default gen_random_uuid(),
  order_id       uuid not null unique references public.orders on delete restrict,
  invoice_number text not null unique default ('INV-' || lpad(nextval('invoice_number_seq')::text, 5, '0')),
  issue_date     date not null default current_date,
  due_date       date,
  subtotal       numeric(12,2) not null default 0,
  tax            numeric(12,2) not null default 0,
  total          numeric(12,2) not null default 0,
  amount_paid    numeric(12,2) not null default 0,
  status         invoice_status not null default 'draft',
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create trigger trg_invoices_updated_at
  before update on public.invoices
  for each row execute function public.set_updated_at();

-- ─── PAYMENTS ─────────────────────────────────────────────────
create table public.payments (
  id                       uuid primary key default gen_random_uuid(),
  invoice_id               uuid not null references public.invoices on delete restrict,
  amount                   numeric(12,2) not null check (amount > 0),
  method                   payment_method not null default 'cash',
  reference                text,
  paid_at                  timestamptz not null default now(),
  recorded_by              uuid references auth.users on delete set null,
  stripe_payment_intent_id text,
  created_at               timestamptz not null default now()
);

create index idx_payments_invoice_id on public.payments(invoice_id);

-- Trigger: update invoice amount_paid + status after payment insert
create or replace function public.update_invoice_on_payment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_total      numeric(12,2);
  v_paid       numeric(12,2);
  v_new_status public.invoice_status;
begin
  select total, amount_paid
    into v_total, v_paid
    from public.invoices
   where id = new.invoice_id;

  v_paid := v_paid + new.amount;

  if v_paid >= v_total then
    v_new_status := 'paid';
  elsif v_paid > 0 then
    v_new_status := 'partial';
  else
    v_new_status := 'sent';
  end if;

  update public.invoices
     set amount_paid = v_paid,
         status      = v_new_status
   where id = new.invoice_id;

  return new;
end;
$$;

create trigger trg_update_invoice_on_payment
  after insert on public.payments
  for each row execute function public.update_invoice_on_payment();

-- ─── JWT HELPER FUNCTIONS ─────────────────────────────────────
create or replace function public.current_user_role()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (auth.jwt() ->> 'role'),
    (select role::text from public.users where id = auth.uid())
  );
$$;

create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.current_user_role() in ('staff','manager','admin');
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.current_user_role() in ('manager','admin');
$$;

create or replace function public.get_my_customer_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select customer_id from public.users where id = auth.uid();
$$;

-- ─── CUSTOM ACCESS TOKEN HOOK ─────────────────────────────────
-- Register this in Supabase Dashboard → Auth → Hooks → Custom Access Token
create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  claims    jsonb;
  v_role    text;
  v_cust_id uuid;
begin
  claims := event -> 'claims';

  select role::text, customer_id
    into v_role, v_cust_id
    from public.users
   where id = (event ->> 'user_id')::uuid;

  claims := jsonb_set(claims, '{role}', to_jsonb(coalesce(v_role,'customer')));
  if v_cust_id is not null then
    claims := jsonb_set(claims, '{customer_id}', to_jsonb(v_cust_id::text));
  end if;

  return jsonb_set(event, '{claims}', claims);
end;
$$;

grant execute on function public.custom_access_token_hook to supabase_auth_admin;
revoke execute on function public.custom_access_token_hook from authenticated, anon, public;

-- ─── AUTO-CREATE USER PROFILE ON SIGNUP ───────────────────────
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role      public.user_role;
  v_full_name text;
  v_customer_id uuid;
begin
  v_role      := coalesce((new.raw_user_meta_data ->> 'role')::public.user_role, 'customer');
  v_full_name := coalesce(new.raw_user_meta_data ->> 'full_name', new.email);

  insert into public.users (id, role, full_name)
  values (new.id, v_role, v_full_name);

  -- Auto-create customer record for customer-role signups
  if v_role = 'customer' then
    insert into public.customers (owner_id, contact_name, email)
    values (new.id, v_full_name, new.email)
    returning id into v_customer_id;

    update public.users set customer_id = v_customer_id where id = new.id;
  end if;

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ─── ATOMIC ORDER CREATION RPC ────────────────────────────────
create or replace function public.create_order_with_items(
  p_customer_id  uuid,
  p_title        text,
  p_description  text,
  p_priority     public.priority,
  p_deadline     timestamptz,
  p_notes        text,
  p_items        jsonb,
  p_file_paths   jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order_id uuid;
  v_item     jsonb;
  v_path     text;
begin
  -- Verify caller owns this customer record
  if not exists (
    select 1 from public.customers
    where id = p_customer_id
      and (owner_id = auth.uid() or public.is_staff())
  ) then
    raise exception 'Not authorized to create orders for this customer';
  end if;

  insert into public.orders
    (customer_id, created_by, title, description, priority, deadline, notes, status)
  values
    (p_customer_id, auth.uid(), p_title, p_description, p_priority, p_deadline, p_notes, 'quote'::public.order_status)
  returning id into v_order_id;

  -- Insert items
  for v_item in select * from jsonb_array_elements(p_items)
  loop
    insert into public.order_items
      (order_id, name, quantity, size, custom_width_mm, custom_height_mm, paper_type, color_type, unit_price)
    values (
      v_order_id,
      v_item ->> 'name',
      (v_item ->> 'quantity')::integer,
      coalesce((v_item ->> 'size')::public.paper_size, 'A4'),
      (v_item ->> 'custom_width_mm')::numeric,
      (v_item ->> 'custom_height_mm')::numeric,
      v_item ->> 'paper_type',
      coalesce((v_item ->> 'color_type')::public.color_type, 'color'),
      coalesce((v_item ->> 'unit_price')::numeric, 0)
    );
  end loop;

  -- Register uploaded file paths
  for v_path in select * from jsonb_array_elements_text(p_file_paths)
  loop
    insert into public.files
      (order_id, uploaded_by, path, name, mime_type, size_bytes)
    values (
      v_order_id,
      auth.uid(),
      v_path,
      split_part(v_path, '/', -1),
      'application/octet-stream',
      0
    );
  end loop;

  return v_order_id;
end;
$$;

-- ─── ENABLE REALTIME ──────────────────────────────────────────
alter publication supabase_realtime add table public.orders;
alter publication supabase_realtime add table public.order_status_history;
alter publication supabase_realtime add table public.files;
