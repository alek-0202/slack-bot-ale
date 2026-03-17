-- Hardening migration: atomic operations for upgrade and market buy.

create or replace function public.upgrade_user_pokemon(
  p_slack_user_id text,
  p_pokemon_id bigint
)
returns table (
  ok boolean,
  reason text,
  previous_level integer,
  new_level integer,
  cost integer,
  remaining_gold integer
)
language plpgsql
as $$
declare
  v_user_gold integer;
  v_level integer;
  v_attack integer;
  v_defense integer;
  v_hp integer;
  v_speed integer;
  v_multiplier numeric;
  v_cost integer;
  v_new_level integer;
begin
  select up.level, up.attack, up.defense, up.hp, up.speed
    into v_level, v_attack, v_defense, v_hp, v_speed
  from public.user_pokemons up
  where up.id = p_pokemon_id
    and up.slack_user_id = p_slack_user_id
  for update;

  if not found then
    return query select false, 'pokemon_not_owned', null::integer, null::integer, null::integer, null::integer;
    return;
  end if;

  if v_level >= 50 then
    return query select false, 'max_level', v_level, v_level, 0, null::integer;
    return;
  end if;

  select u.gold into v_user_gold
  from public.users u
  where u.slack_user_id = p_slack_user_id
  for update;

  if not found then
    return query select false, 'user_not_started', null::integer, null::integer, null::integer, null::integer;
    return;
  end if;

  if v_level >= 10 then
    v_multiplier := 1.5;
  else
    v_multiplier := 1 + least(v_level * 0.05, 0.5);
  end if;

  v_cost := ceil(100 * power(v_multiplier, greatest(v_level - 1, 0)));

  if v_user_gold < v_cost then
    return query select false, 'insufficient_gold', v_level, v_level, v_cost, v_user_gold;
    return;
  end if;

  v_new_level := v_level + 1;

  update public.user_pokemons
  set level = v_new_level,
      attack = ceil(v_attack * 1.02),
      defense = ceil(v_defense * 1.02),
      hp = ceil(v_hp * 1.02),
      speed = ceil(v_speed * 1.02)
  where id = p_pokemon_id
    and slack_user_id = p_slack_user_id;

  update public.users
  set gold = gold - v_cost
  where slack_user_id = p_slack_user_id
  returning gold into remaining_gold;

  insert into public.transactions (slack_user_id, type, amount)
  values (p_slack_user_id, 'pokemon_upgrade', -v_cost);

  return query select true, null::text, v_level, v_new_level, v_cost, remaining_gold;
end;
$$;

create or replace function public.market_buy_slot(
  p_slack_user_id text,
  p_market_date date,
  p_slot integer
)
returns table (
  ok boolean,
  reason text,
  species_id integer,
  price integer,
  remaining_gold integer,
  user_pokemon_id bigint
)
language plpgsql
as $$
declare
  v_user_gold integer;
  v_species_id integer;
  v_rarity text;
  v_price integer;
  v_rarity_bonus integer;
  v_stat_floor integer;
  v_stat_ceil integer;
begin
  select u.gold into v_user_gold
  from public.users u
  where u.slack_user_id = p_slack_user_id
  for update;

  if not found then
    return query select false, 'user_not_started', null::integer, null::integer, null::integer, null::bigint;
    return;
  end if;

  if exists (
    select 1
    from public.market_purchases mp
    where mp.market_date = p_market_date
      and mp.slot = p_slot
      and mp.slack_user_id = p_slack_user_id
  ) then
    return query select false, 'already_bought_slot', null::integer, null::integer, v_user_gold, null::bigint;
    return;
  end if;

  select dm.species_id, dm.price, ps.rarity
    into v_species_id, v_price, v_rarity
  from public.daily_market dm
  join public.pokemon_species ps on ps.id = dm.species_id
  where dm.market_date = p_market_date
    and dm.slot = p_slot;

  if not found then
    return query select false, 'invalid_slot', null::integer, null::integer, v_user_gold, null::bigint;
    return;
  end if;

  if v_user_gold < v_price then
    return query select false, 'insufficient_gold', v_species_id, v_price, v_user_gold, null::bigint;
    return;
  end if;

  v_rarity_bonus := case v_rarity
    when 'uncommon' then 1
    when 'rare' then 2
    when 'epic' then 3
    when 'legendary' then 4
    when 'mythical' then 5
    else 0
  end;

  v_stat_floor := 8 + v_rarity_bonus;
  v_stat_ceil := 15 + v_rarity_bonus;

  insert into public.user_pokemons (
    slack_user_id,
    species_id,
    level,
    shiny,
    attack,
    defense,
    hp,
    speed,
    source
  )
  values (
    p_slack_user_id,
    v_species_id,
    1,
    false,
    floor(random() * (v_stat_ceil - v_stat_floor + 1) + v_stat_floor)::integer,
    floor(random() * (v_stat_ceil - v_stat_floor + 1) + v_stat_floor)::integer,
    floor(random() * ((v_stat_ceil + 4) - (v_stat_floor + 2) + 1) + (v_stat_floor + 2))::integer,
    floor(random() * (v_stat_ceil - v_stat_floor + 1) + v_stat_floor)::integer,
    'market'
  )
  returning id into user_pokemon_id;

  update public.users
  set gold = gold - v_price
  where slack_user_id = p_slack_user_id
  returning gold into remaining_gold;

  insert into public.transactions (slack_user_id, type, amount)
  values (p_slack_user_id, 'market_purchase', -v_price);

  begin
    insert into public.market_purchases (
      market_date,
      slot,
      slack_user_id,
      user_pokemon_id,
      price_paid
    )
    values (
      p_market_date,
      p_slot,
      p_slack_user_id,
      user_pokemon_id,
      v_price
    );
  exception
    when unique_violation then
      raise exception 'already_bought_slot';
  end;

  return query select true, null::text, v_species_id, v_price, remaining_gold, user_pokemon_id;
exception
  when others then
    if sqlerrm like '%already_bought_slot%' then
      return query select false, 'already_bought_slot', null::integer, null::integer, v_user_gold, null::bigint;
      return;
    end if;
    raise;
end;
$$;
