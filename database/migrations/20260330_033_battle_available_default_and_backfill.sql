-- Fix battle availability defaults and rollback unintended global enablement.

alter table public.user_pokemons
  alter column is_battle_available set default false;

update public.user_pokemons
set is_battle_available = false
where is_battle_available = true;
