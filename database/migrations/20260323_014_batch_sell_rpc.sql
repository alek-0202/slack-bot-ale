create or replace function public.sell_user_pokemons_batch(
  p_slack_user_id text,
  p_pokemon_ids bigint[]
)
returns table (
  ok boolean,
  reason text,
  sale_price bigint,
  remaining_gold bigint,
  deleted_trade_items integer,
  deleted_market_purchases integer
)
language plpgsql
as $$
declare
  v_requested_ids bigint[];
  v_found_count integer;
  v_locked_count integer;
  v_sale_price bigint := 0;
  v_trade_items integer := 0;
  v_market_purchases integer := 0;
begin
  select coalesce(array_agg(distinct id), '{}'::bigint[])
    into v_requested_ids
  from unnest(coalesce(p_pokemon_ids, '{}'::bigint[])) id
  where id is not null and id > 0;

  if coalesce(array_length(v_requested_ids, 1), 0) = 0 then
    return query select false, 'invalid_pokemon_ids', null::bigint, null::bigint, 0, 0;
    return;
  end if;

  select count(*)
    into v_found_count
  from public.user_pokemons up
  where up.slack_user_id = p_slack_user_id
    and up.id = any(v_requested_ids)
  for update;

  if v_found_count <> array_length(v_requested_ids, 1) then
    return query select false, 'pokemon_not_owned', null::bigint, null::bigint, 0, 0;
    return;
  end if;

  select count(*)
    into v_locked_count
  from public.trade_items ti
  join public.trades t on t.id = ti.trade_id
  where ti.user_pokemon_id = any(v_requested_ids)
    and t.status = 'pending';

  if v_locked_count > 0 then
    return query select false, 'pokemon_locked_in_trade', null::bigint, null::bigint, 0, 0;
    return;
  end if;

  select coalesce(sum(public.calculate_pokemon_sell_price(ps.rarity, up.level, coalesce(up.upgrade_spent_gold, 0))), 0)
    into v_sale_price
  from public.user_pokemons up
  join public.pokemon_species ps on ps.id = up.species_id
  where up.slack_user_id = p_slack_user_id
    and up.id = any(v_requested_ids);

  delete from public.trade_items where user_pokemon_id = any(v_requested_ids);
  get diagnostics v_trade_items = row_count;

  delete from public.market_purchases where user_pokemon_id = any(v_requested_ids);
  get diagnostics v_market_purchases = row_count;

  delete from public.user_pokemons
  where slack_user_id = p_slack_user_id
    and id = any(v_requested_ids);

  update public.users
  set gold = gold + v_sale_price
  where slack_user_id = p_slack_user_id
  returning gold into remaining_gold;

  insert into public.transactions (slack_user_id, type, amount)
  values (p_slack_user_id, 'pokemon_sell', v_sale_price);

  return query select true, null::text, v_sale_price, remaining_gold, v_trade_items, v_market_purchases;
end;
$$;
