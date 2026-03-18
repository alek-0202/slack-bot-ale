-- Species becomes the source of truth for base stats; user instances keep computed snapshots.

alter table public.pokemon_species add column if not exists base_attack integer;
alter table public.pokemon_species add column if not exists base_defense integer;
alter table public.pokemon_species add column if not exists base_hp integer;
alter table public.pokemon_species add column if not exists base_speed integer;

update public.pokemon_species
set
  base_attack = coalesce(base_attack, 10),
  base_defense = coalesce(base_defense, 10),
  base_hp = coalesce(base_hp, 12),
  base_speed = coalesce(base_speed, 10)
where base_attack is null
   or base_defense is null
   or base_hp is null
   or base_speed is null;

alter table public.pokemon_species alter column base_attack set default 10;
alter table public.pokemon_species alter column base_defense set default 10;
alter table public.pokemon_species alter column base_hp set default 12;
alter table public.pokemon_species alter column base_speed set default 10;

alter table public.pokemon_species alter column base_attack set not null;
alter table public.pokemon_species alter column base_defense set not null;
alter table public.pokemon_species alter column base_hp set not null;
alter table public.pokemon_species alter column base_speed set not null;

do $$
declare
  v_updated_species integer := 0;
  v_rebalanced_species integer := 0;
  v_backfilled_pokemon integer := 0;
begin
  with species_baseline as (
    select
      ps.id,
      case ps.rarity
        when 'common' then 10
        when 'uncommon' then 12
        when 'rare' then 15
        when 'epic' then 19
        when 'legendary' then 24
        when 'mythical' then 30
        else 10
      end as base_attack_seed,
      case ps.rarity
        when 'common' then 10
        when 'uncommon' then 12
        when 'rare' then 14
        when 'epic' then 18
        when 'legendary' then 22
        when 'mythical' then 28
        else 10
      end as base_defense_seed,
      case ps.rarity
        when 'common' then 14
        when 'uncommon' then 17
        when 'rare' then 21
        when 'epic' then 26
        when 'legendary' then 32
        when 'mythical' then 39
        else 14
      end as base_hp_seed,
      case ps.rarity
        when 'common' then 9
        when 'uncommon' then 11
        when 'rare' then 14
        when 'epic' then 17
        when 'legendary' then 21
        when 'mythical' then 26
        else 9
      end as base_speed_seed,
      greatest(coalesce(ps.evolution_stage, 1), 1) as evolution_stage
    from public.pokemon_species ps
  ),
  inferred_from_instances as (
    select
      up.species_id,
      round(avg(up.attack / power(1.02, greatest(up.level - 1, 0))))::integer as inferred_attack,
      round(avg(up.defense / power(1.02, greatest(up.level - 1, 0))))::integer as inferred_defense,
      round(avg(up.hp / power(1.02, greatest(up.level - 1, 0))))::integer as inferred_hp,
      round(avg(up.speed / power(1.02, greatest(up.level - 1, 0))))::integer as inferred_speed
    from public.user_pokemons up
    group by up.species_id
  )
  update public.pokemon_species ps
  set
    base_attack = greatest(1, coalesce(ifi.inferred_attack, ceil(sb.base_attack_seed * power(1.35, sb.evolution_stage - 1))::integer)),
    base_defense = greatest(1, coalesce(ifi.inferred_defense, ceil(sb.base_defense_seed * power(1.35, sb.evolution_stage - 1))::integer)),
    base_hp = greatest(1, coalesce(ifi.inferred_hp, ceil(sb.base_hp_seed * power(1.35, sb.evolution_stage - 1))::integer)),
    base_speed = greatest(1, coalesce(ifi.inferred_speed, ceil(sb.base_speed_seed * power(1.35, sb.evolution_stage - 1))::integer))
  from species_baseline sb
  left join inferred_from_instances ifi on ifi.species_id = sb.id
  where ps.id = sb.id;

  get diagnostics v_updated_species = row_count;
  raise notice '[species-base-stats] Species base stats seeded/reused for % species', v_updated_species;

  loop
    with evolution_updates as (
      select
        child.id,
        greatest(child.base_attack, ceil(parent.base_attack * 1.35)::integer) as next_attack,
        greatest(child.base_defense, ceil(parent.base_defense * 1.35)::integer) as next_defense,
        greatest(child.base_hp, ceil(parent.base_hp * 1.35)::integer) as next_hp,
        greatest(child.base_speed, ceil(parent.base_speed * 1.35)::integer) as next_speed
      from public.pokemon_species child
      join public.pokemon_species parent on parent.id = child.evolves_from
      where child.base_attack < ceil(parent.base_attack * 1.35)::integer
         or child.base_defense < ceil(parent.base_defense * 1.35)::integer
         or child.base_hp < ceil(parent.base_hp * 1.35)::integer
         or child.base_speed < ceil(parent.base_speed * 1.35)::integer
    )
    update public.pokemon_species ps
    set
      base_attack = eu.next_attack,
      base_defense = eu.next_defense,
      base_hp = eu.next_hp,
      base_speed = eu.next_speed
    from evolution_updates eu
    where ps.id = eu.id;

    get diagnostics v_rebalanced_species = row_count;
    exit when v_rebalanced_species = 0;
    raise notice '[species-base-stats] Evolution chain rebalanced for % species in current pass', v_rebalanced_species;
  end loop;

  update public.user_pokemons up
  set
    attack = greatest(1, ceil(ps.base_attack * power(1.02, greatest(up.level - 1, 0)))::integer),
    defense = greatest(1, ceil(ps.base_defense * power(1.02, greatest(up.level - 1, 0)))::integer),
    hp = greatest(1, ceil(ps.base_hp * power(1.02, greatest(up.level - 1, 0)))::integer),
    speed = greatest(1, ceil(ps.base_speed * power(1.02, greatest(up.level - 1, 0)))::integer)
  from public.pokemon_species ps
  where ps.id = up.species_id;

  get diagnostics v_backfilled_pokemon = row_count;
  raise notice '[species-base-stats] User pokemon stat snapshots recalculated for % records', v_backfilled_pokemon;
