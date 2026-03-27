-- Add pokemon battle availability/favorite flags and PvP progression/economy support.

alter table public.user_pokemons
  add column if not exists is_battle_available boolean not null default true,
  add column if not exists is_favorite boolean not null default false;

create index if not exists idx_user_pokemons_user_favorite
  on public.user_pokemons(slack_user_id, is_favorite desc, captured_at desc, id desc);

alter table public.users
  add column if not exists pvp_wins integer not null default 0;

create or replace function public.start_pvp_wager(
  p_challenger_id text,
  p_challenged_id text,
  p_entry_fee bigint default 2000
)
returns table (
  ok boolean,
  reason text,
  challenger_remaining_gold bigint,
  challenged_remaining_gold bigint
)
language plpgsql
as $$
declare
  v_fee bigint := greatest(coalesce(p_entry_fee, 0), 0);
  v_challenger_gold bigint;
  v_challenged_gold bigint;
begin
  if coalesce(p_challenger_id, '') = '' or coalesce(p_challenged_id, '') = '' or p_challenger_id = p_challenged_id then
    return query select false, 'invalid_players', null::bigint, null::bigint;
    return;
  end if;

  insert into public.users (slack_user_id)
  values (p_challenger_id), (p_challenged_id)
  on conflict (slack_user_id) do nothing;

  select gold into v_challenger_gold
  from public.users
  where slack_user_id = p_challenger_id
  for update;

  select gold into v_challenged_gold
  from public.users
  where slack_user_id = p_challenged_id
  for update;

  if coalesce(v_challenger_gold, 0) < v_fee then
    return query select false, 'challenger_insufficient_gold', v_challenger_gold, v_challenged_gold;
    return;
  end if;

  if coalesce(v_challenged_gold, 0) < v_fee then
    return query select false, 'challenged_insufficient_gold', v_challenger_gold, v_challenged_gold;
    return;
  end if;

  update public.users set gold = gold - v_fee where slack_user_id = p_challenger_id returning gold into v_challenger_gold;
  update public.users set gold = gold - v_fee where slack_user_id = p_challenged_id returning gold into v_challenged_gold;

  insert into public.transactions (slack_user_id, type, amount)
  values
    (p_challenger_id, 'pvp_entry_fee', -v_fee),
    (p_challenged_id, 'pvp_entry_fee', -v_fee);

  return query select true, null::text, v_challenger_gold, v_challenged_gold;
end;
$$;

create or replace function public.finish_pvp_wager(
  p_winner_id text,
  p_loser_id text,
  p_prize bigint default 4000
)
returns table (
  ok boolean,
  reason text,
  winner_gold bigint,
  winner_pvp_wins integer
)
language plpgsql
as $$
declare
  v_prize bigint := greatest(coalesce(p_prize, 0), 0);
  v_winner_gold bigint;
  v_wins integer;
begin
  if coalesce(p_winner_id, '') = '' or coalesce(p_loser_id, '') = '' or p_winner_id = p_loser_id then
    return query select false, 'invalid_players', null::bigint, null::integer;
    return;
  end if;

  insert into public.users (slack_user_id)
  values (p_winner_id), (p_loser_id)
  on conflict (slack_user_id) do nothing;

  update public.users
  set gold = gold + v_prize,
      pvp_wins = coalesce(pvp_wins, 0) + 1
  where slack_user_id = p_winner_id
  returning gold, pvp_wins into v_winner_gold, v_wins;

  insert into public.transactions (slack_user_id, type, amount)
  values (p_winner_id, 'pvp_prize', v_prize);

  return query select true, null::text, v_winner_gold, v_wins;
end;
$$;
