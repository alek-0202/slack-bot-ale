-- Block selling favorites (single and batch) and rebalance shiny scaling by rarity.

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
  v_rarity text := lower(coalesce(p_rarity, 'common'));
  v_rarity_bonus integer := case v_rarity when 'legendary' then 15 when 'mythical' then 20 else 0 end;
  v_is_shiny boolean := coalesce(p_is_shiny, false);
  v_is_prime boolean := v_is_shiny and coalesce(p_shiny_type, '') = 'prime';
  v_prime_bonus integer := case when v_is_prime and v_rarity in ('rare', 'epic', 'legendary', 'mythical') then 10 else 0 end;
  v_shiny_multiplier numeric := case v_rarity
    when 'common' then 1.07
    when 'uncommon' then 1.07
    when 'rare' then 1.10
    when 'epic' then 1.15
    when 'legendary' then 1.18
    when 'mythical' then 1.20
    else 1.15
  end;
  v_attack integer := greatest(coalesce(p_base_attack, 10) + v_rarity_bonus + coalesce(p_attack_iv, 0) + v_prime_bonus, 1);
  v_magic integer := greatest(coalesce(p_base_magic, p_base_attack, 10) + v_rarity_bonus + coalesce(p_magic_iv, 0) + v_prime_bonus, 1);
  v_defense integer := greatest(coalesce(p_base_defense, 10) + v_rarity_bonus + coalesce(p_defense_iv, 0) + v_prime_bonus, 1);
  v_hp integer := greatest(coalesce(p_base_hp, 10) + v_rarity_bonus + coalesce(p_hp_iv, 0) + v_prime_bonus, 1);
  v_speed integer := greatest(coalesce(p_base_speed, 10) + v_rarity_bonus + coalesce(p_speed_iv, 0) + v_prime_bonus, 1);
  v_milestones integer := greatest(least(floor(v_level / 10.0)::integer, 5), 0);
  v_level_gains integer := greatest(v_level - 1, 0);
begin
  return query
  select
    greatest(round((greatest(round(v_attack * (1 + (0.18 * v_level_gains) + (0.25 * v_milestones)))::integer + case when v_level = 50 then 5 else 0 end, 1)) * case when v_is_shiny then v_shiny_multiplier else 1 end)::integer, 1),
    greatest(round((greatest(round(v_magic * (1 + (0.19 * v_level_gains) + (0.26 * v_milestones)))::integer + case when v_level = 50 then 6 else 0 end, 1)) * case when v_is_shiny then v_shiny_multiplier else 1 end)::integer, 1),
    greatest(round((greatest(round(v_defense * (1 + (0.18 * v_level_gains) + (0.25 * v_milestones)))::integer + case when v_level = 50 then 5 else 0 end, 1)) * case when v_is_shiny then v_shiny_multiplier else 1 end)::integer, 1),
    greatest(round((greatest(round(v_hp * (1 + (0.24 * v_level_gains) + (0.35 * v_milestones)))::integer + case when v_level = 50 then 15 else 0 end, 1)) * case when v_is_shiny then v_shiny_multiplier else 1 end)::integer, 1),
    greatest(round((greatest(round(v_speed * (1 + (0.10 * v_level_gains) + (0.15 * v_milestones)))::integer + case when v_level = 50 then 5 else 0 end, 1)) * case when v_is_shiny then v_shiny_multiplier else 1 end)::integer, 1),
    v_milestones;
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
  v_is_favorite boolean := false;
  v_essence integer := 0;
  v_trade_items integer := 0;
  v_market_purchases integer := 0;
begin
  select ps.base_value, coalesce(up.upgrade_spent_gold, 0), ps.rarity, coalesce(up.is_favorite, false)
    into v_base_value, v_upgrade_spent_gold, v_rarity, v_is_favorite
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

  if v_is_favorite then
    return query select false, 'favorite_pokemon_blocked', null::bigint, null::integer, null::bigint, null::integer, 0, 0;
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
  v_favorite_count integer := 0;
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
    select up.id, ps.base_value, coalesce(up.upgrade_spent_gold, 0) as upgrade_spent_gold, ps.rarity, coalesce(up.is_favorite, false) as is_favorite
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

  select count(*) into v_favorite_count
  from public.user_pokemons up
  where up.slack_user_id = p_slack_user_id
    and up.id = any(v_locked_ids)
    and coalesce(up.is_favorite, false) = true;

  if v_favorite_count > 0 then
    return query select false, 'favorite_pokemon_blocked', null::bigint, null::integer, null::bigint, null::integer, 0, 0;
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
