create or replace function public.calculate_pokemon_sell_price(
  p_base_value bigint,
  p_upgrade_spent_gold bigint default 0
)
returns bigint
language plpgsql
immutable
as $$
declare
  v_base bigint := greatest(coalesce(p_base_value, 0), 0);
  v_upgrade_investment bigint := greatest(coalesce(p_upgrade_spent_gold, 0), 0);
begin
  return greatest(v_base + v_upgrade_investment, 0);
end;
$$;

create or replace function public.sell_user_pokemon(
  p_slack_user_id text,
  p_pokemon_id bigint
)
returns table (
  ok boolean,
  reason text,
  sale_price bigint,
  remaining_gold bigint,
  deleted_trade_items integer,
  deleted_market_purchases integer
)
language plpgsql
as $$
declare
  v_base_value bigint;
  v_upgrade_spent_gold bigint;
  v_sale_price bigint;
  v_trade_items integer := 0;
  v_market_purchases integer := 0;
begin
  select ps.base_value, coalesce(up.upgrade_spent_gold, 0)
    into v_base_value, v_upgrade_spent_gold
  from public.user_pokemons up
  join public.pokemon_species ps on ps.id = up.species_id
  where up.id = p_pokemon_id
    and up.slack_user_id = p_slack_user_id
  for update of up, ps;

  if not found then
    return query select false, 'pokemon_not_owned', null::bigint, null::bigint, 0, 0;
    return;
  end if;

  if exists (
    select 1
    from public.trade_items ti
    join public.trades t on t.id = ti.trade_id
    where ti.user_pokemon_id = p_pokemon_id
      and t.status = 'pending'
  ) then
    return query select false, 'pokemon_locked_in_trade', null::bigint, null::bigint, 0, 0;
    return;
  end if;

  v_sale_price := public.calculate_pokemon_sell_price(v_base_value, v_upgrade_spent_gold);

  delete from public.trade_items where user_pokemon_id = p_pokemon_id;
  get diagnostics v_trade_items = row_count;

  delete from public.market_purchases where user_pokemon_id = p_pokemon_id;
  get diagnostics v_market_purchases = row_count;

  delete from public.user_pokemons
  where id = p_pokemon_id
    and slack_user_id = p_slack_user_id;

  update public.users
  set gold = gold + v_sale_price
  where slack_user_id = p_slack_user_id
  returning gold into remaining_gold;

  insert into public.transactions (slack_user_id, type, amount)
  values (p_slack_user_id, 'pokemon_sell', v_sale_price);

  return query select true, null::text, v_sale_price, remaining_gold, v_trade_items, v_market_purchases;
end;
$$;

