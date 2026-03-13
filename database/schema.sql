create table if not exists public.users (
  slack_user_id text primary key,
  gold integer not null default 100,
  created_at timestamptz not null default now(),
  last_capture_at timestamptz,
  last_claim_at timestamptz
);

create table if not exists public.pokemon_species (
  id integer primary key,
  name text not null unique,
  generation integer,
  sprite_url text,
  rarity text not null check (rarity in ('common', 'uncommon', 'rare', 'epic', 'legendary')),
  evolution_stage integer not null default 1,
  evolves_from integer references public.pokemon_species(id),
  evolves_to integer references public.pokemon_species(id),
  base_value integer not null default 10,
  created_at timestamptz not null default now()
);

create table if not exists public.user_pokemons (
  id bigint generated always as identity primary key,
  slack_user_id text not null references public.users(slack_user_id) on delete cascade,
  species_id integer not null references public.pokemon_species(id),
  level integer not null default 1,
  shiny boolean not null default false,
  captured_at timestamptz not null default now()
);

create table if not exists public.transactions (
  id bigint generated always as identity primary key,
  slack_user_id text not null references public.users(slack_user_id) on delete cascade,
  type text not null,
  amount integer not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_user_pokemons_user on public.user_pokemons(slack_user_id);
create index if not exists idx_user_pokemons_species on public.user_pokemons(species_id);
create index if not exists idx_transactions_user on public.transactions(slack_user_id);
