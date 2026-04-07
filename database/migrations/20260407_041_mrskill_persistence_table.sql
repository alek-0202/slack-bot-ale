create table if not exists public.user_pokemon_characteristic_skills (
  id bigint generated always as identity primary key,
  pokemon_id bigint not null references public.user_pokemons(id) on delete cascade,
  slack_user_id text not null,
  skill_id text not null,
  slot smallint not null check (slot between 1 and 2),
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  unique (pokemon_id, slot),
  unique (pokemon_id, skill_id)
);

create index if not exists user_pokemon_characteristic_skills_owner_idx
  on public.user_pokemon_characteristic_skills (slack_user_id, pokemon_id);

create or replace function public.touch_user_pokemon_characteristic_skills_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := timezone('utc'::text, now());
  return new;
end;
$$;

drop trigger if exists trg_touch_user_pokemon_characteristic_skills_updated_at on public.user_pokemon_characteristic_skills;
create trigger trg_touch_user_pokemon_characteristic_skills_updated_at
before update on public.user_pokemon_characteristic_skills
for each row
execute function public.touch_user_pokemon_characteristic_skills_updated_at();

insert into public.user_pokemon_characteristic_skills (pokemon_id, slack_user_id, skill_id, slot, is_active)
select
  pml.pokemon_id,
  pml.slack_user_id,
  entry->>'id' as skill_id,
  row_number() over (partition by pml.pokemon_id order by ordinality)::smallint as slot,
  true
from public.pokemon_magic_loadouts pml,
  jsonb_array_elements(coalesce(pml.spells, '[]'::jsonb)) with ordinality as entries(entry, ordinality)
where coalesce(entries.entry->>'kind', '') = 'characteristic'
on conflict (pokemon_id, skill_id) do update
set
  slot = excluded.slot,
  is_active = true,
  slack_user_id = excluded.slack_user_id,
  updated_at = timezone('utc'::text, now());
