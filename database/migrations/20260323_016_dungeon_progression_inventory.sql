alter table public.users
  add column if not exists account_xp bigint not null default 0,
  add column if not exists account_level integer not null default 1;

alter table public.users
  drop constraint if exists users_account_level_min,
  add constraint users_account_level_min check (account_level >= 1);

alter table public.users
  drop constraint if exists users_account_xp_non_negative,
  add constraint users_account_xp_non_negative check (account_xp >= 0);

create table if not exists public.user_items (
  id bigserial primary key,
  slack_user_id text not null references public.users(slack_user_id) on delete cascade,
  item_key text not null,
  item_name text not null,
  description text,
  quantity bigint not null default 0,
  extra_data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default timezone('utc', now()),
  created_at timestamptz not null default timezone('utc', now()),
  constraint user_items_quantity_non_negative check (quantity >= 0),
  constraint user_items_unique_user_item unique (slack_user_id, item_key)
);

create index if not exists idx_user_items_user_positive_qty
  on public.user_items (slack_user_id, updated_at desc)
  where quantity > 0;

create table if not exists public.user_dungeon_daily_entries (
  id bigserial primary key,
  slack_user_id text not null references public.users(slack_user_id) on delete cascade,
  mode text not null,
  entry_date date not null default (timezone('utc', now()))::date,
  claimed_at timestamptz not null default timezone('utc', now()),
  metadata jsonb not null default '{}'::jsonb,
  constraint user_dungeon_daily_entries_mode_check check (mode in ('normal', 'hard')),
  constraint user_dungeon_daily_entries_unique unique (slack_user_id, mode, entry_date)
);

create index if not exists idx_user_dungeon_daily_entries_lookup
  on public.user_dungeon_daily_entries (slack_user_id, entry_date desc);

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
  slack_user_id text,
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

  insert into public.user_items (
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
    quantity = public.user_items.quantity + excluded.quantity,
    extra_data = coalesce(excluded.extra_data, public.user_items.extra_data),
    updated_at = timezone('utc', now());

  return query
  select ui.id, ui.slack_user_id, ui.item_key, ui.item_name, ui.description, ui.quantity, ui.extra_data, ui.updated_at
  from public.user_items ui
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
  slack_user_id text,
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
  from public.user_items
  where slack_user_id = p_slack_user_id
    and item_key = p_item_key
  for update;

  if not found then
    raise exception 'Item não encontrado na mochila';
  end if;

  if v_item.quantity < p_quantity then
    raise exception 'Quantidade insuficiente';
  end if;

  v_new_quantity := v_item.quantity - p_quantity;

  update public.user_items
  set quantity = v_new_quantity,
      updated_at = timezone('utc', now())
  where id = v_item.id;

  return query
  select ui.id, ui.slack_user_id, ui.item_key, ui.quantity, ui.updated_at
  from public.user_items ui
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
  slack_user_id text,
  mode text,
  entry_date date,
  claimed_at timestamptz
)
language plpgsql
security definer
as $$
declare
  v_today date := (timezone('utc', now()))::date;
begin
  insert into public.user_dungeon_daily_entries (slack_user_id, mode, entry_date, metadata)
  values (p_slack_user_id, p_mode, v_today, coalesce(p_metadata, '{}'::jsonb))
  on conflict (slack_user_id, mode, entry_date) do nothing;

  if not found then
    raise exception 'Daily dungeon já usada hoje';
  end if;

  return query
  select ude.id, ude.slack_user_id, ude.mode, ude.entry_date, ude.claimed_at
  from public.user_dungeon_daily_entries ude
  where ude.slack_user_id = p_slack_user_id
    and ude.mode = p_mode
    and ude.entry_date = v_today;
end;
$$;
