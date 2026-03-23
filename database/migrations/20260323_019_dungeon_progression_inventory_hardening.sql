alter table public.user_items
  drop constraint if exists user_items_item_key_not_blank,
  add constraint user_items_item_key_not_blank check (btrim(item_key) <> '');

alter table public.user_items
  drop constraint if exists user_items_item_name_not_blank,
  add constraint user_items_item_name_not_blank check (btrim(item_name) <> '');

update public.user_dungeon_daily_entries
set mode = lower(btrim(mode))
where mode <> lower(btrim(mode));

alter table public.user_dungeon_daily_entries
  drop constraint if exists user_dungeon_daily_entries_mode_check,
  add constraint user_dungeon_daily_entries_mode_check check (mode in ('normal', 'hard'));

create or replace function public.get_account_level_snapshot(
  p_total_xp bigint
)
returns table (
  level integer,
  total_xp bigint,
  current_level_xp bigint,
  xp_to_next_level bigint
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_remaining_xp bigint := greatest(coalesce(p_total_xp, 0), 0);
  v_level integer := 1;
  v_required_xp bigint := 100;
begin
  while v_remaining_xp >= v_required_xp loop
    v_remaining_xp := v_remaining_xp - v_required_xp;
    v_level := v_level + 1;
    v_required_xp := 100 + ((v_level - 1) * 50);
  end loop;

  return query
  select
    v_level,
    greatest(coalesce(p_total_xp, 0), 0),
    v_remaining_xp,
    v_required_xp;
end;
$$;

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
  reason text
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
    coalesce(nullif(btrim(p_reason), ''), 'system');
end;
$$;

create or replace function public.apply_gold_transaction(
  p_slack_user_id text,
  p_amount bigint,
  p_transaction_type text
)
returns table (
  slack_user_id text,
  current_gold bigint,
  transaction_amount bigint,
  transaction_type text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_slack_user_id text := btrim(p_slack_user_id);
  v_transaction_type text := btrim(p_transaction_type);
  v_user public.users%rowtype;
begin
  if v_slack_user_id = '' then
    raise exception 'slack_user_id é obrigatório';
  end if;

  if v_transaction_type = '' then
    raise exception 'transaction_type é obrigatório';
  end if;

  insert into public.users as u (slack_user_id)
  values (v_slack_user_id)
  on conflict (slack_user_id) do nothing;

  select u.*
  into v_user
  from public.users as u
  where u.slack_user_id = v_slack_user_id
  for update;

  if (v_user.gold + p_amount) < 0 then
    raise exception 'Saldo de gold não pode ficar negativo';
  end if;

  update public.users as u
  set gold = u.gold + p_amount
  where u.slack_user_id = v_slack_user_id;

  insert into public.transactions as t (
    slack_user_id,
    type,
    amount
  )
  values (
    v_slack_user_id,
    v_transaction_type,
    p_amount
  );

  return query
  select
    u.slack_user_id,
    u.gold,
    p_amount,
    v_transaction_type
  from public.users as u
  where u.slack_user_id = v_slack_user_id;
end;
$$;

create or replace function public.upsert_user_item(
  p_slack_user_id text,
  p_item_key text,
  p_item_name text,
  p_description text,
  p_quantity bigint,
  p_extra_data jsonb default '{}'::jsonb
)
returns table (
  item_id bigint,
  item_slack_user_id text,
  item_key text,
  item_name text,
  description text,
  quantity bigint,
  extra_data jsonb,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_slack_user_id text := btrim(p_slack_user_id);
  v_item_key text := lower(btrim(p_item_key));
  v_item_name text := btrim(p_item_name);
begin
  if v_slack_user_id = '' then
    raise exception 'slack_user_id é obrigatório';
  end if;

  if v_item_key = '' then
    raise exception 'item_key é obrigatório';
  end if;

  if v_item_name = '' then
    raise exception 'item_name é obrigatório';
  end if;

  if coalesce(p_quantity, 0) <= 0 then
    raise exception 'Quantidade para adicionar deve ser positiva';
  end if;

  insert into public.users as u (slack_user_id)
  values (v_slack_user_id)
  on conflict (slack_user_id) do nothing;

  insert into public.user_items as ui (
    slack_user_id,
    item_key,
    item_name,
    description,
    quantity,
    extra_data,
    updated_at
  )
  values (
    v_slack_user_id,
    v_item_key,
    v_item_name,
    nullif(btrim(p_description), ''),
    p_quantity,
    coalesce(p_extra_data, '{}'::jsonb),
    timezone('utc', now())
  )
  on conflict (slack_user_id, item_key)
  do update
  set item_name = excluded.item_name,
      description = excluded.description,
      quantity = ui.quantity + excluded.quantity,
      extra_data = case
        when excluded.extra_data = '{}'::jsonb then ui.extra_data
        else excluded.extra_data
      end,
      updated_at = timezone('utc', now());

  return query
  select
    ui.id as item_id,
    ui.slack_user_id as item_slack_user_id,
    ui.item_key,
    ui.item_name,
    ui.description,
    ui.quantity,
    ui.extra_data,
    ui.updated_at
  from public.user_items as ui
  where ui.slack_user_id = v_slack_user_id
    and ui.item_key = v_item_key;
end;
$$;

create or replace function public.consume_user_item(
  p_slack_user_id text,
  p_item_key text,
  p_quantity bigint
)
returns table (
  item_id bigint,
  item_slack_user_id text,
  item_key text,
  quantity bigint,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_slack_user_id text := btrim(p_slack_user_id);
  v_item_key text := lower(btrim(p_item_key));
  v_item public.user_items%rowtype;
  v_now timestamptz := timezone('utc', now());
begin
  if v_slack_user_id = '' then
    raise exception 'slack_user_id é obrigatório';
  end if;

  if v_item_key = '' then
    raise exception 'item_key é obrigatório';
  end if;

  if coalesce(p_quantity, 0) <= 0 then
    raise exception 'Quantidade para remover deve ser positiva';
  end if;

  select ui.*
  into v_item
  from public.user_items as ui
  where ui.slack_user_id = v_slack_user_id
    and ui.item_key = v_item_key
  for update;

  if not found then
    raise exception 'Item não encontrado na mochila';
  end if;

  if v_item.quantity < p_quantity then
    raise exception 'Quantidade insuficiente';
  end if;

  update public.user_items as ui
  set quantity = ui.quantity - p_quantity,
      updated_at = v_now
  where ui.id = v_item.id;

  return query
  select
    ui.id as item_id,
    ui.slack_user_id as item_slack_user_id,
    ui.item_key,
    ui.quantity,
    ui.updated_at
  from public.user_items as ui
  where ui.id = v_item.id;
end;
$$;

create or replace function public.claim_daily_dungeon_entry(
  p_slack_user_id text,
  p_mode text,
  p_metadata jsonb default '{}'::jsonb
)
returns table (
  entry_id bigint,
  entry_slack_user_id text,
  entry_mode text,
  entry_date date,
  claimed_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_slack_user_id text := btrim(p_slack_user_id);
  v_mode text := lower(btrim(p_mode));
  v_today date := (timezone('utc', now()))::date;
begin
  if v_slack_user_id = '' then
    raise exception 'slack_user_id é obrigatório';
  end if;

  if v_mode not in ('normal', 'hard') then
    raise exception 'Modo de daily dungeon inválido';
  end if;

  insert into public.users as u (slack_user_id)
  values (v_slack_user_id)
  on conflict (slack_user_id) do nothing;

  insert into public.user_dungeon_daily_entries as ude (
    slack_user_id,
    mode,
    entry_date,
    metadata
  )
  values (
    v_slack_user_id,
    v_mode,
    v_today,
    coalesce(p_metadata, '{}'::jsonb)
  )
  on conflict (slack_user_id, mode, entry_date) do nothing;

  if not found then
    raise exception 'Daily dungeon já usada hoje';
  end if;

  return query
  select
    ude.id as entry_id,
    ude.slack_user_id as entry_slack_user_id,
    ude.mode as entry_mode,
    ude.entry_date,
    ude.claimed_at
  from public.user_dungeon_daily_entries as ude
  where ude.slack_user_id = v_slack_user_id
    and ude.mode = v_mode
    and ude.entry_date = v_today;
end;
$$;
