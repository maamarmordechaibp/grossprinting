-- =============================================================
-- 0002_rls.sql  —  Row Level Security policies
-- =============================================================

-- ─── ENABLE RLS ON ALL TABLES ─────────────────────────────────
alter table public.users                 enable row level security;
alter table public.customers             enable row level security;
alter table public.orders                enable row level security;
alter table public.order_items           enable row level security;
alter table public.order_status_history  enable row level security;
alter table public.quotes                enable row level security;
alter table public.files                 enable row level security;
alter table public.pricing_rules         enable row level security;
alter table public.inventory             enable row level security;
alter table public.inventory_movements   enable row level security;
alter table public.invoices              enable row level security;
alter table public.payments              enable row level security;

-- =============================================================
-- USERS
-- =============================================================
-- Users can read and update their own row
create policy "users: own row select"
  on public.users for select
  using (id = auth.uid() or public.is_staff());

create policy "users: own row update"
  on public.users for update
  using (id = auth.uid())
  with check (id = auth.uid());

-- Admins can manage all users
create policy "users: admin full"
  on public.users for all
  using (public.is_admin());

-- =============================================================
-- CUSTOMERS
-- =============================================================
create policy "customers: owner select"
  on public.customers for select
  using (owner_id = auth.uid() or public.is_staff());

create policy "customers: owner update"
  on public.customers for update
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

create policy "customers: staff full"
  on public.customers for all
  using (public.is_staff());

-- =============================================================
-- ORDERS
-- =============================================================
-- Customers can read their own orders
create policy "orders: customer select"
  on public.orders for select
  using (
    customer_id = public.get_my_customer_id()
    or public.is_staff()
  );

-- Customers can create orders for themselves
create policy "orders: customer insert"
  on public.orders for insert
  with check (
    customer_id = public.get_my_customer_id()
    or public.is_staff()
  );

-- Customers can only update while status = 'quote' and only safe columns
create policy "orders: customer update draft"
  on public.orders for update
  using (
    (customer_id = public.get_my_customer_id() and status = 'quote')
    or public.is_staff()
  )
  with check (
    (customer_id = public.get_my_customer_id() and status = 'quote')
    or public.is_staff()
  );

-- Staff can do anything
create policy "orders: staff full"
  on public.orders for all
  using (public.is_staff());

-- =============================================================
-- ORDER ITEMS
-- =============================================================
create policy "order_items: select"
  on public.order_items for select
  using (
    exists (
      select 1 from public.orders o
      where o.id = order_id
        and (o.customer_id = public.get_my_customer_id() or public.is_staff())
    )
  );

create policy "order_items: insert"
  on public.order_items for insert
  with check (
    exists (
      select 1 from public.orders o
      where o.id = order_id
        and (o.customer_id = public.get_my_customer_id() or public.is_staff())
    )
  );

create policy "order_items: update delete"
  on public.order_items for all
  using (
    exists (
      select 1 from public.orders o
      where o.id = order_id
        and public.is_staff()
    )
  );

-- =============================================================
-- ORDER STATUS HISTORY
-- =============================================================
-- Read-only for owner; inserts only via trigger (service role)
create policy "osh: select"
  on public.order_status_history for select
  using (
    exists (
      select 1 from public.orders o
      where o.id = order_id
        and (o.customer_id = public.get_my_customer_id() or public.is_staff())
    )
  );
-- No insert/update/delete policies → clients cannot write directly

-- =============================================================
-- QUOTES
-- =============================================================
create policy "quotes: customer select"
  on public.quotes for select
  using (
    exists (
      select 1 from public.orders o
      where o.id = order_id
        and (o.customer_id = public.get_my_customer_id() or public.is_staff())
    )
  );

-- Customers can only flip status sent→approved/rejected
create policy "quotes: customer decide"
  on public.quotes for update
  using (
    status = 'sent'::public.quote_status
    and exists (
      select 1 from public.orders o
      where o.id = order_id
        and o.customer_id = public.get_my_customer_id()
    )
  )
  with check (
    status in ('approved'::public.quote_status, 'rejected'::public.quote_status)
  );

create policy "quotes: staff full"
  on public.quotes for all
  using (public.is_staff());

-- =============================================================
-- FILES
-- =============================================================
create policy "files: select"
  on public.files for select
  using (
    exists (
      select 1 from public.orders o
      where o.id = order_id
        and (o.customer_id = public.get_my_customer_id() or public.is_staff())
    )
  );

