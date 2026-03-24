alter table public.user_pokemons
  add column if not exists book_bonus_attack integer not null default 0,
  add column if not exists book_bonus_magic integer not null default 0,
  add column if not exists book_bonus_defense integer not null default 0,
  add column if not exists book_bonus_hp integer not null default 0,
  add column if not exists book_bonus_speed integer not null default 0;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'user_pokemons_book_bonus_bounds'
      and conrelid = 'public.user_pokemons'::regclass
  ) then
    alter table public.user_pokemons
      add constraint user_pokemons_book_bonus_bounds check (
        book_bonus_attack between 0 and 30
        and book_bonus_magic between 0 and 30
        and book_bonus_defense between 0 and 30
        and book_bonus_hp between 0 and 30
        and book_bonus_speed between 0 and 30
      );
  end if;
end $$;

create or replace function public.apply_ancient_book_bonus(
  p_slack_user_id text,
  p_pokemon_id bigint,
  p_stat_key text,
  p_item_key text default 'ancient_book',
  p_item_cost bigint default 5
)
returns table (
  ok boolean,
  reason text,
  pokemon_id bigint,
  stat_key text,
  stat_bonus integer,
  item_remaining bigint
)
language plpgsql
as $$
declare
  v_stat_key text := lower(trim(coalesce(p_stat_key, '')));
  v_item_key text := lower(trim(coalesce(p_item_key, 'ancient_book')));
  v_cost bigint := greatest(coalesce(p_item_cost, 5), 1);
  v_current_bonus integer;
  v_item_remaining bigint;
begin
  perform 1
  from public.user_pokemons up
  where up.id = p_pokemon_id
    and up.slack_user_id = p_slack_user_id
  for update;

  if not found then
    return query select false, 'pokemon_not_owned', p_pokemon_id, v_stat_key, null::integer, null::bigint;
    return;
  end if;

  if v_stat_key not in ('attack', 'magic', 'defense', 'hp', 'speed') then
    return query select false, 'invalid_stat', p_pokemon_id, v_stat_key, null::integer, null::bigint;
    return;
  end if;

  select case v_stat_key
    when 'attack' then up.book_bonus_attack
    when 'magic' then up.book_bonus_magic
    when 'defense' then up.book_bonus_defense
    when 'hp' then up.book_bonus_hp
    when 'speed' then up.book_bonus_speed
  end
    into v_current_bonus
  from public.user_pokemons up
  where up.id = p_pokemon_id
    and up.slack_user_id = p_slack_user_id
  for update;

  if coalesce(v_current_bonus, 0) >= 30 then
    return query select false, 'stat_maxed', p_pokemon_id, v_stat_key, coalesce(v_current_bonus, 0), null::bigint;
    return;
  end if;

  update public.user_items ui
  set quantity = ui.quantity - v_cost,
      updated_at = now()
  where ui.slack_user_id = p_slack_user_id
    and ui.item_key = v_item_key
    and ui.quantity >= v_cost
  returning ui.quantity into v_item_remaining;

  if not found then
    return query select false, 'insufficient_item', p_pokemon_id, v_stat_key, coalesce(v_current_bonus, 0), null::bigint;
    return;
  end if;

  update public.user_pokemons up
  set book_bonus_attack = case when v_stat_key = 'attack' then up.book_bonus_attack + 1 else up.book_bonus_attack end,
      book_bonus_magic = case when v_stat_key = 'magic' then up.book_bonus_magic + 1 else up.book_bonus_magic end,
      book_bonus_defense = case when v_stat_key = 'defense' then up.book_bonus_defense + 1 else up.book_bonus_defense end,
      book_bonus_hp = case when v_stat_key = 'hp' then up.book_bonus_hp + 1 else up.book_bonus_hp end,
      book_bonus_speed = case when v_stat_key = 'speed' then up.book_bonus_speed + 1 else up.book_bonus_speed end,
      attack = case when v_stat_key = 'attack' then up.attack + 1 else up.attack end,
      magic = case when v_stat_key = 'magic' then up.magic + 1 else up.magic end,
      defense = case when v_stat_key = 'defense' then up.defense + 1 else up.defense end,
      hp = case when v_stat_key = 'hp' then up.hp + 1 else up.hp end,
      current_hp = case when v_stat_key = 'hp' then least(up.hp + 1, greatest(coalesce(up.current_hp, up.hp), 0) + 1) else up.current_hp end,
      speed = case when v_stat_key = 'speed' then up.speed + 1 else up.speed end
  where up.id = p_pokemon_id
    and up.slack_user_id = p_slack_user_id;

  select case v_stat_key
    when 'attack' then up.book_bonus_attack
    when 'magic' then up.book_bonus_magic
    when 'defense' then up.book_bonus_defense
    when 'hp' then up.book_bonus_hp
    when 'speed' then up.book_bonus_speed
  end
    into v_current_bonus
  from public.user_pokemons up
  where up.id = p_pokemon_id
    and up.slack_user_id = p_slack_user_id;

  return query select true, null::text, p_pokemon_id, v_stat_key, v_current_bonus, v_item_remaining;
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
  v_book_bonus_attack integer := 0;
  v_book_bonus_magic integer := 0;
  v_book_bonus_defense integer := 0;
  v_book_bonus_hp integer := 0;
  v_book_bonus_speed integer := 0;
  v_attack integer;
  v_magic integer;
  v_defense integer;
  v_hp integer;
  v_speed integer;
  v_final_hp integer;
