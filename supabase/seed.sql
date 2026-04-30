-- =============================================================
-- seed.sql  —  Sample data for Gross Printing
-- Run with: supabase db reset  (resets + runs migrations + seed)
-- =============================================================

-- ─── PRICING RULES ────────────────────────────────────────────
insert into public.pricing_rules (paper_type, size, color_type, min_qty, max_qty, unit_price) values
  ('Standard 80gsm', 'A4',     'bw',    1,    99,   0.08),
  ('Standard 80gsm', 'A4',     'bw',    100,  499,  0.06),
  ('Standard 80gsm', 'A4',     'bw',    500,  null, 0.04),
  ('Standard 80gsm', 'A4',     'color', 1,    99,   0.25),
  ('Standard 80gsm', 'A4',     'color', 100,  499,  0.18),
  ('Standard 80gsm', 'A4',     'color', 500,  null, 0.14),
  ('Standard 80gsm', 'A3',     'bw',    1,    99,   0.14),
  ('Standard 80gsm', 'A3',     'color', 1,    99,   0.45),
  ('Gloss 130gsm',   'A4',     'color', 1,    99,   0.45),
  ('Gloss 130gsm',   'A4',     'color', 100,  499,  0.32),
  ('Gloss 130gsm',   'A4',     'color', 500,  null, 0.24),
  ('Gloss 130gsm',   'A3',     'color', 1,    99,   0.80),
  ('Card 250gsm',    'A4',     'color', 1,    99,   0.90),
  ('Card 250gsm',    'A4',     'bw',    1,    99,   0.50),
  ('Card 250gsm',    'Letter', 'color', 1,    99,   0.85);

-- ─── INVENTORY ────────────────────────────────────────────────
insert into public.inventory (id, sku, name, unit, quantity, min_quantity, cost_per_unit, category) values
  ('a1000000-0000-0000-0000-000000000001', 'PAP-A4-80',  'A4 Standard 80gsm',   'sheet', 15000, 2000, 0.018, 'paper'),
  ('a1000000-0000-0000-0000-000000000002', 'PAP-A3-80',  'A3 Standard 80gsm',   'sheet',  4000, 1000, 0.035, 'paper'),
  ('a1000000-0000-0000-0000-000000000003', 'PAP-A4-130', 'A4 Gloss 130gsm',     'sheet',  8000, 1500, 0.038, 'paper'),
  ('a1000000-0000-0000-0000-000000000004', 'PAP-A4-250', 'A4 Card 250gsm',      'sheet',  3500,  500, 0.065, 'paper'),
  ('a1000000-0000-0000-0000-000000000005', 'INK-C-1L',   'Cyan Ink 1L',         'ml',     2400,  500, 0.045, 'ink'),
  ('a1000000-0000-0000-0000-000000000006', 'INK-M-1L',   'Magenta Ink 1L',      'ml',      320,  500, 0.045, 'ink'),  -- LOW STOCK
  ('a1000000-0000-0000-0000-000000000007', 'INK-Y-1L',   'Yellow Ink 1L',       'ml',     1800,  500, 0.045, 'ink'),
  ('a1000000-0000-0000-0000-000000000008', 'INK-K-1L',   'Black Ink 1L',        'ml',      180,  500, 0.038, 'ink');  -- LOW STOCK
