create table if not exists public.verotel_checkout_intents (
 id uuid primary key default gen_random_uuid(),
 reference_id text not null unique,
 user_id uuid not null references auth.users(id) on delete cascade,
 plan_id text not null references public.plans(id),
 amount numeric(10,2) not null check(amount>0),
 currency text not null check(currency in ('USD','EUR','GBP','AUD','CAD','CHF','DKK','NOK','SEK')),
 period text not null,
 status text not null default 'pending' check(status in ('pending','paid','declined','refunded','expired')),
 sale_id text unique,
 created_at timestamptz not null default now(),
 paid_at timestamptz
);
alter table public.verotel_checkout_intents enable row level security;
drop policy if exists "users read own checkout intents" on public.verotel_checkout_intents;
create policy "users read own checkout intents" on public.verotel_checkout_intents for select using ((select auth.uid())=user_id);
