-- Add mythical rarity support and atomic evolution RPC.

do $$
begin
  alter table public.pokemon_species
    drop constraint if exists pokemon_species_rarity_check;

  alter table public.pokemon_species
    add constraint pokemon_species_rarity_check
    check (rarity in ('common', 'uncommon', 'rare', 'epic', 'legendary', 'mythical'));
exception
  when duplicate_object then
    null;
end $$;

create or replace function public.evolve_user_pokemon(
  p_slack_user_id text,
  p_pokemon_id bigint
)
returns table (
  ok boolean,
  reason text,
  previous_species_id integer,
  new_species_id integer,
  previous_species_name text,
  new_species_name text,
  cost integer,
  remaining_gold integer
)
language plpgsql
as $$
declare
  v_user_gold integer;
  v_current_species_id integer;
  v_next_species_id integer;
  v_current_species_name text;
  v_next_species_name text;
  v_rarity text;
  v_stage integer;
  v_rarity_tier integer;
  v_cost integer;
begin
  select up.species_id
    into v_current_species_id
  from public.user_pokemons up
  where up.id = p_pokemon_id
    and up.slack_user_id = p_slack_user_id
  for update;

  if not found then
    return query select false, 'pokemon_not_owned', null::integer, null::integer, null::text, null::text, null::integer, null::integer;
    return;
  end if;

  select ps.evolves_to, ps.name, ps.rarity, greatest(ps.evolution_stage, 1)
    into v_next_species_id, v_current_species_name, v_rarity, v_stage
  from public.pokemon_species ps
  where ps.id = v_current_species_id;

  if v_next_species_id is null then
    return query select false, 'no_evolution_available', v_current_species_id, null::integer, v_current_species_name, null::text, 0, null::integer;
    return;
  end if;

  select ps.name into v_next_species_name
  from public.pokemon_species ps
  where ps.id = v_next_species_id;

  if not found then
    return query select false, 'no_evolution_available', v_current_species_id, null::integer, v_current_species_name, null::text, 0, null::integer;
    return;
  end if;

  select u.gold into v_user_gold
  from public.users u
  where u.slack_user_id = p_slack_user_id
  for update;

  if not found then
    return query select false, 'user_not_started', null::integer, null::integer, null::text, null::text, null::integer, null::integer;
    return;
  end if;

  v_rarity_tier := case v_rarity
    when 'uncommon' then 1
    when 'rare' then 2
    when 'epic' then 3
    when 'legendary' then 4
    when 'mythical' then 5
    else 0
  end;

  v_cost := (4000 + (v_rarity_tier * 1000)) * cast(power(2, greatest(v_stage - 1, 0)) as integer);

  if v_user_gold < v_cost then
    return query select false, 'insufficient_gold', v_current_species_id, v_next_species_id, v_current_species_name, v_next_species_name, v_cost, v_user_gold;
    return;
  end if;

  update public.user_pokemons
  set species_id = v_next_species_id
  where id = p_pokemon_id
    and slack_user_id = p_slack_user_id;

  update public.users
  set gold = gold - v_cost
  where slack_user_id = p_slack_user_id
  returning gold into remaining_gold;

  insert into public.transactions (slack_user_id, type, amount)
  values (p_slack_user_id, 'pokemon_evolve', -v_cost);

  return query
  select true,
    null::text,
    v_current_species_id,
    v_next_species_id,
    v_current_species_name,
    v_next_species_name,
    v_cost,
    remaining_gold;
end;
$$;
