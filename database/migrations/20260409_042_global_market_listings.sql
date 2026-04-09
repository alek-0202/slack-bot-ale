create table if not exists public.global_market_listings (
  id bigint generated always as identity primary key,
  seller_slack_user_id text not null references public.users(slack_user_id) on delete cascade,
  listing_type text not null check (listing_type in ('item','pokemon')),
  item_key text null,
  pokemon_id bigint null references public.user_pokemons(id) on delete set null,
  title text not null,
  quantity integer not null default 1 check (quantity >= 0),
  price bigint not null check (price > 0),
  metadata jsonb not null default '{}'::jsonb,
  status text not null default 'active' check (status in ('active','sold','cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_global_market_listings_active on public.global_market_listings(status, listing_type, price);
create index if not exists idx_global_market_listings_seller on public.global_market_listings(seller_slack_user_id, status);

create or replace function public.touch_global_market_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_global_market_updated_at on public.global_market_listings;
create trigger trg_global_market_updated_at
before update on public.global_market_listings
for each row execute procedure public.touch_global_market_updated_at();
