-- Rebalance upgrade economy and migrate gold-related amounts to bigint safely.

alter table public.users
  alter column gold type bigint using gold::bigint,
  alter column gold set default 100;

alter table public.transactions
  alter column amount type bigint using amount::bigint;

alter table public.daily_market
  alter column price type bigint using price::bigint;

alter table public.market_purchases
  alter column price_paid type bigint using price_paid::bigint;

alter table public.trades
  alter column initiator_gold_offer type bigint using initiator_gold_offer::bigint,
  alter column target_gold_offer type bigint using target_gold_offer::bigint;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'users_gold_non_negative'
      and conrelid = 'public.users'::regclass
  ) then
    alter table public.users
      add constraint users_gold_non_negative check (gold >= 0);
  end if;
end $$;

create or replace function public.calculate_upgrade_cost(p_current_level integer)
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

create or replace function public.accept_trade(
  p_trade_id bigint,
  p_accepting_user_id text
)
returns public.trades
language plpgsql
as $$
declare
  v_trade public.trades;
  v_initiator_gold bigint;
  v_target_gold bigint;
begin
  select *
    into v_trade
  from public.trades
  where id = p_trade_id
  for update;

  if not found then
    raise exception 'Trade não encontrado';
  end if;

  if v_trade.status <> 'pending' then
    raise exception 'Este trade não está mais pendente';
  end if;

  if v_trade.target_user_id <> p_accepting_user_id then
    raise exception 'Apenas o usuário alvo pode aceitar este trade';
  end if;

  if exists (
    select 1
    from public.trade_items ti
    join public.user_pokemons up on up.id = ti.user_pokemon_id
    where ti.trade_id = v_trade.id
      and ti.owner_user_id <> up.slack_user_id
  ) then
    raise exception 'Alguns Pokémon da oferta não pertencem mais aos donos originais';
  end if;

  select gold into v_initiator_gold
  from public.users
  where slack_user_id = v_trade.initiator_user_id
  for update;

  select gold into v_target_gold
  from public.users
  where slack_user_id = v_trade.target_user_id
  for update;

  if v_initiator_gold < v_trade.initiator_gold_offer then
    raise exception 'Saldo insuficiente do iniciador';
  end if;

  if v_target_gold < v_trade.target_gold_offer then
    raise exception 'Saldo insuficiente do alvo';
  end if;

  update public.user_pokemons up
  set slack_user_id = case
    when ti.owner_user_id = v_trade.initiator_user_id then v_trade.target_user_id
    else v_trade.initiator_user_id
  end
  from public.trade_items ti
  where ti.trade_id = v_trade.id
    and ti.user_pokemon_id = up.id;

  update public.users
  set gold = gold - v_trade.initiator_gold_offer + v_trade.target_gold_offer
  where slack_user_id = v_trade.initiator_user_id;

  update public.users
  set gold = gold - v_trade.target_gold_offer + v_trade.initiator_gold_offer
  where slack_user_id = v_trade.target_user_id;

  insert into public.transactions (slack_user_id, type, amount)
  values
    (v_trade.initiator_user_id, 'trade_gold_delta', -v_trade.initiator_gold_offer + v_trade.target_gold_offer),
    (v_trade.target_user_id, 'trade_gold_delta', -v_trade.target_gold_offer + v_trade.initiator_gold_offer);

  update public.trades
  set status = 'accepted',
      accepted_at = now(),
      updated_at = now()
  where id = v_trade.id
  returning * into v_trade;

  return v_trade;
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
         current_species.evolves_to,
         next_species.name,
         next_species.base_attack,
         next_species.base_defense,
         next_species.base_hp,
         next_species.base_speed
    into v_level,
         v_current_species_id,
         v_current_species_name,
         v_rarity,
         v_current_evolution_stage,
         v_next_species_id,
         v_next_species_name,
         v_next_base_attack,
         v_next_base_defense,
         v_next_base_hp,
         v_next_base_speed
  from public.user_pokemons up
  join public.pokemon_species current_species on current_species.id = up.species_id
  left join public.pokemon_species next_species on next_species.id = current_species.evolves_to
  where up.id = p_pokemon_id
    and up.slack_user_id = p_slack_user_id
  for update of up, current_species, next_species;

  if not found then
    return query select false, 'pokemon_not_owned', null::integer, null::integer, null::text, null::text, null::bigint, null::bigint;
    return;
  end if;

  if v_next_species_id is null then
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
    raise exception 'Gold insuficiente no momento do débito';
  end if;

  insert into public.transactions (slack_user_id, type, amount)
  values (p_slack_user_id, 'pokemon_evolution', -v_cost);

  return query select true, null::text, v_current_species_id, v_next_species_id, v_current_species_name, v_next_species_name, v_cost, remaining_gold;
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
  price bigint,
  remaining_gold bigint,
  user_pokemon_id bigint
)
language plpgsql
as $$
declare
  v_user_gold bigint;
  v_species_id integer;
  v_rarity text;
  v_price bigint;
  v_base_attack integer;
  v_base_defense integer;
  v_base_hp integer;
  v_base_speed integer;
begin
  select u.gold into v_user_gold
  from public.users u
  where u.slack_user_id = p_slack_user_id
  for update;

  if not found then
    return query select false, 'user_not_started', null::integer, null::bigint, null::bigint, null::bigint;
    return;
  end if;

  if exists (
    select 1
    from public.market_purchases mp
    where mp.market_date = p_market_date
      and mp.slot = p_slot
      and mp.slack_user_id = p_slack_user_id
  ) then
    return query select false, 'already_bought_slot', null::integer, null::bigint, v_user_gold, null::bigint;
    return;
  end if;

  select dm.species_id, dm.price, ps.rarity, ps.base_attack, ps.base_defense, ps.base_hp, ps.base_speed
    into v_species_id, v_price, v_rarity, v_base_attack, v_base_defense, v_base_hp, v_base_speed
  from public.daily_market dm
  join public.pokemon_species ps on ps.id = dm.species_id
  where dm.market_date = p_market_date
    and dm.slot = p_slot;

  if not found then
    return query select false, 'invalid_slot', null::integer, null::bigint, v_user_gold, null::bigint;
    return;
  end if;

  if v_base_attack is null or v_base_defense is null or v_base_hp is null or v_base_speed is null then
    return query select false, 'species_stats_missing', v_species_id, v_price, v_user_gold, null::bigint;
    return;
  end if;

  if v_user_gold < v_price then
    return query select false, 'insufficient_gold', v_species_id, v_price, v_user_gold, null::bigint;
    return;
  end if;

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
    greatest(1, v_base_attack),
    greatest(1, v_base_defense),
    greatest(1, v_base_hp),
    greatest(1, v_base_speed),
    'market'
  )
  returning id into user_pokemon_id;

  update public.users
  set gold = gold - v_price
  where slack_user_id = p_slack_user_id
    and gold >= v_price
  returning gold into remaining_gold;

  if remaining_gold is null then
    raise exception 'Gold insuficiente no momento do débito';
  end if;

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
      return query select false, 'already_bought_slot', null::integer, null::bigint, v_user_gold, null::bigint;
      return;
    end if;
    raise;
end;
$$;
