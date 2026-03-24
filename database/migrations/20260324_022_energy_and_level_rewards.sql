alter table public.users
  add column if not exists current_energy integer not null default 5,
  add column if not exists max_energy integer not null default 5,
  add column if not exists last_energy_update timestamptz not null default timezone('utc', now());

update public.users
set current_energy = coalesce(current_energy, 5),
    max_energy = greatest(1, coalesce(max_energy, 5)),
    last_energy_update = coalesce(last_energy_update, timezone('utc', now()));

alter table public.users
  alter column current_energy set default 5,
  alter column max_energy set default 5,
  alter column last_energy_update set default timezone('utc', now());

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'users_energy_non_negative'
      and conrelid = 'public.users'::regclass
  ) then
    alter table public.users
      add constraint users_energy_non_negative check (current_energy >= 0 and max_energy > 0 and current_energy <= max_energy);
  end if;
end $$;

create or replace function public.grant_account_xp(
  p_slack_user_id text,
  p_xp_amount bigint,
  p_reason text default 'system'
)
returns table (
  granted_xp bigint,
  previous_level integer,
  previous_total_xp bigint,
  current_level integer,
  current_total_xp bigint,
  current_level_xp bigint,
  xp_to_next_level bigint,
  leveled_up boolean,
  levels_gained integer,
  reason text,
  gold_reward_granted bigint,
  pokeball_c_granted bigint
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user public.users%rowtype;
  v_granted_xp bigint := greatest(coalesce(p_xp_amount, 0), 0);
  v_previous_snapshot record;
  v_current_snapshot record;
  v_level integer;
  v_gold_reward bigint := 0;
  v_pokeball_c_granted bigint := 0;
begin
  if p_slack_user_id is null or btrim(p_slack_user_id) = '' then
    raise exception 'slack_user_id é obrigatório';
  end if;

  insert into public.users as u (slack_user_id)
  values (btrim(p_slack_user_id))
  on conflict (slack_user_id) do nothing;

  select u.*
  into v_user
  from public.users as u
  where u.slack_user_id = btrim(p_slack_user_id)
  for update;

  select *
  into v_previous_snapshot
  from public.get_account_level_snapshot(v_user.account_xp);

  update public.users as u
  set account_xp = v_user.account_xp + v_granted_xp,
      account_level = (
        select gas.level
        from public.get_account_level_snapshot(v_user.account_xp + v_granted_xp) as gas
      )
  where u.slack_user_id = v_user.slack_user_id;

  select *
  into v_current_snapshot
  from public.get_account_level_snapshot(v_user.account_xp + v_granted_xp);

  if v_current_snapshot.level > v_previous_snapshot.level then
    for v_level in (v_previous_snapshot.level + 1)..v_current_snapshot.level loop
      v_gold_reward := v_gold_reward + (100 + ((v_level - 1) * 50));
      if mod(v_level, 20) = 0 then
        v_pokeball_c_granted := v_pokeball_c_granted + 1;
      end if;
    end loop;

    if v_gold_reward > 0 then
      perform *
      from public.apply_gold_transaction(
        btrim(p_slack_user_id),
        v_gold_reward,
        'account_level_up_reward'
      );
    end if;

    if v_pokeball_c_granted > 0 then
      perform *
      from public.upsert_user_item(
        btrim(p_slack_user_id),
        'pokeball_c',
        'Pokebola (!c)',
        'Permite capturar um Pokémon sem cooldown',
        v_pokeball_c_granted,
        jsonb_build_object('kind', 'consumable', 'category', 'capture')
      );
    end if;
  end if;

  return query
  select
    v_granted_xp,
    v_previous_snapshot.level,
    v_previous_snapshot.total_xp,
    v_current_snapshot.level,
    v_current_snapshot.total_xp,
    v_current_snapshot.current_level_xp,
    v_current_snapshot.xp_to_next_level,
    v_current_snapshot.level > v_previous_snapshot.level,
    v_current_snapshot.level - v_previous_snapshot.level,
    coalesce(nullif(btrim(p_reason), ''), 'system'),
    v_gold_reward,
    v_pokeball_c_granted;
end;
$$;