create policy "files: customer insert"
  on public.files for insert
  with check (
    uploaded_by = auth.uid()
    and exists (
      select 1 from public.orders o
      where o.id = order_id
        and o.customer_id = public.get_my_customer_id()
    )
  );

-- Customers can delete only their own non-final files
create policy "files: customer delete own non-final"
  on public.files for delete
  using (
    uploaded_by = auth.uid()
    and is_final = false
  );

create policy "files: staff full"
  on public.files for all
  using (public.is_staff());

-- =============================================================
-- PRICING RULES
-- =============================================================
-- Everyone can read pricing (needed for quote calculation)
create policy "pricing_rules: read all"
  on public.pricing_rules for select
  using (true);

create policy "pricing_rules: admin write"
  on public.pricing_rules for all
  using (public.is_admin());

-- =============================================================
-- INVENTORY
-- =============================================================
create policy "inventory: staff read"
  on public.inventory for select
  using (public.is_staff());

create policy "inventory: admin write"
  on public.inventory for all
  using (public.is_admin());

-- =============================================================
-- INVENTORY MOVEMENTS
-- =============================================================
create policy "inventory_movements: staff read"
  on public.inventory_movements for select
  using (public.is_staff());

create policy "inventory_movements: manager write"
  on public.inventory_movements for insert
  with check (public.is_admin());

-- =============================================================
-- INVOICES
-- =============================================================
create policy "invoices: customer select"
  on public.invoices for select
  using (
    exists (
      select 1 from public.orders o
      where o.id = order_id
        and (o.customer_id = public.get_my_customer_id() or public.is_staff())
    )
  );

create policy "invoices: staff read"
  on public.invoices for select
  using (public.is_staff());

create policy "invoices: admin write"
  on public.invoices for all
  using (public.is_admin());

-- =============================================================
-- PAYMENTS
-- =============================================================
create policy "payments: customer select"
  on public.payments for select
  using (
    exists (
      select 1 from public.invoices i
      join public.orders o on o.id = i.order_id
      where i.id = invoice_id
        and (o.customer_id = public.get_my_customer_id() or public.is_staff())
    )
  );

create policy "payments: staff read"
  on public.payments for select
  using (public.is_staff());

-- Staff can insert non-stripe payments manually
create policy "payments: staff insert manual"
  on public.payments for insert
  with check (
    public.is_staff()
    and method != 'stripe'
  );

-- Admins have full control
create policy "payments: admin full"
  on public.payments for all
  using (public.is_admin());

-- =============================================================
-- STORAGE BUCKET POLICIES
-- (apply after creating buckets in Supabase dashboard)
-- =============================================================

-- Bucket: order-files (private)
-- Policy: authenticated users can upload to their own order folder
-- Policy: authenticated users can read files of orders they can see
-- These are configured via SQL storage policies below:

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'order-files',
  'order-files',
  false,
  52428800, -- 50 MB
  array['application/pdf','image/jpeg','image/png','image/webp']
)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public, file_size_limit)
values (
  'invoices',
  'invoices',
  false,
  10485760  -- 10 MB
)
on conflict (id) do nothing;

-- Storage RLS: order-files — select (read)
create policy "storage order-files: select"
  on storage.objects for select
  using (
    bucket_id = 'order-files'
    and auth.role() = 'authenticated'
    and exists (
      select 1 from public.files f
      join public.orders o on o.id = f.order_id
      where f.path = name
        and (o.customer_id = public.get_my_customer_id() or public.is_staff())
    )
  );

-- Storage RLS: order-files — insert (upload)
create policy "storage order-files: insert"
  on storage.objects for insert
  with check (
    bucket_id = 'order-files'
    and auth.role() = 'authenticated'
  );

-- Storage RLS: order-files — delete
create policy "storage order-files: delete"
  on storage.objects for delete
  using (
    bucket_id = 'order-files'
    and auth.role() = 'authenticated'
    and (auth.uid()::text = (storage.foldername(name))[1] or public.is_staff())
  );

-- Storage RLS: invoices — staff only
create policy "storage invoices: staff select"
  on storage.objects for select
  using (
    bucket_id = 'invoices'
    and public.is_staff()
  );

create policy "storage invoices: staff insert"
  on storage.objects for insert
  with check (
    bucket_id = 'invoices'
    and public.is_staff()
  );
