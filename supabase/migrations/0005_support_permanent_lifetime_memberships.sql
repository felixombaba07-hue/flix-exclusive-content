alter table public.plans add column if not exists is_lifetime boolean not null default false;
update public.plans set is_lifetime = (id = 'lifetime');
alter table public.memberships alter column ends_at drop not null;
alter table public.memberships add column if not exists is_lifetime boolean not null default false;
update public.memberships set is_lifetime = (plan_id = 'lifetime');
