drop function if exists public.claim_daily_dungeon_entry(text, text, jsonb);
drop function if exists public.upsert_user_item(text, text, text, text, bigint, jsonb);
drop function if exists public.consume_user_item(text, text, bigint);

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
