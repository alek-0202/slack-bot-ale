-- Prime bonus should be applied only during stat calculation, never persisted in IV columns.
-- Backfill malformed rows and add DB-level IV validation guardrails.

update public.user_pokemons
set
  attack_iv = greatest(-6, least(12, coalesce(attack_iv, 0))),
  defense_iv = greatest(-6, least(12, coalesce(defense_iv, 0))),
  magic_iv = greatest(-8, least(18, coalesce(magic_iv, 0))),
  hp_iv = greatest(-10, least(20, coalesce(hp_iv, 0))),
  speed_iv = greatest(-5, least(15, coalesce(speed_iv, 0)))
where
  coalesce(attack_iv, 0) < -6 or coalesce(attack_iv, 0) > 12
  or coalesce(defense_iv, 0) < -6 or coalesce(defense_iv, 0) > 12
  or coalesce(magic_iv, 0) < -8 or coalesce(magic_iv, 0) > 18
  or coalesce(hp_iv, 0) < -10 or coalesce(hp_iv, 0) > 20
  or coalesce(speed_iv, 0) < -5 or coalesce(speed_iv, 0) > 15;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'user_pokemons_attack_iv_range'
      and conrelid = 'public.user_pokemons'::regclass
  ) then
    alter table public.user_pokemons
      add constraint user_pokemons_attack_iv_range
      check (attack_iv between -6 and 12);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'user_pokemons_defense_iv_range'
      and conrelid = 'public.user_pokemons'::regclass
  ) then
    alter table public.user_pokemons
      add constraint user_pokemons_defense_iv_range
      check (defense_iv between -6 and 12);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'user_pokemons_magic_iv_range'
      and conrelid = 'public.user_pokemons'::regclass
  ) then
    alter table public.user_pokemons
      add constraint user_pokemons_magic_iv_range
      check (magic_iv between -8 and 18);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'user_pokemons_hp_iv_range'
      and conrelid = 'public.user_pokemons'::regclass
  ) then
    alter table public.user_pokemons
      add constraint user_pokemons_hp_iv_range
      check (hp_iv between -10 and 20);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'user_pokemons_speed_iv_range'
      and conrelid = 'public.user_pokemons'::regclass
  ) then
    alter table public.user_pokemons
      add constraint user_pokemons_speed_iv_range
      check (speed_iv between -5 and 15);
  end if;
end $$;
