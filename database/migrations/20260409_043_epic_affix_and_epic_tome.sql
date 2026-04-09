-- Epic tome + persistent epic affix fields on user_pokemons.

alter table public.user_pokemons
  add column if not exists epic_affix_type text,
  add column if not exists epic_affix_value numeric,
  add column if not exists epic_affix_label text,
  add column if not exists epic_affix_value_type text,
  add column if not exists epic_affix_metadata jsonb not null default '{}'::jsonb,
  add column if not exists epic_affix_updated_at timestamptz;

update public.user_pokemons
set epic_affix_metadata = '{}'::jsonb
where epic_affix_metadata is null;

create index if not exists idx_user_pokemons_epic_affix_type
  on public.user_pokemons (epic_affix_type)
  where epic_affix_type is not null;
