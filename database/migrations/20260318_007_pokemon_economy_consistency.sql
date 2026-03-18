alter table public.user_pokemons
  add column if not exists upgrade_spent_gold bigint not null default 0;

create or replace function public.calculate_legacy_upgrade_cost(p_current_level integer)
returns bigint
language plpgsql
immutable
as $$
declare
  v_level integer := greatest(coalesce(p_current_level, 1), 1);
  v_cost bigint := 100;
  v_previous_cost bigint;
  i integer;
begin
  if v_level = 1 then
    return v_cost;
  end if;

  for i in 1..(v_level - 1) loop
    v_previous_cost := v_cost;
    v_cost := v_previous_cost + greatest((v_previous_cost * 15) / 100, 1);

    if i >= 20 then
      v_cost := v_cost + 300;
    elsif i >= 10 then
      v_cost := v_cost + 200;
    end if;
  end loop;

  return v_cost;
end;
$$;

create or replace function public.calculate_upgrade_cost(p_current_level integer)
returns bigint
language plpgsql
immutable
as $$
declare
  v_level integer := greatest(coalesce(p_current_level, 1), 1);
begin
  if v_level >= 35 then
    return 5000;
  elsif v_level >= 25 then
    return 4800 + ((v_level - 25) * 20);
  elsif v_level >= 20 then
    return 4300 + ((v_level - 20) * 100);
  elsif v_level >= 15 then
    return 3100 + ((v_level - 15) * 250);
  elsif v_level >= 10 then
    return 1850 + ((v_level - 10) * 250);
  elsif v_level >= 5 then
    return 800 + ((v_level - 5) * 200);
  end if;

  return 200 + ((v_level - 1) * 150);
end;
$$;

create or replace function public.calculate_upgrade_total_cost(p_current_level integer, p_target_level integer)
returns bigint
language plpgsql
immutable
as $$
declare
  v_current integer := greatest(coalesce(p_current_level, 1), 1);
  v_target integer := greatest(coalesce(p_target_level, v_current), v_current);
  v_total bigint := 0;
  i integer;
begin
  for i in v_current..(v_target - 1) loop
    v_total := v_total + public.calculate_upgrade_cost(i);
  end loop;

  return v_total;
end;
$$;

create or replace function public.calculate_legacy_upgrade_total_cost(p_current_level integer, p_target_level integer)
returns bigint
language plpgsql
immutable
as $$
declare
  v_current integer := greatest(coalesce(p_current_level, 1), 1);
  v_target integer := greatest(coalesce(p_target_level, v_current), v_current);
  v_total bigint := 0;
  i integer;
begin
  for i in v_current..(v_target - 1) loop
    v_total := v_total + public.calculate_legacy_upgrade_cost(i);
  end loop;

  return v_total;
end;
$$;

update public.user_pokemons
set upgrade_spent_gold = public.calculate_legacy_upgrade_total_cost(1, level)
where coalesce(upgrade_spent_gold, 0) = 0
  and level > 1;

create or replace function public.calculate_pokemon_sell_price(
  p_rarity text,
  p_level integer,
  p_upgrade_spent_gold bigint default 0
)
returns bigint
language plpgsql
immutable
as $$
declare
  v_level integer := greatest(coalesce(p_level, 1), 1);
  v_base bigint;
  v_level_bonus bigint;
  v_upgrade_return bigint := greatest(coalesce(p_upgrade_spent_gold, 0), 0) / 5;
begin
  v_base := case coalesce(p_rarity, 'common')
    when 'mythical' then 50000
    when 'legendary' then 35000
    when 'epic' then 10000
    when 'rare' then 2500
    when 'uncommon' then 800
    else 300
  end;

  v_level_bonus := (v_level - 1) * 10;
  return greatest(v_base + v_level_bonus + v_upgrade_return, 0);
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

  update public.user_pokemons
  set level = v_new_level,
      upgrade_spent_gold = coalesce(upgrade_spent_gold, 0) + v_cost,
      attack = greatest(1, ceil(v_base_attack * power(1.02, greatest(v_new_level - 1, 0)))::integer),
      defense = greatest(1, ceil(v_base_defense * power(1.02, greatest(v_new_level - 1, 0)))::integer),
      hp = greatest(1, ceil(v_base_hp * power(1.02, greatest(v_new_level - 1, 0)))::integer),
      speed = greatest(1, ceil(v_base_speed * power(1.02, greatest(v_new_level - 1, 0)))::integer)
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

  update public.user_pokemons
  set level = 1,
      upgrade_spent_gold = 0,
      attack = greatest(1, v_base_attack),
      defense = greatest(1, v_base_defense),
      hp = greatest(1, v_base_hp),
      speed = greatest(1, v_base_speed)
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
  v_level integer;
  v_rarity text;
  v_upgrade_spent_gold bigint;
  v_sale_price bigint;
  v_trade_items integer := 0;
  v_market_purchases integer := 0;
begin
  select up.level, ps.rarity, coalesce(up.upgrade_spent_gold, 0)
    into v_level, v_rarity, v_upgrade_spent_gold
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

  v_sale_price := public.calculate_pokemon_sell_price(v_rarity, v_level, v_upgrade_spent_gold);

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
