drop function if exists public.claim_daily_dungeon_entry(text, text, jsonb);

create or replace function public.claim_daily_dungeon_entry(
  p_slack_user_id text,
  p_mode text,
  p_metadata jsonb default '{}'::jsonb
)
returns table (
  result_entry_id bigint,
  result_entry_slack_user_id text,
  result_entry_mode text,
  result_entry_date date,
  result_claimed_at timestamptz
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
  on conflict on constraint user_dungeon_daily_entries_unique do nothing;

  if not found then
    raise exception 'Daily dungeon já usada hoje';
  end if;

  return query
  select
    ude.id as result_entry_id,
    ude.slack_user_id as result_entry_slack_user_id,
    ude.mode as result_entry_mode,
    ude.entry_date as result_entry_date,
    ude.claimed_at as result_claimed_at
  from public.user_dungeon_daily_entries as ude
  where ude.slack_user_id = v_slack_user_id
    and ude.mode = v_mode
    and ude.entry_date = v_today;
end;
$$;
