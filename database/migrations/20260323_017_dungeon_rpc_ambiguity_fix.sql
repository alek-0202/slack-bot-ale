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
as $$
declare
  v_today date := (timezone('utc', now()))::date;
begin
  insert into public.user_dungeon_daily_entries as ude (
    slack_user_id,
    mode,
    entry_date,
    metadata
  )
  values (
    p_slack_user_id,
    p_mode,
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
  where ude.slack_user_id = p_slack_user_id
    and ude.mode = p_mode
    and ude.entry_date = v_today;
end;
$$;
