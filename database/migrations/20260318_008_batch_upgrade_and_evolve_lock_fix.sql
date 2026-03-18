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
  cost bigint,
  remaining_gold bigint
)
language plpgsql
as $$
declare
  v_user_gold bigint;
  v_level integer;
  v_current_species_id integer;
  v_next_species_id integer;
  v_current_species_name text;
  v_next_species_name text;
  v_rarity text;
  v_current_evolution_stage integer;
  v_next_base_attack integer;
  v_next_base_defense integer;
  v_next_base_hp integer;
  v_next_base_speed integer;
  v_cost bigint;
begin
  select up.level,
         current_species.id,
         current_species.name,
         current_species.rarity,
         current_species.evolution_stage,
         current_species.evolves_to
    into v_level,
         v_current_species_id,
         v_current_species_name,
         v_rarity,
         v_current_evolution_stage,
         v_next_species_id
  from public.user_pokemons up
  join public.pokemon_species current_species on current_species.id = up.species_id
  where up.id = p_pokemon_id
    and up.slack_user_id = p_slack_user_id
  for update of up, current_species;

  if not found then
    return query select false, 'pokemon_not_owned', null::integer, null::integer, null::text, null::text, null::bigint, null::bigint;
    return;
  end if;

  if v_next_species_id is null then
    return query select false, 'no_evolution_available', v_current_species_id, null::integer, v_current_species_name, null::text, 0::bigint, null::bigint;
    return;
  end if;

  select ps.name, ps.base_attack, ps.base_defense, ps.base_hp, ps.base_speed
    into v_next_species_name, v_next_base_attack, v_next_base_defense, v_next_base_hp, v_next_base_speed
  from public.pokemon_species ps
  where ps.id = v_next_species_id;

  if not found then
    return query select false, 'no_evolution_available', v_current_species_id, null::integer, v_current_species_name, null::text, 0::bigint, null::bigint;
    return;
  end if;

  if v_next_base_attack is null or v_next_base_defense is null or v_next_base_hp is null or v_next_base_speed is null then
    return query select false, 'species_stats_missing', v_current_species_id, v_next_species_id, v_current_species_name, v_next_species_name, 0::bigint, null::bigint;
    return;
  end if;

  select u.gold into v_user_gold
  from public.users u
  where u.slack_user_id = p_slack_user_id
  for update;

  if not found then
    return query select false, 'user_not_started', null::integer, null::integer, null::text, null::text, null::bigint, null::bigint;
    return;
  end if;

  v_cost := (4000 + (case v_rarity
    when 'uncommon' then 1000
    when 'rare' then 2000
    when 'epic' then 3000
    when 'legendary' then 4000
    when 'mythical' then 5000
    else 0
  end))::bigint * (2::bigint ^ greatest(coalesce(v_current_evolution_stage, 1) - 1, 0));

  if v_user_gold < v_cost then
    return query select false, 'insufficient_gold', v_current_species_id, v_next_species_id, v_current_species_name, v_next_species_name, v_cost, v_user_gold;
    return;
  end if;

  update public.user_pokemons
  set species_id = v_next_species_id,
      attack = greatest(1, ceil(v_next_base_attack * power(1.02, greatest(v_level - 1, 0)))::integer),
      defense = greatest(1, ceil(v_next_base_defense * power(1.02, greatest(v_level - 1, 0)))::integer),
      hp = greatest(1, ceil(v_next_base_hp * power(1.02, greatest(v_level - 1, 0)))::integer),
      speed = greatest(1, ceil(v_next_base_speed * power(1.02, greatest(v_level - 1, 0)))::integer)
  where id = p_pokemon_id
    and slack_user_id = p_slack_user_id;

  update public.users
  set gold = gold - v_cost
  where slack_user_id = p_slack_user_id
    and gold >= v_cost
  returning gold into remaining_gold;

  if remaining_gold is null then
    raise exception 'Gold insuficiente no momento da evolução';
  end if;

  insert into public.transactions (slack_user_id, type, amount)
  values (p_slack_user_id, 'pokemon_evolution', -v_cost);

  return query select true, null::text, v_current_species_id, v_next_species_id, v_current_species_name, v_next_species_name, v_cost, remaining_gold;
