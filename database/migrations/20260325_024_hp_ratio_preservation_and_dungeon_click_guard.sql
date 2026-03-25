create or replace function public.preserve_hp_ratio(
  p_current_hp integer,
  p_old_max_hp integer,
  p_new_max_hp integer
)
returns integer
language plpgsql
immutable
as $$
declare
  v_current_hp integer := greatest(coalesce(p_current_hp, 0), 0);
  v_old_max_hp integer := greatest(coalesce(p_old_max_hp, 0), 0);
  v_new_max_hp integer := greatest(coalesce(p_new_max_hp, 0), 0);
begin
  if v_new_max_hp = 0 then
    return 0;
  end if;

  if v_old_max_hp <= 0 then
    return least(v_current_hp, v_new_max_hp);
  end if;

  if v_current_hp >= v_old_max_hp then
    return v_new_max_hp;
  end if;

  return least(v_new_max_hp, greatest(0, floor((v_current_hp::numeric / v_old_max_hp::numeric) * v_new_max_hp)::integer));
end;
$$;

create or replace function public.user_pokemons_preserve_hp_ratio_before_update()
returns trigger
language plpgsql
as $$
begin
  if coalesce(new.hp, 0) <> coalesce(old.hp, 0) then
    new.current_hp := public.preserve_hp_ratio(coalesce(old.current_hp, old.hp), old.hp, new.hp);
  else
    new.current_hp := least(greatest(coalesce(new.current_hp, 0), 0), greatest(coalesce(new.hp, 0), 0));
  end if;

  return new;
end;
$$;

drop trigger if exists trg_user_pokemons_preserve_hp_ratio on public.user_pokemons;

create trigger trg_user_pokemons_preserve_hp_ratio
before update of hp, current_hp on public.user_pokemons
for each row
execute function public.user_pokemons_preserve_hp_ratio_before_update();
