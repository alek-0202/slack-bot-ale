alter table public.users
  add column if not exists pokemon_essence integer not null default 0;

update public.users
set pokemon_essence = greatest(coalesce(pokemon_essence, 0), 0) + 5000;

alter table public.user_pokemons
  add column if not exists shiny_type text,
  add column if not exists attack_iv integer not null default 0,
  add column if not exists magic_iv integer not null default 0,
  add column if not exists defense_iv integer not null default 0,
  add column if not exists hp_iv integer not null default 0,
  add column if not exists speed_iv integer not null default 0,
  add column if not exists crit_level integer not null default 0,
  add column if not exists dodge_level integer not null default 0,
  add column if not exists elemental_level integer not null default 0;

update public.user_pokemons
set shiny_type = 'normal'
where shiny = true
  and shiny_type is null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'user_pokemons_shiny_type_check'
      and conrelid = 'public.user_pokemons'::regclass
  ) then
    alter table public.user_pokemons
      add constraint user_pokemons_shiny_type_check
      check (shiny_type in ('prime', 'normal') or shiny_type is null);
  end if;
end $$;

create or replace function public.calculate_pokemon_level_stats(
  p_base_attack integer,
  p_base_magic integer,
  p_base_defense integer,
  p_base_hp integer,
  p_base_speed integer,
  p_level integer,
  p_attack_iv integer default 0,
  p_magic_iv integer default 0,
  p_defense_iv integer default 0,
  p_hp_iv integer default 0,
  p_speed_iv integer default 0,
  p_rarity text default null,
  p_is_shiny boolean default false,
  p_shiny_type text default null
)
returns table (
  attack integer,
  magic integer,
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
  v_legendary_bonus integer := case when coalesce(p_rarity, '') in ('legendary', 'mythical') then 15 else 0 end;
  v_attack integer := greatest(coalesce(p_base_attack, 10) + v_legendary_bonus, 1);
  v_magic integer := greatest(coalesce(p_base_magic, p_base_attack, 10) + v_legendary_bonus, 1);
  v_defense integer := greatest(coalesce(p_base_defense, 10) + v_legendary_bonus, 1);
  v_hp integer := greatest(coalesce(p_base_hp, 10) + v_legendary_bonus, 1);
  v_speed integer := greatest(coalesce(p_base_speed, 10) + v_legendary_bonus, 1);
  v_milestones integer := greatest(least(floor(v_level / 10.0)::integer, 5), 0);
  v_level_gains integer := greatest(v_level - 1, 0);
  v_is_shiny boolean := coalesce(p_is_shiny, false);
  v_is_prime boolean := coalesce(p_is_shiny, false) and coalesce(p_shiny_type, '') = 'prime';
begin
  return query
  select
    greatest(round((greatest(round(v_attack * (1 + (0.18 * v_level_gains) + (0.25 * v_milestones)))::integer + case when v_level = 50 then 5 else 0 end, 1) + coalesce(p_attack_iv, 0)) * case when v_is_shiny then 1.15 else 1 end)::integer + case when v_is_prime then 10 else 0 end, 1),
    greatest(round((greatest(round(v_magic * (1 + (0.19 * v_level_gains) + (0.26 * v_milestones)))::integer + case when v_level = 50 then 6 else 0 end, 1) + coalesce(p_magic_iv, 0)) * case when v_is_shiny then 1.15 else 1 end)::integer + case when v_is_prime then 10 else 0 end, 1),
    greatest(round((greatest(round(v_defense * (1 + (0.18 * v_level_gains) + (0.25 * v_milestones)))::integer + case when v_level = 50 then 5 else 0 end, 1) + coalesce(p_defense_iv, 0)) * case when v_is_shiny then 1.15 else 1 end)::integer + case when v_is_prime then 10 else 0 end, 1),
    greatest(round((greatest(round(v_hp * (1 + (0.24 * v_level_gains) + (0.35 * v_milestones)))::integer + case when v_level = 50 then 15 else 0 end, 1) + coalesce(p_hp_iv, 0)) * case when v_is_shiny then 1.15 else 1 end)::integer + case when v_is_prime then 10 else 0 end, 1),
    greatest(round((greatest(round(v_speed * (1 + (0.10 * v_level_gains) + (0.15 * v_milestones)))::integer + case when v_level = 50 then 5 else 0 end, 1) + coalesce(p_speed_iv, 0)) * case when v_is_shiny then 1.15 else 1 end)::integer + case when v_is_prime then 10 else 0 end, 1),
    v_milestones;
end;
$$;

drop function if exists public.sell_user_pokemon(text, bigint);

create or replace function public.sell_user_pokemon(
  p_slack_user_id text,
  p_pokemon_id bigint
)
returns table (
  ok boolean,
  reason text,
  sale_price bigint,
  essence_gained integer,
  remaining_gold bigint,
  remaining_essence integer,
  deleted_trade_items integer,
  deleted_market_purchases integer
)
language plpgsql
as $$
declare
  v_base_value bigint;
  v_upgrade_spent_gold bigint;
  v_sale_price bigint;
  v_rarity text;
  v_essence integer := 0;
  v_trade_items integer := 0;
  v_market_purchases integer := 0;
begin
  select ps.base_value, coalesce(up.upgrade_spent_gold, 0), ps.rarity
    into v_base_value, v_upgrade_spent_gold, v_rarity
  from public.user_pokemons up
  join public.pokemon_species ps on ps.id = up.species_id
  where up.id = p_pokemon_id
    and up.slack_user_id = p_slack_user_id
  for update of up, ps;

  if not found then
    return query select false, 'pokemon_not_owned', null::bigint, null::integer, null::bigint, null::integer, 0, 0;
    return;
  end if;

  if exists (
    select 1 from public.trade_items ti join public.trades t on t.id = ti.trade_id
    where ti.user_pokemon_id = p_pokemon_id and t.status = 'pending'
  ) then
    return query select false, 'pokemon_locked_in_trade', null::bigint, null::integer, null::bigint, null::integer, 0, 0;
    return;
  end if;

  v_sale_price := public.calculate_pokemon_sell_price(v_base_value, v_upgrade_spent_gold);
  v_essence := case v_rarity
    when 'common' then 100
    when 'uncommon' then 300
    when 'rare' then 700
    when 'epic' then 4000
    when 'legendary' then 50000
    when 'mythical' then 100000
    else 0
  end;

  delete from public.trade_items where user_pokemon_id = p_pokemon_id;
  get diagnostics v_trade_items = row_count;

  delete from public.market_purchases where user_pokemon_id = p_pokemon_id;
  get diagnostics v_market_purchases = row_count;

  delete from public.user_pokemons where id = p_pokemon_id and slack_user_id = p_slack_user_id;

  update public.users
  set gold = gold + v_sale_price,
      pokemon_essence = greatest(coalesce(pokemon_essence, 0), 0) + v_essence
  where slack_user_id = p_slack_user_id
  returning gold, pokemon_essence into remaining_gold, remaining_essence;

  insert into public.transactions (slack_user_id, type, amount)
  values (p_slack_user_id, 'pokemon_sell', v_sale_price);

  return query select true, null::text, v_sale_price, v_essence, remaining_gold, remaining_essence, v_trade_items, v_market_purchases;
end;
$$;

drop function if exists public.sell_user_pokemons_batch(text, bigint[], bigint);

create or replace function public.sell_user_pokemons_batch(
  p_slack_user_id text,
  p_pokemon_ids bigint[],
  p_expected_sale_price bigint default null
)
returns table (
  ok boolean,
  reason text,
  sale_price bigint,
  essence_gained integer,
  remaining_gold bigint,
  remaining_essence integer,
  deleted_trade_items integer,
  deleted_market_purchases integer
)
language plpgsql
as $$
declare
  v_pokemon record;
  v_requested_ids bigint[];
  v_locked_ids bigint[] := '{}'::bigint[];
  v_found_count integer;
  v_locked_count integer;
  v_sale_price bigint := 0;
  v_essence integer := 0;
  v_trade_items integer := 0;
  v_market_purchases integer := 0;
begin
  select coalesce(array_agg(distinct id), '{}'::bigint[])
    into v_requested_ids
  from unnest(coalesce(p_pokemon_ids, '{}'::bigint[])) id
  where id is not null and id > 0;

  if coalesce(array_length(v_requested_ids, 1), 0) = 0 then
    return query select false, 'invalid_pokemon_ids', null::bigint, null::integer, null::bigint, null::integer, 0, 0;
    return;
  end if;

  for v_pokemon in
    select up.id, ps.base_value, coalesce(up.upgrade_spent_gold, 0) as upgrade_spent_gold, ps.rarity
    from public.user_pokemons up
    join public.pokemon_species ps on ps.id = up.species_id
    where up.slack_user_id = p_slack_user_id and up.id = any(v_requested_ids)
    for update of up
  loop
    v_locked_ids := array_append(v_locked_ids, v_pokemon.id);
    v_sale_price := v_sale_price + public.calculate_pokemon_sell_price(v_pokemon.base_value, v_pokemon.upgrade_spent_gold);
    v_essence := v_essence + case v_pokemon.rarity
      when 'common' then 100 when 'uncommon' then 300 when 'rare' then 700 when 'epic' then 4000 when 'legendary' then 50000 when 'mythical' then 100000 else 0 end;
  end loop;

  v_found_count := coalesce(array_length(v_locked_ids, 1), 0);
  if v_found_count <> array_length(v_requested_ids, 1) then
    return query select false, 'pokemon_not_owned', null::bigint, null::integer, null::bigint, null::integer, 0, 0;
    return;
  end if;

  select count(*) into v_locked_count
  from public.trade_items ti join public.trades t on t.id = ti.trade_id
  where ti.user_pokemon_id = any(v_locked_ids) and t.status = 'pending';

  if v_locked_count > 0 then
    return query select false, 'pokemon_locked_in_trade', null::bigint, null::integer, null::bigint, null::integer, 0, 0;
    return;
  end if;

  if p_expected_sale_price is not null and v_sale_price <> p_expected_sale_price then
    return query select false, 'sale_price_changed', v_sale_price, null::integer, null::bigint, null::integer, 0, 0;
    return;
  end if;

  delete from public.trade_items where user_pokemon_id = any(v_locked_ids);
  get diagnostics v_trade_items = row_count;

  delete from public.market_purchases where user_pokemon_id = any(v_locked_ids);
  get diagnostics v_market_purchases = row_count;

  delete from public.user_pokemons where slack_user_id = p_slack_user_id and id = any(v_locked_ids);

  update public.users
  set gold = gold + v_sale_price,
      pokemon_essence = greatest(coalesce(pokemon_essence, 0), 0) + v_essence
  where slack_user_id = p_slack_user_id
  returning gold, pokemon_essence into remaining_gold, remaining_essence;

  insert into public.transactions (slack_user_id, type, amount)
  values (p_slack_user_id, 'pokemon_sell', v_sale_price);

  return query select true, null::text, v_sale_price, v_essence, remaining_gold, remaining_essence, v_trade_items, v_market_purchases;
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
  v_next_base_magic integer;
  v_next_base_defense integer;
  v_next_base_hp integer;
  v_next_base_speed integer;
  v_attack integer;
  v_magic integer;
  v_defense integer;
  v_hp integer;
  v_speed integer;
  v_shiny boolean;
  v_shiny_type text;
  v_attack_iv integer;
  v_magic_iv integer;
  v_defense_iv integer;
  v_hp_iv integer;
  v_speed_iv integer;
begin
  select up.species_id, up.level, ps.rarity, ps.evolution_stage, ps.evolves_to, ps.name,
         up.shiny, up.shiny_type, coalesce(up.attack_iv,0), coalesce(up.magic_iv,0), coalesce(up.defense_iv,0), coalesce(up.hp_iv,0), coalesce(up.speed_iv,0)
    into v_species_id, v_level, v_rarity, v_evolution_stage, v_next_species_id, v_current_species_name,
         v_shiny, v_shiny_type, v_attack_iv, v_magic_iv, v_defense_iv, v_hp_iv, v_speed_iv
  from public.user_pokemons up
  join public.pokemon_species ps on ps.id = up.species_id
  where up.id = p_pokemon_id and up.slack_user_id = p_slack_user_id
  for update of up, ps;

  if not found then return query select false, 'pokemon_not_owned', null::integer, null::integer, null::text, null::text, null::bigint, null::bigint; return; end if;
  if v_next_species_id is null then return query select false, 'no_evolution_available', v_species_id, v_species_id, v_current_species_name, v_current_species_name, 0::bigint, null::bigint; return; end if;

  select ps.name, ps.base_attack, ps.base_magic, ps.base_defense, ps.base_hp, ps.base_speed
    into v_next_species_name, v_next_base_attack, v_next_base_magic, v_next_base_defense, v_next_base_hp, v_next_base_speed
  from public.pokemon_species ps where ps.id = v_next_species_id for update;

  if not found then return query select false, 'next_species_not_found', v_species_id, v_next_species_id, v_current_species_name, null::text, 0::bigint, null::bigint; return; end if;
  if v_next_base_attack is null or v_next_base_magic is null or v_next_base_defense is null or v_next_base_hp is null or v_next_base_speed is null then
    return query select false, 'species_stats_missing', v_species_id, v_species_id, v_current_species_name, v_next_species_name, 0::bigint, null::bigint; return;
  end if;

  select u.gold into v_user_gold from public.users u where u.slack_user_id = p_slack_user_id for update;
  if not found then return query select false, 'user_not_started', null::integer, null::integer, null::text, null::text, null::bigint, null::bigint; return; end if;

  v_cost := (4000 + (case coalesce(v_rarity, 'common') when 'uncommon' then 1000 when 'rare' then 2000 when 'epic' then 3000 when 'legendary' then 4000 when 'mythical' then 5000 else 0 end)) * (2 ^ greatest(coalesce(v_evolution_stage, 1) - 1, 0));
  if v_user_gold < v_cost then return query select false, 'insufficient_gold', v_species_id, v_next_species_id, v_current_species_name, v_next_species_name, v_cost, v_user_gold; return; end if;

  select s.attack, s.magic, s.defense, s.hp, s.speed into v_attack, v_magic, v_defense, v_hp, v_speed
  from public.calculate_pokemon_level_stats(v_next_base_attack, v_next_base_magic, v_next_base_defense, v_next_base_hp, v_next_base_speed, v_level, v_attack_iv, v_magic_iv, v_defense_iv, v_hp_iv, v_speed_iv, v_rarity, v_shiny, v_shiny_type) s;

  update public.user_pokemons
  set species_id = v_next_species_id,
      attack = v_attack,
      magic = v_magic,
      defense = v_defense,
      current_hp = public.preserve_hp_ratio(coalesce(current_hp, hp), hp, v_hp),
      hp = v_hp,
      speed = v_speed
  where id = p_pokemon_id and slack_user_id = p_slack_user_id;

  update public.users set gold = gold - v_cost where slack_user_id = p_slack_user_id and gold >= v_cost returning gold into remaining_gold;
  if remaining_gold is null then raise exception 'Gold insuficiente no momento do débito da evolução'; end if;

  insert into public.transactions (slack_user_id, type, amount) values (p_slack_user_id, 'pokemon_evolution', -v_cost);

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
  v_base_magic integer;
  v_base_defense integer;
  v_base_hp integer;
  v_base_speed integer;
  v_rarity text;
  v_cost bigint;
  v_new_level integer;
  v_attack integer;
  v_magic integer;
  v_defense integer;
  v_hp integer;
  v_speed integer;
  v_shiny boolean;
  v_shiny_type text;
  v_attack_iv integer;
  v_magic_iv integer;
  v_defense_iv integer;
  v_hp_iv integer;
  v_speed_iv integer;
begin
  select up.level, ps.base_attack, ps.base_magic, ps.base_defense, ps.base_hp, ps.base_speed, ps.rarity,
         up.shiny, up.shiny_type, coalesce(up.attack_iv,0), coalesce(up.magic_iv,0), coalesce(up.defense_iv,0), coalesce(up.hp_iv,0), coalesce(up.speed_iv,0)
    into v_level, v_base_attack, v_base_magic, v_base_defense, v_base_hp, v_base_speed, v_rarity,
         v_shiny, v_shiny_type, v_attack_iv, v_magic_iv, v_defense_iv, v_hp_iv, v_speed_iv
  from public.user_pokemons up
  join public.pokemon_species ps on ps.id = up.species_id
  where up.id = p_pokemon_id and up.slack_user_id = p_slack_user_id
  for update of up, ps;

  if not found then return query select false, 'pokemon_not_owned', null::integer, null::integer, null::bigint, null::bigint; return; end if;
  if v_base_attack is null or v_base_magic is null or v_base_defense is null or v_base_hp is null or v_base_speed is null then return query select false, 'species_stats_missing', v_level, v_level, 0::bigint, null::bigint; return; end if;
  if v_level >= 50 then return query select false, 'max_level', v_level, v_level, 0::bigint, null::bigint; return; end if;

  select u.gold into v_user_gold from public.users u where u.slack_user_id = p_slack_user_id for update;
  if not found then return query select false, 'user_not_started', null::integer, null::integer, null::bigint, null::bigint; return; end if;

  v_cost := public.calculate_upgrade_cost(v_level);
  if v_user_gold < v_cost then return query select false, 'insufficient_gold', v_level, v_level, v_cost, v_user_gold; return; end if;

  v_new_level := v_level + 1;
  select s.attack, s.magic, s.defense, s.hp, s.speed into v_attack, v_magic, v_defense, v_hp, v_speed
  from public.calculate_pokemon_level_stats(v_base_attack, v_base_magic, v_base_defense, v_base_hp, v_base_speed, v_new_level, v_attack_iv, v_magic_iv, v_defense_iv, v_hp_iv, v_speed_iv, v_rarity, v_shiny, v_shiny_type) s;

  update public.user_pokemons
  set level = v_new_level,
      upgrade_spent_gold = coalesce(upgrade_spent_gold, 0) + v_cost,
      attack = v_attack,
      magic = v_magic,
      defense = v_defense,
      current_hp = public.preserve_hp_ratio(coalesce(current_hp, hp), hp, v_hp),
      hp = v_hp,
      speed = v_speed
  where id = p_pokemon_id and slack_user_id = p_slack_user_id;

  update public.users set gold = gold - v_cost where slack_user_id = p_slack_user_id and gold >= v_cost returning gold into remaining_gold;
  if remaining_gold is null then raise exception 'Gold insuficiente no momento do débito'; end if;

  insert into public.transactions (slack_user_id, type, amount) values (p_slack_user_id, 'pokemon_upgrade', -v_cost);
  return query select true, null::text, v_level, v_new_level, v_cost, remaining_gold;
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
  v_base_magic integer;
  v_base_defense integer;
  v_base_hp integer;
  v_base_speed integer;
  v_rarity text;
  v_total_cost bigint := 0;
  v_attack integer;
  v_magic integer;
  v_defense integer;
  v_hp integer;
  v_speed integer;
  v_shiny boolean;
  v_shiny_type text;
  v_attack_iv integer;
  v_magic_iv integer;
  v_defense_iv integer;
  v_hp_iv integer;
  v_speed_iv integer;
  i integer;
begin
  select up.level, up.species_id, up.shiny, up.shiny_type, coalesce(up.attack_iv,0), coalesce(up.magic_iv,0), coalesce(up.defense_iv,0), coalesce(up.hp_iv,0), coalesce(up.speed_iv,0)
    into v_level, v_species_id, v_shiny, v_shiny_type, v_attack_iv, v_magic_iv, v_defense_iv, v_hp_iv, v_speed_iv
  from public.user_pokemons up where up.id = p_pokemon_id and up.slack_user_id = p_slack_user_id for update;

  if not found then return query select false, 'pokemon_not_owned', null::integer, null::integer, null::bigint, null::bigint; return; end if;

  select ps.base_attack, ps.base_magic, ps.base_defense, ps.base_hp, ps.base_speed, ps.rarity
    into v_base_attack, v_base_magic, v_base_defense, v_base_hp, v_base_speed, v_rarity
  from public.pokemon_species ps where ps.id = v_species_id;

  if not found or v_base_attack is null or v_base_magic is null or v_base_defense is null or v_base_hp is null or v_base_speed is null then
    return query select false, 'species_stats_missing', v_level, v_level, 0::bigint, null::bigint; return;
  end if;
  if v_target_level <= 0 then return query select false, 'invalid_target_level', v_level, v_target_level, 0::bigint, null::bigint; return; end if;
  if v_level >= 50 then return query select false, 'max_level_reached', v_level, v_level, 0::bigint, null::bigint; return; end if;
  if v_target_level > 50 then return query select false, 'target_above_max_level', v_level, v_target_level, 0::bigint, null::bigint; return; end if;
  if v_target_level <= v_level then return query select false, 'target_must_be_higher', v_level, v_target_level, 0::bigint, null::bigint; return; end if;

  select u.gold into v_user_gold from public.users u where u.slack_user_id = p_slack_user_id for update;
  if not found then return query select false, 'user_not_started', null::integer, null::integer, null::bigint, null::bigint; return; end if;

  for i in v_level..(v_target_level - 1) loop
    v_total_cost := v_total_cost + public.calculate_upgrade_cost(i);
  end loop;

  if v_user_gold < v_total_cost then return query select false, 'insufficient_gold', v_level, v_target_level, v_total_cost, v_user_gold; return; end if;

  select s.attack, s.magic, s.defense, s.hp, s.speed into v_attack, v_magic, v_defense, v_hp, v_speed
  from public.calculate_pokemon_level_stats(v_base_attack, v_base_magic, v_base_defense, v_base_hp, v_base_speed, v_target_level, v_attack_iv, v_magic_iv, v_defense_iv, v_hp_iv, v_speed_iv, v_rarity, v_shiny, v_shiny_type) s;

  update public.user_pokemons
  set level = v_target_level,
      upgrade_spent_gold = coalesce(upgrade_spent_gold, 0) + v_total_cost,
      attack = v_attack,
      magic = v_magic,
      defense = v_defense,
      current_hp = public.preserve_hp_ratio(coalesce(current_hp, hp), hp, v_hp),
      hp = v_hp,
      speed = v_speed
  where id = p_pokemon_id and slack_user_id = p_slack_user_id;

  update public.users set gold = gold - v_total_cost where slack_user_id = p_slack_user_id and gold >= v_total_cost returning gold into remaining_gold;
  if remaining_gold is null then raise exception 'Gold insuficiente no momento do débito do upgrade em lote'; end if;

  insert into public.transactions (slack_user_id, type, amount) values (p_slack_user_id, 'pokemon_upgrade_batch', -v_total_cost);
  return query select true, null::text, v_level, v_target_level, v_total_cost, remaining_gold;
end;
$$;

create or replace function public.transfer_pokemon_shiny(
  p_slack_user_id text,
  p_source_pokemon_id bigint,
  p_target_pokemon_id bigint
)
returns table (
  ok boolean,
  reason text
)
language plpgsql
as $$
declare
  v_source record;
  v_target record;
  v_source_species record;
  v_target_species record;
  v_attack integer;
  v_magic integer;
  v_defense integer;
  v_hp integer;
  v_speed integer;
begin
  if p_source_pokemon_id = p_target_pokemon_id then
    return query select false, 'same_pokemon';
    return;
  end if;

  select * into v_source from public.user_pokemons where id = p_source_pokemon_id and slack_user_id = p_slack_user_id for update;
  select * into v_target from public.user_pokemons where id = p_target_pokemon_id and slack_user_id = p_slack_user_id for update;

  if v_source.id is null or v_target.id is null then return query select false, 'pokemon_not_owned'; return; end if;
  if coalesce(v_source.shiny, false) = false then return query select false, 'source_not_shiny'; return; end if;
  if coalesce(v_target.shiny, false) = true then return query select false, 'target_already_shiny'; return; end if;

  select * into v_source_species from public.pokemon_species where id = v_source.species_id;
  select * into v_target_species from public.pokemon_species where id = v_target.species_id;

  update public.user_pokemons set shiny = false, shiny_type = null where id = v_source.id;
  update public.user_pokemons set shiny = true, shiny_type = 'normal' where id = v_target.id;

  select s.attack, s.magic, s.defense, s.hp, s.speed into v_attack, v_magic, v_defense, v_hp, v_speed
  from public.calculate_pokemon_level_stats(v_source_species.base_attack, v_source_species.base_magic, v_source_species.base_defense, v_source_species.base_hp, v_source_species.base_speed, v_source.level, coalesce(v_source.attack_iv,0), coalesce(v_source.magic_iv,0), coalesce(v_source.defense_iv,0), coalesce(v_source.hp_iv,0), coalesce(v_source.speed_iv,0), v_source_species.rarity, false, null) s;
  update public.user_pokemons set attack = v_attack, magic = v_magic, defense = v_defense, hp = v_hp, speed = v_speed where id = v_source.id;

  select s.attack, s.magic, s.defense, s.hp, s.speed into v_attack, v_magic, v_defense, v_hp, v_speed
  from public.calculate_pokemon_level_stats(v_target_species.base_attack, v_target_species.base_magic, v_target_species.base_defense, v_target_species.base_hp, v_target_species.base_speed, v_target.level, coalesce(v_target.attack_iv,0), coalesce(v_target.magic_iv,0), coalesce(v_target.defense_iv,0), coalesce(v_target.hp_iv,0), coalesce(v_target.speed_iv,0), v_target_species.rarity, true, 'normal') s;
  update public.user_pokemons set attack = v_attack, magic = v_magic, defense = v_defense, hp = v_hp, speed = v_speed where id = v_target.id;

  return query select true, null::text;
end;
$$;

create or replace function public.upgrade_pokemon_extra_stat(
  p_slack_user_id text,
  p_pokemon_id bigint,
  p_stat_key text
)
returns table (
  ok boolean,
  reason text,
  new_level integer,
  remaining_gold bigint,
  remaining_essence integer
)
language plpgsql
as $$
declare
  v_gold bigint;
  v_essence integer;
  v_crit integer;
  v_dodge integer;
  v_elemental integer;
  v_new_level integer;
  v_cost_gold bigint := 10000;
  v_cost_essence integer := 500;
begin
  select gold, coalesce(pokemon_essence, 0) into v_gold, v_essence
  from public.users
  where slack_user_id = p_slack_user_id
  for update;

  if not found then return query select false, 'user_not_started', null::integer, null::bigint, null::integer; return; end if;

  select crit_level, dodge_level, elemental_level
    into v_crit, v_dodge, v_elemental
  from public.user_pokemons
  where id = p_pokemon_id and slack_user_id = p_slack_user_id
  for update;

  if not found then return query select false, 'pokemon_not_owned', null::integer, null::bigint, null::integer; return; end if;

  if v_gold < v_cost_gold then return query select false, 'insufficient_gold', null::integer, v_gold, v_essence; return; end if;
  if v_essence < v_cost_essence then return query select false, 'insufficient_essence', null::integer, v_gold, v_essence; return; end if;

  if p_stat_key = 'crit' then
    if v_crit >= 10 then return query select false, 'stat_maxed', v_crit, v_gold, v_essence; return; end if;
    v_new_level := v_crit + 1;
    update public.user_pokemons set crit_level = v_new_level where id = p_pokemon_id;
  elsif p_stat_key = 'dodge' then
    if v_dodge >= 10 then return query select false, 'stat_maxed', v_dodge, v_gold, v_essence; return; end if;
    v_new_level := v_dodge + 1;
    update public.user_pokemons set dodge_level = v_new_level where id = p_pokemon_id;
  elsif p_stat_key = 'elemental' then
    if v_elemental >= 10 then return query select false, 'stat_maxed', v_elemental, v_gold, v_essence; return; end if;
    v_new_level := v_elemental + 1;
    update public.user_pokemons set elemental_level = v_new_level where id = p_pokemon_id;
  else
    return query select false, 'invalid_stat', null::integer, v_gold, v_essence;
    return;
  end if;

  update public.users
  set gold = gold - v_cost_gold,
      pokemon_essence = pokemon_essence - v_cost_essence
  where slack_user_id = p_slack_user_id
  returning gold, pokemon_essence into remaining_gold, remaining_essence;

  insert into public.transactions (slack_user_id, type, amount)
  values (p_slack_user_id, 'pokemon_extra_stat_upgrade', -v_cost_gold);

  return query select true, null::text, v_new_level, remaining_gold, remaining_essence;
end;
$$;