begin
  select up.species_id,
         up.level,
         ps.rarity,
         ps.evolution_stage,
         ps.evolves_to,
         ps.name,
         coalesce(up.book_bonus_attack, 0),
         coalesce(up.book_bonus_magic, 0),
         coalesce(up.book_bonus_defense, 0),
         coalesce(up.book_bonus_hp, 0),
         coalesce(up.book_bonus_speed, 0)
    into v_species_id,
         v_level,
         v_rarity,
         v_evolution_stage,
         v_next_species_id,
         v_current_species_name,
         v_book_bonus_attack,
         v_book_bonus_magic,
         v_book_bonus_defense,
         v_book_bonus_hp,
         v_book_bonus_speed
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

  select ps.name, ps.base_attack, ps.base_magic, ps.base_defense, ps.base_hp, ps.base_speed
    into v_next_species_name, v_next_base_attack, v_next_base_magic, v_next_base_defense, v_next_base_hp, v_next_base_speed
  from public.pokemon_species ps
  where ps.id = v_next_species_id
  for update;

  if not found then
    return query select false, 'next_species_not_found', v_species_id, v_next_species_id, v_current_species_name, null::text, 0::bigint, null::bigint;
    return;
  end if;

  if v_next_base_attack is null or v_next_base_magic is null or v_next_base_defense is null or v_next_base_hp is null or v_next_base_speed is null then
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

  select s.attack, s.magic, s.defense, s.hp, s.speed
    into v_attack, v_magic, v_defense, v_hp, v_speed
  from public.calculate_pokemon_level_stats(v_next_base_attack, v_next_base_magic, v_next_base_defense, v_next_base_hp, v_next_base_speed, v_level) s;

  v_attack := v_attack + v_book_bonus_attack;
  v_magic := v_magic + v_book_bonus_magic;
  v_defense := v_defense + v_book_bonus_defense;
  v_final_hp := v_hp + v_book_bonus_hp;
  v_speed := v_speed + v_book_bonus_speed;

  update public.user_pokemons
  set species_id = v_next_species_id,
      attack = v_attack,
      magic = v_magic,
      defense = v_defense,
      current_hp = least(v_final_hp, greatest(0, round((greatest(coalesce(current_hp, hp), 0)::numeric / greatest(hp, 1)::numeric) * v_final_hp)::integer)),
      hp = v_final_hp,
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
  v_base_magic integer;
  v_base_defense integer;
  v_base_hp integer;
  v_base_speed integer;
  v_book_bonus_attack integer := 0;
  v_book_bonus_magic integer := 0;
  v_book_bonus_defense integer := 0;
  v_book_bonus_hp integer := 0;
  v_book_bonus_speed integer := 0;
  v_cost bigint;
  v_new_level integer;
  v_attack integer;
  v_magic integer;
  v_defense integer;
  v_hp integer;
  v_speed integer;
