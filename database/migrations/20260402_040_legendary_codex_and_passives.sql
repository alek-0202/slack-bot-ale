create table if not exists public.user_legendary_codex (
  id bigserial primary key,
  slack_user_id text not null references public.users(slack_user_id) on delete cascade,
  passive_id text not null,
  passive_code text not null unique,
  efficiency numeric(8,4) not null default 0,
  rolled_values jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_legendary_codex_user_passive_unique unique (slack_user_id, passive_id)
);

create index if not exists idx_user_legendary_codex_user on public.user_legendary_codex (slack_user_id, efficiency desc);

alter table public.user_pokemons
  add column if not exists legendary_passive_id text,
  add column if not exists legendary_passive_code text,
  add column if not exists legendary_passive_values jsonb not null default '{}'::jsonb,
  add column if not exists legendary_passive_efficiency numeric(8,4) not null default 0;

create or replace function public.apply_legendary_codex_to_pokemon(
  p_slack_user_id text,
  p_pokemon_id bigint,
  p_passive_id text,
  p_passive_code text,
  p_rolled_values jsonb,
  p_efficiency numeric,
  p_gold_cost bigint,
  p_essence_cost integer
)
returns table (
  ok boolean,
  reason text
)
language plpgsql
security definer
as $$
declare
  v_gold bigint;
  v_essence integer;
  v_rarity text;
begin
  select gold, coalesce(pokemon_essence, 0) into v_gold, v_essence
  from public.users
  where slack_user_id = p_slack_user_id
  for update;

  if not found then
    return query select false, 'user_not_found'::text;
    return;
  end if;

  select ps.rarity into v_rarity
  from public.user_pokemons up
  join public.pokemon_species ps on ps.id = up.species_id
  where up.id = p_pokemon_id
    and up.slack_user_id = p_slack_user_id
  for update;

  if not found then
    return query select false, 'pokemon_not_found'::text;
    return;
  end if;

  if coalesce(lower(v_rarity), '') <> 'legendary' then
    return query select false, 'pokemon_not_legendary'::text;
    return;
  end if;

  if v_gold < p_gold_cost then
    return query select false, 'insufficient_gold'::text;
    return;
  end if;

  if v_essence < p_essence_cost then
    return query select false, 'insufficient_essence'::text;
    return;
  end if;

  update public.users
  set gold = gold - p_gold_cost,
      pokemon_essence = pokemon_essence - p_essence_cost
  where slack_user_id = p_slack_user_id;

  update public.user_pokemons
  set legendary_passive_id = p_passive_id,
      legendary_passive_code = p_passive_code,
      legendary_passive_values = coalesce(p_rolled_values, '{}'::jsonb),
      legendary_passive_efficiency = greatest(0, coalesce(p_efficiency, 0))
  where id = p_pokemon_id
    and slack_user_id = p_slack_user_id;

  return query select true, null::text;
end;
$$;
