-- Feature pack baseline (idempotent) for prod databases already in operation.

alter table public.user_pokemons add column if not exists attack integer not null default 10;
alter table public.user_pokemons add column if not exists defense integer not null default 10;
alter table public.user_pokemons add column if not exists hp integer not null default 10;
alter table public.user_pokemons add column if not exists speed integer not null default 10;
alter table public.user_pokemons add column if not exists source text not null default 'capture';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'user_pokemons_level_cap'
      and conrelid = 'public.user_pokemons'::regclass
  ) then
    alter table public.user_pokemons
      add constraint user_pokemons_level_cap check (level >= 1 and level <= 50);
  end if;
end $$;

create table if not exists public.daily_market (
  market_date date not null,
  slot integer not null check (slot between 1 and 3),
  species_id integer not null references public.pokemon_species(id),
  price integer not null check (price >= 0),
  created_at timestamptz not null default now(),
  primary key (market_date, slot)
);

create table if not exists public.market_purchases (
  id bigint generated always as identity primary key,
  market_date date not null,
  slot integer not null,
  slack_user_id text not null references public.users(slack_user_id) on delete cascade,
  user_pokemon_id bigint not null references public.user_pokemons(id) on delete restrict,
  price_paid integer not null check (price_paid >= 0),
  purchased_at timestamptz not null default now(),
  unique (market_date, slot, slack_user_id),
  foreign key (market_date, slot) references public.daily_market(market_date, slot)
);

create table if not exists public.medals (
  id bigint generated always as identity primary key,
  code text not null unique,
  name text not null,
  nature_element text not null,
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.user_medals (
  id bigint generated always as identity primary key,
  slack_user_id text not null references public.users(slack_user_id) on delete cascade,
  medal_id bigint not null references public.medals(id) on delete cascade,
  status text not null default 'locked' check (status in ('locked', 'unlocked')),
  progress integer not null default 0,
  unlocked_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (slack_user_id, medal_id)
);

insert into public.medals (code, name, nature_element, description)
values
  ('flame_heart', 'Coração de Chama', 'fire', 'Concede afinidade com progresso ofensivo e combates agressivos.'),
  ('tidal_guard', 'Guarda das Marés', 'water', 'Concede afinidade com consistência e resistência defensiva.'),
  ('terra_root', 'Raiz da Terra', 'earth', 'Concede afinidade com evolução sustentável de coleção.'),
  ('sky_echo', 'Eco dos Ventos', 'air', 'Concede afinidade com velocidade e ações estratégicas.'),
  ('storm_focus', 'Foco da Tempestade', 'storm', 'Concede afinidade com marcos raros e jogadas de alto impacto.')
on conflict (code) do nothing;

create index if not exists idx_daily_market_date on public.daily_market(market_date);
create index if not exists idx_market_purchases_user_date on public.market_purchases(slack_user_id, market_date);
create index if not exists idx_user_medals_user on public.user_medals(slack_user_id);