begin
  select up.level,
         ps.base_attack,
         ps.base_magic,
         ps.base_defense,
         ps.base_hp,
         ps.base_speed,
         coalesce(up.book_bonus_attack, 0),
         coalesce(up.book_bonus_magic, 0),
         coalesce(up.book_bonus_defense, 0),
         coalesce(up.book_bonus_hp, 0),
         coalesce(up.book_bonus_speed, 0)
    into v_level,
         v_base_attack,
         v_base_magic,
         v_base_defense,
         v_base_hp,
         v_base_speed,
         v_book_bonus_attack,
         v_book_bonus_magic,
         v_book_bonus_defense,
         v_book_bonus_hp,
         v_book_bonus_speed
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
      attack = v_attack + v_book_bonus_attack,
      magic = v_magic + v_book_bonus_magic,
      defense = v_defense + v_book_bonus_defense,
      current_hp = v_hp + v_book_bonus_hp,
      hp = v_hp + v_book_bonus_hp,
      speed = v_speed + v_book_bonus_speed
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
  v_book_bonus_attack integer := 0;
  v_book_bonus_magic integer := 0;
  v_book_bonus_defense integer := 0;
  v_book_bonus_hp integer := 0;
  v_book_bonus_speed integer := 0;
  v_total_cost bigint := 0;
  v_attack integer;
  v_magic integer;
  v_defense integer;
  v_hp integer;
  v_speed integer;
  i integer;
begin
  select up.level,
         up.species_id,
         coalesce(up.book_bonus_attack, 0),
         coalesce(up.book_bonus_magic, 0),
         coalesce(up.book_bonus_defense, 0),
         coalesce(up.book_bonus_hp, 0),
         coalesce(up.book_bonus_speed, 0)
    into v_level,
         v_species_id,
         v_book_bonus_attack,
         v_book_bonus_magic,
         v_book_bonus_defense,
         v_book_bonus_hp,
         v_book_bonus_speed
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
      attack = v_attack + v_book_bonus_attack,
      magic = v_magic + v_book_bonus_magic,
      defense = v_defense + v_book_bonus_defense,
      current_hp = v_hp + v_book_bonus_hp,
      hp = v_hp + v_book_bonus_hp,
      speed = v_speed + v_book_bonus_speed
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
  v_base_magic integer;
  v_base_defense integer;
  v_base_hp integer;
  v_base_speed integer;
  v_book_bonus_attack integer := 0;
  v_book_bonus_magic integer := 0;
  v_book_bonus_defense integer := 0;
  v_book_bonus_hp integer := 0;
  v_book_bonus_speed integer := 0;
  v_attack integer;
  v_magic integer;
  v_defense integer;
  v_hp integer;
  v_speed integer;
begin
  select up.level,
         coalesce(up.upgrade_spent_gold, 0),
         ps.base_attack,
         ps.base_magic,
         ps.base_defense,
         ps.base_hp,
         ps.base_speed,
         coalesce(up.book_bonus_attack, 0),
         coalesce(up.book_bonus_magic, 0),
         coalesce(up.book_bonus_defense, 0),
         coalesce(up.book_bonus_hp, 0),
         coalesce(up.book_bonus_speed, 0)
    into v_level,
         v_refund,
         v_base_attack,
         v_base_magic,
         v_base_defense,
         v_base_hp,
         v_base_speed,
         v_book_bonus_attack,
         v_book_bonus_magic,
         v_book_bonus_defense,
         v_book_bonus_hp,
         v_book_bonus_speed
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

  if v_base_attack is null or v_base_magic is null or v_base_defense is null or v_base_hp is null or v_base_speed is null then
    return query select false, 'species_stats_missing', v_level, v_level, 0::bigint, null::bigint;
    return;
  end if;

  select s.attack, s.magic, s.defense, s.hp, s.speed
    into v_attack, v_magic, v_defense, v_hp, v_speed
  from public.calculate_pokemon_level_stats(v_base_attack, v_base_magic, v_base_defense, v_base_hp, v_base_speed, 1) s;

  update public.user_pokemons
  set level = 1,
      upgrade_spent_gold = 0,
      attack = v_attack + v_book_bonus_attack,
      magic = v_magic + v_book_bonus_magic,
      defense = v_defense + v_book_bonus_defense,
      hp = v_hp + v_book_bonus_hp,
      current_hp = least(greatest(coalesce(current_hp, 0), 0), v_hp + v_book_bonus_hp),
      speed = v_speed + v_book_bonus_speed
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
