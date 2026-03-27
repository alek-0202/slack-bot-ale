-- Keep legendary at +15 and raise mythical base rarity bonus to +20.

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
  v_rarity_bonus integer := case coalesce(p_rarity, '') when 'legendary' then 15 when 'mythical' then 20 else 0 end;
  v_is_shiny boolean := coalesce(p_is_shiny, false);
  v_is_prime boolean := v_is_shiny and coalesce(p_shiny_type, '') = 'prime';
  v_prime_bonus integer := case when v_is_prime then 10 else 0 end;
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
    greatest(round((greatest(round(v_attack * (1 + (0.18 * v_level_gains) + (0.25 * v_milestones)))::integer + case when v_level = 50 then 5 else 0 end, 1)) * case when v_is_shiny then 1.15 else 1 end)::integer, 1),
    greatest(round((greatest(round(v_magic * (1 + (0.19 * v_level_gains) + (0.26 * v_milestones)))::integer + case when v_level = 50 then 6 else 0 end, 1)) * case when v_is_shiny then 1.15 else 1 end)::integer, 1),
    greatest(round((greatest(round(v_defense * (1 + (0.18 * v_level_gains) + (0.25 * v_milestones)))::integer + case when v_level = 50 then 5 else 0 end, 1)) * case when v_is_shiny then 1.15 else 1 end)::integer, 1),
    greatest(round((greatest(round(v_hp * (1 + (0.24 * v_level_gains) + (0.35 * v_milestones)))::integer + case when v_level = 50 then 15 else 0 end, 1)) * case when v_is_shiny then 1.15 else 1 end)::integer, 1),
    greatest(round((greatest(round(v_speed * (1 + (0.10 * v_level_gains) + (0.15 * v_milestones)))::integer + case when v_level = 50 then 5 else 0 end, 1)) * case when v_is_shiny then 1.15 else 1 end)::integer, 1),
    v_milestones;
end;
$$;
