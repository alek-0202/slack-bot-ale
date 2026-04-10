drop function if exists public.transfer_pokemon_shiny(text, bigint, bigint);

create or replace function public.transfer_pokemon_shiny(
  p_slack_user_id text,
  p_source_pokemon_id bigint,
  p_target_pokemon_id bigint
)
returns table (
  ok boolean,
  reason text,
  cost_gold bigint
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
  v_gold bigint;
  v_cost_step bigint := 5000000;
  v_source_rarity_tier integer := 0;
  v_target_rarity_tier integer := 0;
  v_upward_rarity_diff integer := 0;
  v_cost bigint := 0;
  v_target_attack_iv integer;
  v_target_magic_iv integer;
  v_target_defense_iv integer;
  v_target_hp_iv integer;
  v_target_speed_iv integer;
begin
  if p_source_pokemon_id = p_target_pokemon_id then
    return query select false, 'same_pokemon', null::bigint;
    return;
  end if;

  select gold into v_gold
  from public.users
  where slack_user_id = p_slack_user_id
  for update;

  if not found then
    return query select false, 'pokemon_not_owned', null::bigint;
    return;
  end if;

  select * into v_source from public.user_pokemons where id = p_source_pokemon_id and slack_user_id = p_slack_user_id for update;
  select * into v_target from public.user_pokemons where id = p_target_pokemon_id and slack_user_id = p_slack_user_id for update;

  if v_source.id is null or v_target.id is null then return query select false, 'pokemon_not_owned', null::bigint; return; end if;
  if coalesce(v_source.shiny, false) = false then return query select false, 'source_not_shiny', null::bigint; return; end if;
  if coalesce(v_target.shiny, false) = true then return query select false, 'target_already_shiny', null::bigint; return; end if;

  select * into v_source_species from public.pokemon_species where id = v_source.species_id;
  select * into v_target_species from public.pokemon_species where id = v_target.species_id;

  if coalesce(lower(v_target_species.rarity), 'common') in ('legendary', 'mythical') then
    return query select false, 'target_invalid_rarity', null::bigint;
    return;
  end if;

  v_source_rarity_tier := case coalesce(lower(v_source_species.rarity), 'common')
    when 'uncommon' then 1
    when 'rare' then 2
    when 'epic' then 3
    when 'legendary' then 4
    when 'mythical' then 5
    else 0
  end;
  v_target_rarity_tier := case coalesce(lower(v_target_species.rarity), 'common')
    when 'uncommon' then 1
    when 'rare' then 2
    when 'epic' then 3
    when 'legendary' then 4
    when 'mythical' then 5
    else 0
  end;

  if v_target_rarity_tier < v_source_rarity_tier then
    return query select false, 'target_lower_rarity', null::bigint;
    return;
  end if;

  v_upward_rarity_diff := greatest(v_target_rarity_tier - v_source_rarity_tier, 0);
  v_cost := (v_upward_rarity_diff * v_cost_step);

  if coalesce(v_gold, 0) < v_cost then return query select false, 'insufficient_gold', v_cost; return; end if;

  update public.users
  set gold = gold - v_cost
  where slack_user_id = p_slack_user_id and gold >= v_cost;

  if not found then
    return query select false, 'insufficient_gold', v_cost;
    return;
  end if;

  insert into public.transactions (slack_user_id, type, amount)
  values (p_slack_user_id, 'pokemon_shiny_transfer', -v_cost);

  update public.user_pokemons set shiny = false, shiny_type = null where id = v_source.id;

  v_target_attack_iv := least(12, coalesce(v_target.attack_iv, 0) + coalesce(v_source.attack_iv, 0));
  v_target_magic_iv := least(12, coalesce(v_target.magic_iv, 0) + coalesce(v_source.magic_iv, 0));
  v_target_defense_iv := least(12, coalesce(v_target.defense_iv, 0) + coalesce(v_source.defense_iv, 0));
  v_target_hp_iv := least(12, coalesce(v_target.hp_iv, 0) + coalesce(v_source.hp_iv, 0));
  v_target_speed_iv := least(12, coalesce(v_target.speed_iv, 0) + coalesce(v_source.speed_iv, 0));

  update public.user_pokemons
  set shiny = true,
      shiny_type = 'normal',
      attack_iv = v_target_attack_iv,
      magic_iv = v_target_magic_iv,
      defense_iv = v_target_defense_iv,
      hp_iv = v_target_hp_iv,
      speed_iv = v_target_speed_iv
  where id = v_target.id;

  select s.attack, s.magic, s.defense, s.hp, s.speed into v_attack, v_magic, v_defense, v_hp, v_speed
  from public.calculate_pokemon_level_stats(v_source_species.base_attack, v_source_species.base_magic, v_source_species.base_defense, v_source_species.base_hp, v_source_species.base_speed, v_source.level, coalesce(v_source.attack_iv,0), coalesce(v_source.magic_iv,0), coalesce(v_source.defense_iv,0), coalesce(v_source.hp_iv,0), coalesce(v_source.speed_iv,0), v_source_species.rarity, false, null) s;
  update public.user_pokemons
  set attack = v_attack,
      magic = v_magic,
      defense = v_defense,
      current_hp = public.preserve_hp_ratio(coalesce(current_hp, hp), hp, v_hp),
      hp = v_hp,
      speed = v_speed
  where id = v_source.id;

  select s.attack, s.magic, s.defense, s.hp, s.speed into v_attack, v_magic, v_defense, v_hp, v_speed
  from public.calculate_pokemon_level_stats(v_target_species.base_attack, v_target_species.base_magic, v_target_species.base_defense, v_target_species.base_hp, v_target_species.base_speed, v_target.level, v_target_attack_iv, v_target_magic_iv, v_target_defense_iv, v_target_hp_iv, v_target_speed_iv, v_target_species.rarity, true, 'normal') s;
  update public.user_pokemons
  set attack = v_attack,
      magic = v_magic,
      defense = v_defense,
      current_hp = public.preserve_hp_ratio(coalesce(current_hp, hp), hp, v_hp),
      hp = v_hp,
      speed = v_speed
  where id = v_target.id;

  return query select true, null::text, v_cost;
end;
$$;
