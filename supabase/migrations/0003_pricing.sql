-- ============================================================
-- 0003_pricing.sql  –  Pricing engine: paper stocks, tiers,
--                      product presets, finishing options
-- ============================================================

-- ── Paper stocks ────────────────────────────────────────────
create table if not exists paper_stocks (
  id                   uuid primary key default gen_random_uuid(),
  name                 text not null,                         -- e.g. "Bond 20lb 8.5x11"
  width_in             numeric(7,3) not null,                 -- sheet width (inches)
  height_in            numeric(7,3) not null,                 -- sheet height (inches)
  bw_price             numeric(10,4) not null default 0,      -- per impression B&W
  color_price          numeric(10,4) not null default 0,      -- per impression color
  duplex_surcharge     numeric(10,4) not null default 0,      -- extra per sheet when double-sided
  stock_qty            integer       not null default 0,      -- sheets on hand
  low_stock_threshold  integer       not null default 100,    -- warn below this
  is_active            boolean       not null default true,
  created_at           timestamptz   not null default now()
);

-- ── Quantity / volume tiers per paper stock ──────────────────
-- Tier applies when min_qty <= order qty <= max_qty (null = unlimited)
create table if not exists pricing_tiers (
  id               uuid primary key default gen_random_uuid(),
  paper_stock_id   uuid not null references paper_stocks(id) on delete cascade,
  min_qty          integer      not null,
  max_qty          integer,                              -- null = no upper limit
  discount_percent numeric(5,2) not null default 0,     -- e.g. 10.00 = 10 %
  created_at       timestamptz  not null default now(),
  constraint tiers_min_lt_max check (max_qty is null or max_qty > min_qty)
);

-- ── Product presets (business card, flyer, …) ───────────────
create table if not exists product_presets (
  id                      uuid primary key default gen_random_uuid(),
  name                    text not null,                -- "Business Card"
  finished_width_in       numeric(7,3) not null,        -- finished piece width
  finished_height_in      numeric(7,3) not null,        -- finished piece height
  description             text,
  default_paper_stock_id  uuid references paper_stocks(id) on delete set null,
  is_active               boolean not null default true,
  created_at              timestamptz not null default now()
);

-- ── Finishing options (cutting, lamination, folding, …) ─────
create table if not exists finishing_options (
  id              uuid primary key default gen_random_uuid(),
  name            text         not null,            -- "Cutting"
  price_per_sheet numeric(10,4) not null default 0, -- charged per press sheet
  price_per_piece numeric(10,4) not null default 0, -- charged per finished piece
  flat_price      numeric(10,4) not null default 0, -- one-time setup / job fee
  description     text,
  is_active       boolean not null default true,
  created_at      timestamptz not null default now()
);

-- ── Seed sensible defaults ───────────────────────────────────
insert into paper_stocks (name, width_in, height_in, bw_price, color_price, duplex_surcharge, stock_qty, low_stock_threshold)
values
  ('Bond 20lb  8.5×11',  8.5,  11,   0.04, 0.12, 0.02, 500, 100),
  ('Bond 20lb  11×17',   11,   17,   0.07, 0.18, 0.03, 300, 75),
  ('Gloss Cover 80lb 8.5×11', 8.5, 11, 0.06, 0.20, 0.03, 200, 50),
  ('Matte Cover 80lb 8.5×11', 8.5, 11, 0.06, 0.18, 0.03, 200, 50)
on conflict do nothing;

insert into product_presets (name, finished_width_in, finished_height_in, description)
values
  ('Business Card',  2,    3.5,  '2" × 3.5" standard business card'),
  ('Postcard 4×6',   4,    6,    '4" × 6" postcard'),
  ('Half Letter',    5.5,  8.5,  '5.5" × 8.5" half-sheet'),
  ('Letter Flyer',   8.5,  11,   'Full letter-size flyer'),
  ('Tabloid / 11×17',11,   17,   'Large-format tabloid flyer')
on conflict do nothing;

insert into finishing_options (name, price_per_sheet, price_per_piece, flat_price, description)
values
  ('Cutting',              0,     0.01, 5.00,  'Guillotine / die cut per piece'),
  ('Lamination (gloss)',   0.08,  0,    10.00, 'Gloss lamination per sheet'),
  ('Lamination (matte)',   0.08,  0,    10.00, 'Matte lamination per sheet'),
  ('Folding',              0,     0.02, 5.00,  'Machine folding per piece'),
  ('Scoring',              0,     0.01, 3.00,  'Score per piece for clean fold'),
  ('Stapling',             0,     0.05, 2.00,  'Staple / saddle-stitch per set')
on conflict do nothing;

-- ── Row-level security ───────────────────────────────────────
alter table paper_stocks      enable row level security;
alter table pricing_tiers     enable row level security;
alter table product_presets   enable row level security;
alter table finishing_options enable row level security;

-- Staff / admin: full access
create policy "staff_all_paper_stocks"
  on paper_stocks for all
  using  (exists (select 1 from users where id = auth.uid() and role in ('admin','staff','manager')))
  with check (exists (select 1 from users where id = auth.uid() and role in ('admin','staff','manager')));

create policy "staff_all_pricing_tiers"
  on pricing_tiers for all
  using  (exists (select 1 from users where id = auth.uid() and role in ('admin','staff','manager')))
  with check (exists (select 1 from users where id = auth.uid() and role in ('admin','staff','manager')));

create policy "staff_all_product_presets"
  on product_presets for all
  using  (exists (select 1 from users where id = auth.uid() and role in ('admin','staff','manager')))
  with check (exists (select 1 from users where id = auth.uid() and role in ('admin','staff','manager')));

create policy "staff_all_finishing_options"
  on finishing_options for all
  using  (exists (select 1 from users where id = auth.uid() and role in ('admin','staff','manager')))
  with check (exists (select 1 from users where id = auth.uid() and role in ('admin','staff','manager')));

-- Customers: read-only for active records (for self-service calculator later)
create policy "public_read_paper_stocks"
  on paper_stocks for select using (is_active = true);

create policy "public_read_product_presets"
  on product_presets for select using (is_active = true);

create policy "public_read_finishing_options"
  on finishing_options for select using (is_active = true);
