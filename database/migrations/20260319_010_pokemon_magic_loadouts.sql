create table if not exists public.pokemon_magic_loadouts (
  pokemon_id bigint primary key references public.user_pokemons(id) on delete cascade,
  slack_user_id text not null,
  selected_elements text[] not null default '{}',
  spells jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now())
);

create index if not exists pokemon_magic_loadouts_slack_user_id_idx
  on public.pokemon_magic_loadouts (slack_user_id);

create index if not exists pokemon_magic_loadouts_selected_elements_gin_idx
  on public.pokemon_magic_loadouts using gin (selected_elements);

create index if not exists pokemon_magic_loadouts_spells_gin_idx
  on public.pokemon_magic_loadouts using gin (spells);

create or replace function public.touch_pokemon_magic_loadouts_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := timezone('utc'::text, now());
  return new;
end;
$$;

drop trigger if exists trg_touch_pokemon_magic_loadouts_updated_at on public.pokemon_magic_loadouts;

create trigger trg_touch_pokemon_magic_loadouts_updated_at
before update on public.pokemon_magic_loadouts
for each row
execute function public.touch_pokemon_magic_loadouts_updated_at();
