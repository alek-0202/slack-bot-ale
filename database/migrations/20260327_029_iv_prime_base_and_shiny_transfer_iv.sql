-- IV and prime bonus are now part of the base used for level progression.
-- Prime capture gets +10 over normal IV cap, while shiny transfer merges IV with normal cap (+12).

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
  v_is_shiny boolean := coalesce(p_is_shiny, false);
  v_is_prime boolean := v_is_shiny and coalesce(p_shiny_type, '') = 'prime';
  v_prime_bonus integer := case when v_is_prime then 10 else 0 end;
  v_attack integer := greatest(coalesce(p_base_attack, 10) + v_legendary_bonus + coalesce(p_attack_iv, 0) + v_prime_bonus, 1);
  v_magic integer := greatest(coalesce(p_base_magic, p_base_attack, 10) + v_legendary_bonus + coalesce(p_magic_iv, 0) + v_prime_bonus, 1);
  v_defense integer := greatest(coalesce(p_base_defense, 10) + v_legendary_bonus + coalesce(p_defense_iv, 0) + v_prime_bonus, 1);
  v_hp integer := greatest(coalesce(p_base_hp, 10) + v_legendary_bonus + coalesce(p_hp_iv, 0) + v_prime_bonus, 1);
  v_speed integer := greatest(coalesce(p_base_speed, 10) + v_legendary_bonus + coalesce(p_speed_iv, 0) + v_prime_bonus, 1);
  v_milestones integer := greatest(least(floor(v_level / 10.0)::integer, 5), 0);
  v_level_gains integer := greatest(v_level - 1, 0);
begin
  return query
  select
    greatest(round((greatest(round(v_attack * (1 + (0.18 * v_level_gains) + (0.25 * v_milestones)))::integer + case when v_level = 50 then 5 else 0 end, 1)) * case when v_is_shiny then 1.15 else 1 end)::integer, 1),
    greatest(round((greatest(round(v_magic * (1 + (0.19 * v_level_gains) + (0.26 * v_milestones)))::integer + case when v_level = 50 then 6 else 0 end, 1)) * case when v_is_shiny then 1.15 else 1 end)::integer, 1),
    greatest(round((greatest(round(v_defense * (1 + (0.18 * v_level_gains) + (0.25 * v_milestones)))::integer + case when v_level = 50 then 5 else 0 end, 1)) * case when v_is_shiny then 1.15 else 1 end)::integer, 1),
    greatest(round((greatest(round(v_hp * (1 + (0.24 * v_level_gains) + (0.35 * v_milestones)))::integer + case when v_level = 50 then 15 else 0 end, 1)) * case when v_is_shiny then 1.15 else 1 end)::integer, 1),
    greatest(round((greatest(round(v_speed * (1 + (0.10 * v_level_gains) + (0.15 * v_milestones)))::integer + case when v_level = 50 then 5 else 0 end, 1)) * case when v_is_shiny then 1.15 else 1 end)::integer, 1),
    v_milestones;
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
  v_gold bigint;
  v_cost bigint := 5000000;
  v_target_attack_iv integer;
  v_target_magic_iv integer;
  v_target_defense_iv integer;
  v_target_hp_iv integer;
  v_target_speed_iv integer;
begin
  if p_source_pokemon_id = p_target_pokemon_id then
    return query select false, 'same_pokemon';
    return;
  end if;

  select gold into v_gold
  from public.users
  where slack_user_id = p_slack_user_id
  for update;

  if not found then
    return query select false, 'pokemon_not_owned';
    return;
  end if;

  select * into v_source from public.user_pokemons where id = p_source_pokemon_id and slack_user_id = p_slack_user_id for update;
  select * into v_target from public.user_pokemons where id = p_target_pokemon_id and slack_user_id = p_slack_user_id for update;

  if v_source.id is null or v_target.id is null then return query select false, 'pokemon_not_owned'; return; end if;
  if coalesce(v_source.shiny, false) = false then return query select false, 'source_not_shiny'; return; end if;
  if coalesce(v_target.shiny, false) = true then return query select false, 'target_already_shiny'; return; end if;
  if coalesce(v_gold, 0) < v_cost then return query select false, 'insufficient_gold'; return; end if;

  select * into v_source_species from public.pokemon_species where id = v_source.species_id;
  select * into v_target_species from public.pokemon_species where id = v_target.species_id;

  update public.users
  set gold = gold - v_cost
  where slack_user_id = p_slack_user_id and gold >= v_cost;

  if not found then
    return query select false, 'insufficient_gold';
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

  return query select true, null::text;
end;
$$;
