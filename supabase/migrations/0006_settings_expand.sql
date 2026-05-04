-- Extend app_settings with company contact + invoice defaults
alter table public.app_settings
  add column if not exists company_address text,
  add column if not exists company_phone   text,
  add column if not exists company_email   text,
  add column if not exists invoice_terms   text default 'Net 30',
  add column if not exists invoice_footer  text default 'Thank you for your business!';
