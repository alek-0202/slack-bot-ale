create or replace function public.calculate_pokemon_level_stats(
  p_base_attack integer,
  p_base_defense integer,
  p_base_hp integer,
  p_base_speed integer,
  p_level integer
)
returns table (
  attack integer,
  defense integer,
  hp integer,
  speed integer,
  stars integer
)
language plpgsql
immutable
as $$
declare
  v_level integer := greatest(least(coalesce(p_level, 1), 50), 1);
  v_attack integer := greatest(coalesce(p_base_attack, 10), 1);
  v_defense integer := greatest(coalesce(p_base_defense, 10), 1);
  v_hp integer := greatest(coalesce(p_base_hp, 10), 1);
  v_speed integer := greatest(coalesce(p_base_speed, 10), 1);
  v_milestones integer := greatest(least(floor(v_level / 10.0)::integer, 5), 0);
  v_level_gains integer := greatest(v_level - 1, 0);
begin
  return query
  select greatest(round(v_attack * (1 + (0.18 * v_level_gains) + (0.25 * v_milestones)))::integer + case when v_level = 50 then 5 else 0 end, 1),
         greatest(round(v_defense * (1 + (0.18 * v_level_gains) + (0.25 * v_milestones)))::integer + case when v_level = 50 then 5 else 0 end, 1),
         greatest(round(v_hp * (1 + (0.24 * v_level_gains) + (0.35 * v_milestones)))::integer + case when v_level = 50 then 15 else 0 end, 1),
         greatest(round(v_speed * (1 + (0.10 * v_level_gains) + (0.15 * v_milestones)))::integer + case when v_level = 50 then 5 else 0 end, 1),
         v_milestones;
end;
$$;


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
  v_species_id integer;
  v_level integer;
  v_rarity text;
  v_evolution_stage integer;
  v_next_species_id integer;
  v_cost bigint;
  v_current_species_name text;
  v_next_species_name text;
  v_next_base_attack integer;
  v_next_base_defense integer;
  v_next_base_hp integer;
  v_next_base_speed integer;
  v_attack integer;
  v_defense integer;
  v_hp integer;
  v_speed integer;
begin
  select up.species_id, up.level, ps.rarity, ps.evolution_stage, ps.evolves_to, ps.name
    into v_species_id, v_level, v_rarity, v_evolution_stage, v_next_species_id, v_current_species_name
  from public.user_pokemons up
  join public.pokemon_species ps on ps.id = up.species_id
  where up.id = p_pokemon_id
    and up.slack_user_id = p_slack_user_id
  for update of up, ps;

  if not found then
    return query select false, 'pokemon_not_owned', null::integer, null::integer, null::text, null::text, null::bigint, null::bigint;
    return;
  end if;

  if v_next_species_id is null then
    return query select false, 'no_evolution_available', v_species_id, v_species_id, v_current_species_name, v_current_species_name, 0::bigint, null::bigint;
    return;
  end if;

  select ps.name, ps.base_attack, ps.base_defense, ps.base_hp, ps.base_speed
    into v_next_species_name, v_next_base_attack, v_next_base_defense, v_next_base_hp, v_next_base_speed
  from public.pokemon_species ps
  where ps.id = v_next_species_id
  for update;

  if not found then
    return query select false, 'next_species_not_found', v_species_id, v_next_species_id, v_current_species_name, null::text, 0::bigint, null::bigint;
    return;
  end if;

  if v_next_base_attack is null or v_next_base_defense is null or v_next_base_hp is null or v_next_base_speed is null then
    return query select false, 'species_stats_missing', v_species_id, v_species_id, v_current_species_name, v_next_species_name, 0::bigint, null::bigint;
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

  v_cost := (4000 + (case coalesce(v_rarity, 'common')
    when 'uncommon' then 1000
    when 'rare' then 2000
    when 'epic' then 3000
    when 'legendary' then 4000
    when 'mythical' then 5000
    else 0
  end)) * (2 ^ greatest(coalesce(v_evolution_stage, 1) - 1, 0));

  if v_user_gold < v_cost then
    return query select false, 'insufficient_gold', v_species_id, v_next_species_id, v_current_species_name, v_next_species_name, v_cost, v_user_gold;
    return;
  end if;

  select s.attack, s.defense, s.hp, s.speed
    into v_attack, v_defense, v_hp, v_speed
  from public.calculate_pokemon_level_stats(v_next_base_attack, v_next_base_defense, v_next_base_hp, v_next_base_speed, v_level) s;

  update public.user_pokemons
  set species_id = v_next_species_id,
      attack = v_attack,
      defense = v_defense,
      hp = v_hp,
      speed = v_speed
  where id = p_pokemon_id
    and slack_user_id = p_slack_user_id;

  update public.users
  set gold = gold - v_cost
  where slack_user_id = p_slack_user_id
    and gold >= v_cost
  returning gold into remaining_gold;

  if remaining_gold is null then
    raise exception 'Gold insuficiente no momento do débito da evolução';
  end if;

  insert into public.transactions (slack_user_id, type, amount)
  values (p_slack_user_id, 'pokemon_evolution', -v_cost);

  return query select true, null::text, v_species_id, v_next_species_id, v_current_species_name, v_next_species_name, v_cost, remaining_gold;
end;
$$;

