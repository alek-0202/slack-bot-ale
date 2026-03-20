alter table public.user_pokemons add column if not exists current_hp integer;

update public.user_pokemons
set current_hp = hp
where current_hp is null;

alter table public.user_pokemons alter column current_hp set not null;

create table if not exists public.healing_stations (
  slack_user_id text primary key references public.users(slack_user_id) on delete cascade,
  level integer not null default 1 check (level between 1 and 10),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.healing_station_slots (
  id bigint generated always as identity primary key,
  slack_user_id text not null references public.healing_stations(slack_user_id) on delete cascade,
  user_pokemon_id bigint not null references public.user_pokemons(id) on delete cascade,
  healing_started_at timestamptz not null default now(),
  last_processed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (user_pokemon_id)
);

create index if not exists idx_healing_station_slots_user on public.healing_station_slots(slack_user_id);
create index if not exists idx_healing_station_slots_pokemon on public.healing_station_slots(user_pokemon_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_healing_stations_set_updated_at on public.healing_stations;
create trigger trg_healing_stations_set_updated_at
before update on public.healing_stations
for each row execute function public.set_updated_at();