create or replace function public.sell_user_pokemons_batch(
  p_slack_user_id text,
  p_pokemon_ids bigint[],
  p_expected_sale_price bigint default null
)
returns table (
  ok boolean,
  reason text,
  sale_price bigint,
  remaining_gold bigint,
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
  v_trade_items integer := 0;
  v_market_purchases integer := 0;
begin
  select coalesce(array_agg(distinct id), '{}'::bigint[])
    into v_requested_ids
  from unnest(coalesce(p_pokemon_ids, '{}'::bigint[])) id
  where id is not null and id > 0;

  if coalesce(array_length(v_requested_ids, 1), 0) = 0 then
    return query select false, 'invalid_pokemon_ids', null::bigint, null::bigint, 0, 0;
    return;
  end if;

  for v_pokemon in
    select up.id, ps.base_value, coalesce(up.upgrade_spent_gold, 0) as upgrade_spent_gold
    from public.user_pokemons up
    join public.pokemon_species ps on ps.id = up.species_id
    where up.slack_user_id = p_slack_user_id
      and up.id = any(v_requested_ids)
    for update of up
  loop
    v_locked_ids := array_append(v_locked_ids, v_pokemon.id);
    v_sale_price := v_sale_price + public.calculate_pokemon_sell_price(
      v_pokemon.base_value,
      v_pokemon.upgrade_spent_gold
    );
  end loop;

  v_found_count := coalesce(array_length(v_locked_ids, 1), 0);

  if v_found_count <> array_length(v_requested_ids, 1) then
    return query select false, 'pokemon_not_owned', null::bigint, null::bigint, 0, 0;
    return;
  end if;

  select count(*)
    into v_locked_count
  from public.trade_items ti
  join public.trades t on t.id = ti.trade_id
  where ti.user_pokemon_id = any(v_locked_ids)
    and t.status = 'pending';

  if v_locked_count > 0 then
    return query select false, 'pokemon_locked_in_trade', null::bigint, null::bigint, 0, 0;
    return;
  end if;

  if p_expected_sale_price is not null and v_sale_price <> p_expected_sale_price then
    return query select false, 'sale_price_changed', v_sale_price, null::bigint, 0, 0;
    return;
  end if;

  delete from public.trade_items where user_pokemon_id = any(v_locked_ids);
  get diagnostics v_trade_items = row_count;

  delete from public.market_purchases where user_pokemon_id = any(v_locked_ids);
  get diagnostics v_market_purchases = row_count;

  delete from public.user_pokemons
  where slack_user_id = p_slack_user_id
    and id = any(v_locked_ids);

  update public.users
  set gold = gold + v_sale_price
  where slack_user_id = p_slack_user_id
  returning gold into remaining_gold;

  insert into public.transactions (slack_user_id, type, amount)
  values (p_slack_user_id, 'pokemon_sell', v_sale_price);

  return query select true, null::text, v_sale_price, remaining_gold, v_trade_items, v_market_purchases;
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
  v_cost bigint;
  v_new_level integer;
  v_attack integer;
  v_magic integer;
  v_defense integer;
  v_hp integer;
  v_speed integer;
begin
  select up.level, ps.base_attack, ps.base_magic, ps.base_defense, ps.base_hp, ps.base_speed
    into v_level, v_base_attack, v_base_magic, v_base_defense, v_base_hp, v_base_speed
  from public.user_pokemons up
  join public.pokemon_species ps on ps.id = up.species_id
  where up.id = p_pokemon_id
    and up.slack_user_id = p_slack_user_id
  for update of up, ps;

  if not found then
    return query select false, 'pokemon_not_owned', null::integer, null::integer, null::bigint, null::bigint;
    return;
  end if;

  if v_base_attack is null or v_base_magic is null or v_base_defense is null or v_base_hp is null or v_base_speed is null then
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

  select s.attack, s.magic, s.defense, s.hp, s.speed
    into v_attack, v_magic, v_defense, v_hp, v_speed
  from public.calculate_pokemon_level_stats(v_base_attack, v_base_magic, v_base_defense, v_base_hp, v_base_speed, v_new_level) s;

  update public.user_pokemons
  set level = v_new_level,
      upgrade_spent_gold = coalesce(upgrade_spent_gold, 0) + v_cost,
      attack = v_attack,
      magic = v_magic,
      defense = v_defense,
      current_hp = v_hp,
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
  v_total_cost bigint := 0;
  v_attack integer;
  v_magic integer;
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

  select ps.base_attack, ps.base_magic, ps.base_defense, ps.base_hp, ps.base_speed
    into v_base_attack, v_base_magic, v_base_defense, v_base_hp, v_base_speed
  from public.pokemon_species ps
  where ps.id = v_species_id;

  if not found then
    return query select false, 'species_stats_missing', v_level, v_level, 0::bigint, null::bigint;
    return;
  end if;

  if v_base_attack is null or v_base_magic is null or v_base_defense is null or v_base_hp is null or v_base_speed is null then
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

  select s.attack, s.magic, s.defense, s.hp, s.speed
    into v_attack, v_magic, v_defense, v_hp, v_speed
  from public.calculate_pokemon_level_stats(v_base_attack, v_base_magic, v_base_defense, v_base_hp, v_base_speed, v_target_level) s;

  update public.user_pokemons
  set level = v_target_level,
      upgrade_spent_gold = coalesce(upgrade_spent_gold, 0) + v_total_cost,
      attack = v_attack,
      magic = v_magic,
      defense = v_defense,
      current_hp = v_hp,
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
