-- Resolve ambiguous calls to calculate_pokemon_level_stats after IV/shiny overload.
-- Keep reset flow aligned with the new stats logic (IV, rarity, shiny).

drop function if exists public.calculate_pokemon_level_stats(
  integer,
  integer,
  integer,
  integer,
  integer,
  integer
);

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
  v_attack_iv integer := 0;
  v_magic_iv integer := 0;
  v_defense_iv integer := 0;
  v_hp_iv integer := 0;
  v_speed_iv integer := 0;
  v_rarity text;
  v_shiny boolean := false;
  v_shiny_type text;
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
         coalesce(up.book_bonus_speed, 0),
         coalesce(up.attack_iv, 0),
         coalesce(up.magic_iv, 0),
         coalesce(up.defense_iv, 0),
         coalesce(up.hp_iv, 0),
         coalesce(up.speed_iv, 0),
         ps.rarity,
         coalesce(up.shiny, false),
         up.shiny_type
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
         v_book_bonus_speed,
         v_attack_iv,
         v_magic_iv,
         v_defense_iv,
         v_hp_iv,
         v_speed_iv,
         v_rarity,
         v_shiny,
         v_shiny_type
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
  from public.calculate_pokemon_level_stats(
    v_base_attack,
    v_base_magic,
    v_base_defense,
    v_base_hp,
    v_base_speed,
    1,
    v_attack_iv,
    v_magic_iv,
    v_defense_iv,
    v_hp_iv,
    v_speed_iv,
    v_rarity,
    v_shiny,
    v_shiny_type
  ) s;

  update public.user_pokemons
  set level = 1,
      upgrade_spent_gold = 0,
      attack = v_attack + v_book_bonus_attack,
      magic = v_magic + v_book_bonus_magic,
      defense = v_defense + v_book_bonus_defense,
      hp = v_hp + v_book_bonus_hp,
      current_hp = public.preserve_hp_ratio(coalesce(current_hp, hp), hp, v_hp + v_book_bonus_hp),
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
