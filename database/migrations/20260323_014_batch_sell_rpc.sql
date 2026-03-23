create or replace function public.sell_user_pokemons_batch(
  p_slack_user_id text,
  p_pokemon_ids bigint[],
  p_expected_sale_price bigint default null
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
  v_pokemon record;
  v_requested_ids bigint[];
  v_locked_ids bigint[] := '{}'::bigint[];
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

  for v_pokemon in
    select up.id, up.level, coalesce(up.upgrade_spent_gold, 0) as upgrade_spent_gold, ps.rarity
    from public.user_pokemons up
    join public.pokemon_species ps on ps.id = up.species_id
    where up.slack_user_id = p_slack_user_id
      and up.id = any(v_requested_ids)
    for update of up
  loop
    v_locked_ids := array_append(v_locked_ids, v_pokemon.id);
    v_sale_price := v_sale_price + public.calculate_pokemon_sell_price(
      v_pokemon.rarity,
      v_pokemon.level,
      v_pokemon.upgrade_spent_gold
    );
  end loop;

  v_found_count := coalesce(array_length(v_locked_ids, 1), 0);

  if v_found_count <> array_length(v_requested_ids, 1) then
    return query select false, 'pokemon_not_owned', null::bigint, null::bigint, 0, 0;
    return;
  end if;

  select count(*)
    into v_locked_count
  from public.trade_items ti
  join public.trades t on t.id = ti.trade_id
  where ti.user_pokemon_id = any(v_locked_ids)
    and t.status = 'pending';

  if v_locked_count > 0 then
    return query select false, 'pokemon_locked_in_trade', null::bigint, null::bigint, 0, 0;
    return;
  end if;

  if p_expected_sale_price is not null and v_sale_price <> p_expected_sale_price then
    return query select false, 'sale_price_changed', v_sale_price, null::bigint, 0, 0;
    return;
  end if;

  delete from public.trade_items where user_pokemon_id = any(v_locked_ids);
  get diagnostics v_trade_items = row_count;

  delete from public.market_purchases where user_pokemon_id = any(v_locked_ids);
  get diagnostics v_market_purchases = row_count;

  delete from public.user_pokemons
  where slack_user_id = p_slack_user_id
    and id = any(v_locked_ids);

  update public.users
  set gold = gold + v_sale_price
  where slack_user_id = p_slack_user_id
  returning gold into remaining_gold;

  insert into public.transactions (slack_user_id, type, amount)
  values (p_slack_user_id, 'pokemon_sell', v_sale_price);

  return query select true, null::text, v_sale_price, remaining_gold, v_trade_items, v_market_purchases;
end;
$$;