end;
$$;

create or replace function public.upgrade_user_pokemon_batch(
  p_slack_user_id text,
  p_pokemon_id bigint,
  p_target_level integer
)
returns table (
  ok boolean,
  reason text,
  previous_level integer,
  new_level integer,
  cost bigint,
  remaining_gold bigint
)
language plpgsql
as $$
declare
  v_user_gold bigint;
  v_level integer;
  v_target_level integer := coalesce(p_target_level, 0);
  v_base_attack integer;
  v_base_defense integer;
  v_base_hp integer;
  v_base_speed integer;
  v_total_cost bigint;
begin
  select up.level, ps.base_attack, ps.base_defense, ps.base_hp, ps.base_speed
    into v_level, v_base_attack, v_base_defense, v_base_hp, v_base_speed
  from public.user_pokemons up
  join public.pokemon_species ps on ps.id = up.species_id
  where up.id = p_pokemon_id
    and up.slack_user_id = p_slack_user_id
  for update of up, ps;

  if not found then
    return query select false, 'pokemon_not_owned', null::integer, null::integer, null::bigint, null::bigint;
    return;
  end if;

  if v_base_attack is null or v_base_defense is null or v_base_hp is null or v_base_speed is null then
    return query select false, 'species_stats_missing', v_level, v_level, 0::bigint, null::bigint;
    return;
  end if;

  if v_target_level <= 0 then
    return query select false, 'invalid_target_level', v_level, v_target_level, 0::bigint, null::bigint;
    return;
  end if;

  if v_level >= 50 then
    return query select false, 'max_level_reached', v_level, v_level, 0::bigint, null::bigint;
    return;
  end if;

  if v_target_level > 50 then
    return query select false, 'target_above_max_level', v_level, v_target_level, 0::bigint, null::bigint;
    return;
  end if;

  if v_target_level <= v_level then
    return query select false, 'target_must_be_higher', v_level, v_target_level, 0::bigint, null::bigint;
    return;
  end if;

  select u.gold into v_user_gold
  from public.users u
  where u.slack_user_id = p_slack_user_id
  for update;

  if not found then
    return query select false, 'user_not_started', null::integer, null::integer, null::bigint, null::bigint;
    return;
  end if;

  v_total_cost := public.calculate_upgrade_total_cost(v_level, v_target_level);

  if v_user_gold < v_total_cost then
    return query select false, 'insufficient_gold', v_level, v_target_level, v_total_cost, v_user_gold;
    return;
  end if;

  update public.user_pokemons
  set level = v_target_level,
      upgrade_spent_gold = coalesce(upgrade_spent_gold, 0) + v_total_cost,
      attack = greatest(1, ceil(v_base_attack * power(1.02, greatest(v_target_level - 1, 0)))::integer),
      defense = greatest(1, ceil(v_base_defense * power(1.02, greatest(v_target_level - 1, 0)))::integer),
      hp = greatest(1, ceil(v_base_hp * power(1.02, greatest(v_target_level - 1, 0)))::integer),
      speed = greatest(1, ceil(v_base_speed * power(1.02, greatest(v_target_level - 1, 0)))::integer)
  where id = p_pokemon_id
    and slack_user_id = p_slack_user_id;

  update public.users
  set gold = gold - v_total_cost
  where slack_user_id = p_slack_user_id
    and gold >= v_total_cost
  returning gold into remaining_gold;

  if remaining_gold is null then
    raise exception 'Gold insuficiente no momento do débito do upgrade em lote';
  end if;

  insert into public.transactions (slack_user_id, type, amount)
  values (p_slack_user_id, 'pokemon_upgrade_batch', -v_total_cost);

  return query select true, null::text, v_level, v_target_level, v_total_cost, remaining_gold;
end;
$$;
