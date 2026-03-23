drop function if exists public.apply_gold_transaction(text, bigint, text);

create or replace function public.apply_gold_transaction(
  p_slack_user_id text,
  p_amount bigint,
  p_transaction_type text
)
returns table (
  result_slack_user_id text,
  current_gold bigint,
  transaction_amount bigint,
  result_transaction_type text
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
    u.slack_user_id as result_slack_user_id,
    u.gold as current_gold,
    p_amount as transaction_amount,
    v_transaction_type as result_transaction_type
  from public.users as u
  where u.slack_user_id = v_slack_user_id;
end;
$$;
