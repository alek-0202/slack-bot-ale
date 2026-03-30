-- Backfill controlado para recalcular snapshots legados de user_pokemons
-- usando a fórmula central atual (calculate_pokemon_level_stats),
-- preservando percentual de HP e identidade do pokémon.

create or replace function public.rebalance_user_pokemons_backfill(
  p_limit integer default 1000,
  p_after_id bigint default 0,
  p_slack_user_id text default null,
  p_apply boolean default false
)
returns table (
  ok boolean,
  reason text,
  scanned integer,
  would_update integer,
  updated integer,
  next_after_id bigint
)
language plpgsql
as $$
declare
  v_limit integer := greatest(least(coalesce(p_limit, 1000), 10000), 1);
  v_scanned integer := 0;
  v_would_update integer := 0;
  v_updated integer := 0;
  v_next_after_id bigint := coalesce(p_after_id, 0);
begin
  if p_apply then
    with candidates as (
      select
        up.id,
        up.hp as old_hp,
        coalesce(up.current_hp, up.hp) as old_current_hp,
        up.attack,
        up.magic,
        up.defense,
        up.speed,
        ps.base_attack,
        ps.base_magic,
        ps.base_defense,
        ps.base_hp,
        ps.base_speed,
        ps.rarity,
        up.level,
        coalesce(up.attack_iv, 0) as attack_iv,
        coalesce(up.magic_iv, 0) as magic_iv,
        coalesce(up.defense_iv, 0) as defense_iv,
        coalesce(up.hp_iv, 0) as hp_iv,
        coalesce(up.speed_iv, 0) as speed_iv,
        coalesce(up.shiny, false) as shiny,
        up.shiny_type
      from public.user_pokemons up
      join public.pokemon_species ps on ps.id = up.species_id
      where up.id > coalesce(p_after_id, 0)
        and (p_slack_user_id is null or up.slack_user_id = p_slack_user_id)
      order by up.id
      limit v_limit
      for update of up skip locked
    ),
    recalculated as (
      select
        c.id,
        c.old_hp,
        c.old_current_hp,
        s.attack,
        s.magic,
        s.defense,
        s.hp,
        s.speed,
        public.preserve_hp_ratio(c.old_current_hp, c.old_hp, s.hp) as new_current_hp
      from candidates c
      cross join lateral public.calculate_pokemon_level_stats(
        c.base_attack,
        c.base_magic,
        c.base_defense,
        c.base_hp,
        c.base_speed,
        c.level,
        c.attack_iv,
        c.magic_iv,
        c.defense_iv,
        c.hp_iv,
        c.speed_iv,
        c.rarity,
        c.shiny,
        c.shiny_type
      ) s
    ),
    candidates_count as (
      select count(*)::integer as total,
             coalesce(max(id), coalesce(p_after_id, 0))::bigint as max_id
      from candidates
    ),
    changes as (
      select r.*
      from recalculated r
      join candidates c on c.id = r.id
      where (c.attack, c.magic, c.defense, c.old_hp, c.speed, c.old_current_hp)
        is distinct from (r.attack, r.magic, r.defense, r.hp, r.speed, r.new_current_hp)
    ),
    apply_update as (
      update public.user_pokemons up
      set
        attack = ch.attack,
        magic = ch.magic,
        defense = ch.defense,
        hp = ch.hp,
        current_hp = ch.new_current_hp,
        speed = ch.speed
      from changes ch
      where up.id = ch.id
      returning up.id
    )
    select
      cc.total,
      (select count(*)::integer from changes),
      (select count(*)::integer from apply_update),
      cc.max_id
    into v_scanned, v_would_update, v_updated, v_next_after_id
    from candidates_count cc;
  else
    with candidates as (
      select
        up.id,
        up.hp as old_hp,
        coalesce(up.current_hp, up.hp) as old_current_hp,
        up.attack,
        up.magic,
        up.defense,
        up.speed,
        ps.base_attack,
        ps.base_magic,
        ps.base_defense,
        ps.base_hp,
        ps.base_speed,
        ps.rarity,
        up.level,
        coalesce(up.attack_iv, 0) as attack_iv,
        coalesce(up.magic_iv, 0) as magic_iv,
        coalesce(up.defense_iv, 0) as defense_iv,
        coalesce(up.hp_iv, 0) as hp_iv,
        coalesce(up.speed_iv, 0) as speed_iv,
        coalesce(up.shiny, false) as shiny,
        up.shiny_type
      from public.user_pokemons up
      join public.pokemon_species ps on ps.id = up.species_id
      where up.id > coalesce(p_after_id, 0)
        and (p_slack_user_id is null or up.slack_user_id = p_slack_user_id)
      order by up.id
      limit v_limit
    ),
    recalculated as (
      select
        c.id,
        c.old_hp,
        c.old_current_hp,
        c.attack as old_attack,
        c.magic as old_magic,
        c.defense as old_defense,
        c.speed as old_speed,
        s.attack,
        s.magic,
        s.defense,
        s.hp,
        s.speed,
        public.preserve_hp_ratio(c.old_current_hp, c.old_hp, s.hp) as new_current_hp
      from candidates c
      cross join lateral public.calculate_pokemon_level_stats(
        c.base_attack,
        c.base_magic,
        c.base_defense,
        c.base_hp,
        c.base_speed,
        c.level,
        c.attack_iv,
        c.magic_iv,
        c.defense_iv,
        c.hp_iv,
        c.speed_iv,
        c.rarity,
        c.shiny,
        c.shiny_type
      ) s
    )
    select
      count(*)::integer,
      count(*) filter (
        where (old_attack, old_magic, old_defense, old_hp, old_speed, old_current_hp)
          is distinct from (attack, magic, defense, hp, speed, new_current_hp)
      )::integer,
      0::integer,
      coalesce(max(id), coalesce(p_after_id, 0))::bigint
    into v_scanned, v_would_update, v_updated, v_next_after_id
    from recalculated;
  end if;

  return query
  select
    true,
    case when p_apply then 'applied' else 'dry_run' end,
    v_scanned,
    v_would_update,
    v_updated,
    v_next_after_id;
end;
$$;
