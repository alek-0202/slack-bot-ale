create table if not exists public.users (
  slack_user_id text primary key,
  gold integer not null default 100,
  created_at timestamptz not null default now(),
  last_capture_at timestamptz,
  last_claim_at timestamptz
);

create table if not exists public.pokemon_species (
  id integer primary key,
  name text not null unique,
  generation integer,
  sprite_url text,
  rarity text not null check (rarity in ('common', 'uncommon', 'rare', 'epic', 'legendary')),
  evolution_stage integer not null default 1,
  evolves_from integer references public.pokemon_species(id) on update cascade on delete set null,
  evolves_to integer references public.pokemon_species(id) on update cascade on delete set null,
  base_value integer not null default 10,
  created_at timestamptz not null default now()
);

create table if not exists public.user_pokemons (
  id bigint generated always as identity primary key,
  slack_user_id text not null references public.users(slack_user_id) on delete cascade,
  species_id integer not null references public.pokemon_species(id),
  level integer not null default 1,
  shiny boolean not null default false,
  captured_at timestamptz not null default now()
);

create table if not exists public.transactions (
  id bigint generated always as identity primary key,
  slack_user_id text not null references public.users(slack_user_id) on delete cascade,
  type text not null,
  amount integer not null,
  created_at timestamptz not null default now()
);

create table if not exists public.trades (
  id bigint generated always as identity primary key,
  channel_id text not null,
  initiator_user_id text not null references public.users(slack_user_id) on delete cascade,
  target_user_id text not null references public.users(slack_user_id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined', 'cancelled')),
  initiator_gold_offer integer not null default 0 check (initiator_gold_offer >= 0),
  target_gold_offer integer not null default 0 check (target_gold_offer >= 0),
  accepted_at timestamptz,
  declined_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (initiator_user_id <> target_user_id)
);

create table if not exists public.trade_items (
  id bigint generated always as identity primary key,
  trade_id bigint not null references public.trades(id) on delete cascade,
  owner_user_id text not null references public.users(slack_user_id) on delete cascade,
  user_pokemon_id bigint not null references public.user_pokemons(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (trade_id, user_pokemon_id)
);

create index if not exists idx_trades_channel_status on public.trades(channel_id, status);
create index if not exists idx_trades_participants_status on public.trades(initiator_user_id, target_user_id, status);
create index if not exists idx_trade_items_trade on public.trade_items(trade_id);
create index if not exists idx_trade_items_pokemon on public.trade_items(user_pokemon_id);

create index if not exists idx_user_pokemons_user on public.user_pokemons(slack_user_id);
create index if not exists idx_user_pokemons_species on public.user_pokemons(species_id);
create index if not exists idx_transactions_user on public.transactions(slack_user_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_trades_set_updated_at on public.trades;
create trigger trg_trades_set_updated_at
before update on public.trades
for each row execute function public.set_updated_at();

create or replace function public.create_trade(
  p_channel_id text,
  p_initiator_user_id text,
  p_target_user_id text
)
returns public.trades
language plpgsql
as $$
declare
  v_trade public.trades;
begin
  if p_initiator_user_id = p_target_user_id then
    raise exception 'Você não pode iniciar trade consigo mesmo';
  end if;

  if exists (
    select 1
    from public.trades t
    where t.channel_id = p_channel_id
      and t.status = 'pending'
      and (
        t.initiator_user_id in (p_initiator_user_id, p_target_user_id)
        or t.target_user_id in (p_initiator_user_id, p_target_user_id)
      )
  ) then
    raise exception 'Já existe um trade pendente neste canal envolvendo um dos usuários';
  end if;

  insert into public.trades (channel_id, initiator_user_id, target_user_id)
  values (p_channel_id, p_initiator_user_id, p_target_user_id)
  returning * into v_trade;

  return v_trade;
end;
$$;

create or replace function public.accept_trade(
  p_trade_id bigint,
  p_accepting_user_id text
)
returns public.trades
language plpgsql
as $$
declare
  v_trade public.trades;
  v_initiator_gold integer;
  v_target_gold integer;
begin
  select *
    into v_trade
  from public.trades
  where id = p_trade_id
  for update;

  if not found then
    raise exception 'Trade não encontrado';
  end if;

  if v_trade.status <> 'pending' then
    raise exception 'Este trade não está mais pendente';
  end if;

  if v_trade.target_user_id <> p_accepting_user_id then
    raise exception 'Apenas o usuário alvo pode aceitar este trade';
  end if;

  select gold into v_initiator_gold
  from public.users
  where slack_user_id = v_trade.initiator_user_id
  for update;

  select gold into v_target_gold
  from public.users
  where slack_user_id = v_trade.target_user_id
  for update;

  if v_initiator_gold < v_trade.initiator_gold_offer then
    raise exception 'Saldo insuficiente para o iniciador';
  end if;

  if v_target_gold < v_trade.target_gold_offer then
    raise exception 'Saldo insuficiente para o alvo';
  end if;

  perform 1
  from public.trade_items ti
  join public.user_pokemons up on up.id = ti.user_pokemon_id
  where ti.trade_id = v_trade.id
    and up.slack_user_id <> ti.owner_user_id
  for update of up;

  if found then
    raise exception 'Um ou mais Pokémons não pertencem mais ao dono original da oferta';
  end if;

  update public.user_pokemons up
  set slack_user_id = case
      when ti.owner_user_id = v_trade.initiator_user_id then v_trade.target_user_id
      else v_trade.initiator_user_id
    end
  from public.trade_items ti
  where ti.trade_id = v_trade.id
    and ti.user_pokemon_id = up.id;

  update public.users
  set gold = gold - v_trade.initiator_gold_offer + v_trade.target_gold_offer
  where slack_user_id = v_trade.initiator_user_id;

  update public.users
  set gold = gold - v_trade.target_gold_offer + v_trade.initiator_gold_offer
  where slack_user_id = v_trade.target_user_id;

  if v_trade.initiator_gold_offer > 0 then
    insert into public.transactions (slack_user_id, type, amount)
    values
      (v_trade.initiator_user_id, 'trade_gold_sent', -v_trade.initiator_gold_offer),
      (v_trade.target_user_id, 'trade_gold_received', v_trade.initiator_gold_offer);
  end if;

  if v_trade.target_gold_offer > 0 then
    insert into public.transactions (slack_user_id, type, amount)
    values
      (v_trade.target_user_id, 'trade_gold_sent', -v_trade.target_gold_offer),
      (v_trade.initiator_user_id, 'trade_gold_received', v_trade.target_gold_offer);
  end if;

  update public.trades
  set status = 'accepted',
      accepted_at = now()
  where id = v_trade.id
  returning * into v_trade;

  return v_trade;
end;
$$;