create or replace function public.upgrade_user_pokemon(
  p_slack_user_id text,
  p_pokemon_id bigint
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
  v_base_attack integer;
  v_base_defense integer;
  v_base_hp integer;
  v_base_speed integer;
  v_cost bigint;
  v_new_level integer;
  v_attack integer;
  v_defense integer;
  v_hp integer;
  v_speed integer;
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

  if v_level >= 50 then
    return query select false, 'max_level', v_level, v_level, 0::bigint, null::bigint;
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

  v_cost := public.calculate_upgrade_cost(v_level);

  if v_user_gold < v_cost then
    return query select false, 'insufficient_gold', v_level, v_level, v_cost, v_user_gold;
    return;
  end if;

  v_new_level := v_level + 1;

  select s.attack, s.defense, s.hp, s.speed
    into v_attack, v_defense, v_hp, v_speed
  from public.calculate_pokemon_level_stats(v_base_attack, v_base_defense, v_base_hp, v_base_speed, v_new_level) s;

  update public.user_pokemons
  set level = v_new_level,
      upgrade_spent_gold = coalesce(upgrade_spent_gold, 0) + v_cost,
      attack = v_attack,
      defense = v_defense,
      hp = v_hp,
      speed = v_speed
  where id = p_pokemon_id
    and slack_user_id = p_slack_user_id;

  update public.users
  set gold = gold - v_cost
  where slack_user_id = p_slack_user_id
    and gold >= v_cost
  returning gold into remaining_gold;

  if remaining_gold is null then
    raise exception 'Gold insuficiente no momento do débito';
  end if;

  insert into public.transactions (slack_user_id, type, amount)
  values (p_slack_user_id, 'pokemon_upgrade', -v_cost);

  return query select true, null::text, v_level, v_new_level, v_cost, remaining_gold;
end;
$$;

create or replace function public.reset_user_pokemon_upgrades(
  p_slack_user_id text,
  p_pokemon_id bigint
)
returns table (
  ok boolean,
  reason text,
  previous_level integer,
  new_level integer,
  refunded_gold bigint,
  remaining_gold bigint
)
language plpgsql
as $$
declare
  v_level integer;
  v_refund bigint;
  v_base_attack integer;
  v_base_defense integer;
  v_base_hp integer;
  v_base_speed integer;
  v_attack integer;
  v_defense integer;
  v_hp integer;
  v_speed integer;
begin
  select up.level, coalesce(up.upgrade_spent_gold, 0), ps.base_attack, ps.base_defense, ps.base_hp, ps.base_speed
    into v_level, v_refund, v_base_attack, v_base_defense, v_base_hp, v_base_speed
  from public.user_pokemons up
  join public.pokemon_species ps on ps.id = up.species_id
  where up.id = p_pokemon_id
    and up.slack_user_id = p_slack_user_id
  for update of up, ps;

  if not found then
    return query select false, 'pokemon_not_owned', null::integer, null::integer, null::bigint, null::bigint;
    return;
  end if;

  if v_level <= 1 then
    return query select false, 'already_level_one', v_level, v_level, 0::bigint, null::bigint;
    return;
  end if;

  if v_base_attack is null or v_base_defense is null or v_base_hp is null or v_base_speed is null then
    return query select false, 'species_stats_missing', v_level, v_level, 0::bigint, null::bigint;
    return;
  end if;

  select s.attack, s.defense, s.hp, s.speed
    into v_attack, v_defense, v_hp, v_speed
  from public.calculate_pokemon_level_stats(v_base_attack, v_base_defense, v_base_hp, v_base_speed, 1) s;

  update public.user_pokemons
  set level = 1,
      upgrade_spent_gold = 0,
      attack = v_attack,
      defense = v_defense,
      hp = v_hp,
      speed = v_speed
  where id = p_pokemon_id
    and slack_user_id = p_slack_user_id;

  update public.users
  set gold = gold + v_refund
  where slack_user_id = p_slack_user_id
  returning gold into remaining_gold;

  insert into public.transactions (slack_user_id, type, amount)
  values (p_slack_user_id, 'pokemon_upgrade_reset', v_refund);

  return query select true, null::text, v_level, 1, v_refund, remaining_gold;
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
  total_cost bigint,
  remaining_gold bigint
)
language plpgsql
as $$
declare
  v_user_gold bigint;
  v_level integer;
  v_species_id integer;
  v_target_level integer := coalesce(p_target_level, 0);
  v_base_attack integer;
  v_base_defense integer;
  v_base_hp integer;
  v_base_speed integer;
  v_total_cost bigint := 0;
  v_attack integer;
  v_defense integer;
  v_hp integer;
  v_speed integer;
  i integer;
begin
  select up.level, up.species_id
    into v_level, v_species_id
  from public.user_pokemons up
  where up.id = p_pokemon_id
    and up.slack_user_id = p_slack_user_id
  for update;

  if not found then
    return query select false, 'pokemon_not_owned', null::integer, null::integer, null::bigint, null::bigint;
    return;
  end if;

  select ps.base_attack, ps.base_defense, ps.base_hp, ps.base_speed
    into v_base_attack, v_base_defense, v_base_hp, v_base_speed
  from public.pokemon_species ps
  where ps.id = v_species_id;

  if not found then
    return query select false, 'species_stats_missing', v_level, v_level, 0::bigint, null::bigint;
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

  for i in v_level..(v_target_level - 1) loop
    v_total_cost := v_total_cost + public.calculate_upgrade_cost(i);
  end loop;

  if v_user_gold < v_total_cost then
    return query select false, 'insufficient_gold', v_level, v_target_level, v_total_cost, v_user_gold;
    return;
  end if;

  select s.attack, s.defense, s.hp, s.speed
    into v_attack, v_defense, v_hp, v_speed
  from public.calculate_pokemon_level_stats(v_base_attack, v_base_defense, v_base_hp, v_base_speed, v_target_level) s;

  update public.user_pokemons
  set level = v_target_level,
      upgrade_spent_gold = coalesce(upgrade_spent_gold, 0) + v_total_cost,
      attack = v_attack,
      defense = v_defense,
      hp = v_hp,
      speed = v_speed
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
