alter table public.plans
  add column if not exists amount_usd numeric(10,2)
  check (amount_usd is null or amount_usd > 0);

update public.plans
set name = '2 Days', days = 2, updated_at = now()
where id = 'daily';

