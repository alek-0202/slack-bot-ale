alter table public.pokemon_species
  add column if not exists element_types text[] not null default '{}'::text[];

update public.pokemon_species
set element_types = '{}'::text[]
where element_types is null;

alter table public.pokemon_species
  alter column element_types set default '{}'::text[];

create table if not exists public.market_change_requests (
  id bigint generated always as identity primary key,
  market_date date not null,
  channel_id text not null,
  platform text not null,
  initiated_by text not null,
  required_confirmations integer not null default 3 check (required_confirmations >= 1),
  confirmation_count integer not null default 0 check (confirmation_count >= 0),
  status text not null default 'pending' check (status in ('pending', 'completed', 'cancelled')),
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index if not exists idx_market_change_requests_daily_channel_unique_pending
  on public.market_change_requests (market_date, channel_id)
  where status in ('pending', 'completed');

create table if not exists public.market_change_confirmations (
  id bigint generated always as identity primary key,
  request_id bigint not null references public.market_change_requests(id) on delete cascade,
  user_id text not null,
  created_at timestamptz not null default now(),
  unique (request_id, user_id)
);

create index if not exists idx_market_change_confirmations_request on public.market_change_confirmations(request_id);