end $$;

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
  v_species_id integer;
  v_base_attack integer;
  v_base_defense integer;
  v_base_hp integer;
  v_base_speed integer;
  v_multiplier numeric;
  v_cost integer;
  v_new_level integer;
begin
  select up.level, up.species_id, ps.base_attack, ps.base_defense, ps.base_hp, ps.base_speed
    into v_level, v_species_id, v_base_attack, v_base_defense, v_base_hp, v_base_speed
  from public.user_pokemons up
  join public.pokemon_species ps on ps.id = up.species_id
  where up.id = p_pokemon_id
    and up.slack_user_id = p_slack_user_id
  for update of up, ps;

  if not found then
    return query select false, 'pokemon_not_owned', null::integer, null::integer, null::integer, null::integer;
    return;
  end if;

  if v_base_attack is null or v_base_defense is null or v_base_hp is null or v_base_speed is null then
    return query select false, 'species_stats_missing', v_level, v_level, 0, null::integer;
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
      attack = greatest(1, ceil(v_base_attack * power(1.02, greatest(v_new_level - 1, 0)))::integer),
      defense = greatest(1, ceil(v_base_defense * power(1.02, greatest(v_new_level - 1, 0)))::integer),
      hp = greatest(1, ceil(v_base_hp * power(1.02, greatest(v_new_level - 1, 0)))::integer),
      speed = greatest(1, ceil(v_base_speed * power(1.02, greatest(v_new_level - 1, 0)))::integer)
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
  v_level integer;
  v_current_species_id integer;
  v_next_species_id integer;
  v_current_species_name text;
  v_next_species_name text;
  v_rarity text;
  v_stage integer;
  v_rarity_tier integer;
  v_cost integer;
  v_next_base_attack integer;
  v_next_base_defense integer;
  v_next_base_hp integer;
  v_next_base_speed integer;
begin
  select up.species_id, up.level
    into v_current_species_id, v_level
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

  select ps.name, ps.base_attack, ps.base_defense, ps.base_hp, ps.base_speed
    into v_next_species_name, v_next_base_attack, v_next_base_defense, v_next_base_hp, v_next_base_speed
  from public.pokemon_species ps
  where ps.id = v_next_species_id;

  if not found then
    return query select false, 'no_evolution_available', v_current_species_id, null::integer, v_current_species_name, null::text, 0, null::integer;
    return;
  end if;

  if v_next_base_attack is null or v_next_base_defense is null or v_next_base_hp is null or v_next_base_speed is null then
    return query select false, 'species_stats_missing', v_current_species_id, v_next_species_id, v_current_species_name, v_next_species_name, 0, null::integer;
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
  v_price integer;
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

  select dm.species_id, dm.price, ps.base_attack, ps.base_defense, ps.base_hp, ps.base_speed
    into v_species_id, v_price, v_base_attack, v_base_defense, v_base_hp, v_base_speed
  from public.daily_market dm
  join public.pokemon_species ps on ps.id = dm.species_id
  where dm.market_date = p_market_date
    and dm.slot = p_slot;

  if not found then
    return query select false, 'invalid_slot', null::integer, null::integer, v_user_gold, null::bigint;
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
end;
$$;
