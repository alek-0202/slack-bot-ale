create or replace function public.upgrade_healing_station(
  p_slack_user_id text
)
returns table (
  previous_level integer,
  new_level integer,
  cost_paid bigint,
  remaining_gold bigint
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_station public.healing_stations%rowtype;
  v_user public.users%rowtype;
  v_target_level integer;
  v_cost bigint;
begin
  if p_slack_user_id is null or btrim(p_slack_user_id) = '' then
    raise exception 'Usuário inválido';
  end if;

  insert into public.users (slack_user_id)
  values (p_slack_user_id)
  on conflict (slack_user_id) do nothing;

  insert into public.healing_stations (slack_user_id)
  values (p_slack_user_id)
  on conflict (slack_user_id) do nothing;

  select *
    into v_station
    from public.healing_stations
   where slack_user_id = p_slack_user_id
   for update;

  select *
    into v_user
    from public.users
   where slack_user_id = p_slack_user_id
   for update;

  if not found then
    raise exception 'Usuário não encontrado';
  end if;

  if v_station.level >= 30 then
    raise exception 'Nível máximo da estação já alcançado';
  end if;

  v_target_level := v_station.level + 1;
  v_cost := 7000 + ((v_target_level - 1) * 3000);

  if v_user.gold < v_cost then
    raise exception 'Gold insuficiente para upgrade da estação';
  end if;

  update public.users
     set gold = gold - v_cost
   where slack_user_id = p_slack_user_id;

  update public.healing_stations
     set level = v_target_level
   where slack_user_id = p_slack_user_id;

  return query
  select v_station.level, v_target_level, v_cost, (v_user.gold - v_cost);
end;
$$;
