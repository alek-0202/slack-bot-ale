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
as $$
begin
  if coalesce(p_quantity, 0) <= 0 then
    raise exception 'Quantidade para adicionar deve ser positiva';
  end if;

  insert into public.user_items as ui (
    slack_user_id,
    item_key,
    item_name,
    description,
    quantity,
    extra_data,
    updated_at
  ) values (
    p_slack_user_id,
    p_item_key,
    p_item_name,
    p_description,
    p_quantity,
    coalesce(p_extra_data, '{}'::jsonb),
    timezone('utc', now())
  )
  on conflict (slack_user_id, item_key)
  do update set
    item_name = excluded.item_name,
    description = excluded.description,
    quantity = ui.quantity + excluded.quantity,
    extra_data = coalesce(excluded.extra_data, ui.extra_data),
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
  where ui.slack_user_id = p_slack_user_id
    and ui.item_key = p_item_key;
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
as $$
declare
  v_item public.user_items%rowtype;
  v_new_quantity bigint;
begin
  if coalesce(p_quantity, 0) <= 0 then
    raise exception 'Quantidade para remover deve ser positiva';
  end if;

  select * into v_item
  from public.user_items as ui
  where ui.slack_user_id = p_slack_user_id
    and ui.item_key = p_item_key
  for update;

  if not found then
    raise exception 'Item não encontrado na mochila';
  end if;

  if v_item.quantity < p_quantity then
    raise exception 'Quantidade insuficiente';
  end if;

  v_new_quantity := v_item.quantity - p_quantity;

  update public.user_items as ui
  set quantity = v_new_quantity,
      updated_at = timezone('utc', now())
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
