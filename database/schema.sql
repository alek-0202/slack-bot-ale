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
  rarity text not null check (rarity in ('common', 'uncommon', 'rare', 'epic', 'legendary', 'mythical')),
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

alter table public.user_pokemons add column if not exists attack integer not null default 10;
alter table public.user_pokemons add column if not exists defense integer not null default 10;
alter table public.user_pokemons add column if not exists hp integer not null default 10;
alter table public.user_pokemons add column if not exists speed integer not null default 10;
alter table public.user_pokemons add column if not exists source text not null default 'capture';
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'user_pokemons_level_cap'
      and conrelid = 'public.user_pokemons'::regclass
  ) then
    alter table public.user_pokemons
      add constraint user_pokemons_level_cap check (level >= 1 and level <= 50);
  end if;
end $$;

create table if not exists public.transactions (
  id bigint generated always as identity primary key,
  slack_user_id text not null references public.users(slack_user_id) on delete cascade,
  type text not null,
  amount integer not null,
  created_at timestamptz not null default now()
);

create table if not exists public.daily_market (
  market_date date not null,
  slot integer not null check (slot between 1 and 3),
  species_id integer not null references public.pokemon_species(id),
  price integer not null check (price >= 0),
  created_at timestamptz not null default now(),
  primary key (market_date, slot)
);

create table if not exists public.market_purchases (
  id bigint generated always as identity primary key,
  market_date date not null,
  slot integer not null,
  slack_user_id text not null references public.users(slack_user_id) on delete cascade,
  user_pokemon_id bigint not null references public.user_pokemons(id) on delete restrict,
  price_paid integer not null check (price_paid >= 0),
  purchased_at timestamptz not null default now(),
  unique (market_date, slot, slack_user_id),
  foreign key (market_date, slot) references public.daily_market(market_date, slot)
);

create table if not exists public.medals (
  id bigint generated always as identity primary key,
  code text not null unique,
  name text not null,
  nature_element text not null,
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.user_medals (
  id bigint generated always as identity primary key,
  slack_user_id text not null references public.users(slack_user_id) on delete cascade,
  medal_id bigint not null references public.medals(id) on delete cascade,
  status text not null default 'locked' check (status in ('locked', 'unlocked')),
  progress integer not null default 0,
  unlocked_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (slack_user_id, medal_id)
);

insert into public.medals (code, name, nature_element, description)
values
  ('flame_heart', 'Coração de Chama', 'fire', 'Concede afinidade com progresso ofensivo e combates agressivos.'),
  ('tidal_guard', 'Guarda das Marés', 'water', 'Concede afinidade com consistência e resistência defensiva.'),
  ('terra_root', 'Raiz da Terra', 'earth', 'Concede afinidade com evolução sustentável de coleção.'),
  ('sky_echo', 'Eco dos Ventos', 'air', 'Concede afinidade com velocidade e ações estratégicas.'),
  ('storm_focus', 'Foco da Tempestade', 'storm', 'Concede afinidade com marcos raros e jogadas de alto impacto.')
on conflict (code) do nothing;

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

create index if not exists idx_daily_market_date on public.daily_market(market_date);
create index if not exists idx_market_purchases_user_date on public.market_purchases(slack_user_id, market_date);
create index if not exists idx_user_medals_user on public.user_medals(slack_user_id);

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

drop trigger if exists trg_user_medals_set_updated_at on public.user_medals;
create trigger trg_user_medals_set_updated_at
before update on public.user_medals
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


create or replace function public.upgrade_user_pokemon(
  p_slack_user_id text,
  p_pokemon_id bigint
)
returns table (
  ok boolean,
  reason text,
  previous_level integer,
  new_level integer,
  cost integer,
  remaining_gold integer
)
language plpgsql
as $$
declare
  v_user_gold integer;
  v_level integer;
  v_attack integer;
  v_defense integer;
  v_hp integer;
  v_speed integer;
  v_multiplier numeric;
  v_cost integer;
  v_new_level integer;
begin
  select up.level, up.attack, up.defense, up.hp, up.speed
    into v_level, v_attack, v_defense, v_hp, v_speed
  from public.user_pokemons up
  where up.id = p_pokemon_id
    and up.slack_user_id = p_slack_user_id
  for update;

  if not found then
    return query select false, 'pokemon_not_owned', null::integer, null::integer, null::integer, null::integer;
    return;
  end if;

  if v_level >= 50 then
    return query select false, 'max_level', v_level, v_level, 0, null::integer;
    return;
  end if;

  select u.gold into v_user_gold
  from public.users u
  where u.slack_user_id = p_slack_user_id
  for update;

  if not found then
    return query select false, 'user_not_started', null::integer, null::integer, null::integer, null::integer;
    return;
  end if;

  if v_level >= 10 then
    v_multiplier := 1.5;
  else
    v_multiplier := 1 + least(v_level * 0.05, 0.5);
  end if;

  v_cost := ceil(100 * power(v_multiplier, greatest(v_level - 1, 0)));

  if v_user_gold < v_cost then
    return query select false, 'insufficient_gold', v_level, v_level, v_cost, v_user_gold;
    return;
  end if;

  v_new_level := v_level + 1;

  update public.user_pokemons
  set level = v_new_level,
      attack = ceil(v_attack * 1.02),
      defense = ceil(v_defense * 1.02),
      hp = ceil(v_hp * 1.02),
      speed = ceil(v_speed * 1.02)
  where id = p_pokemon_id
    and slack_user_id = p_slack_user_id;

  update public.users
  set gold = gold - v_cost
  where slack_user_id = p_slack_user_id
  returning gold into remaining_gold;

  insert into public.transactions (slack_user_id, type, amount)
  values (p_slack_user_id, 'pokemon_upgrade', -v_cost);

  return query select true, null::text, v_level, v_new_level, v_cost, remaining_gold;
end;
$$;

create or replace function public.market_buy_slot(
  p_slack_user_id text,
  p_market_date date,
  p_slot integer
)
returns table (
  ok boolean,
  reason text,
  species_id integer,
  price integer,
  remaining_gold integer,
  user_pokemon_id bigint
)
language plpgsql
as $$
declare
  v_user_gold integer;
  v_species_id integer;
  v_rarity text;
  v_price integer;
  v_rarity_bonus integer;
  v_stat_floor integer;
  v_stat_ceil integer;
begin
  select u.gold into v_user_gold
  from public.users u
  where u.slack_user_id = p_slack_user_id
  for update;

  if not found then
    return query select false, 'user_not_started', null::integer, null::integer, null::integer, null::bigint;
    return;
  end if;

  if exists (
    select 1
    from public.market_purchases mp
    where mp.market_date = p_market_date
      and mp.slot = p_slot
      and mp.slack_user_id = p_slack_user_id
  ) then
    return query select false, 'already_bought_slot', null::integer, null::integer, v_user_gold, null::bigint;
    return;
  end if;

  select dm.species_id, dm.price, ps.rarity
    into v_species_id, v_price, v_rarity
  from public.daily_market dm
  join public.pokemon_species ps on ps.id = dm.species_id
  where dm.market_date = p_market_date
    and dm.slot = p_slot;

  if not found then
    return query select false, 'invalid_slot', null::integer, null::integer, v_user_gold, null::bigint;
    return;
  end if;

  if v_user_gold < v_price then
    return query select false, 'insufficient_gold', v_species_id, v_price, v_user_gold, null::bigint;
    return;
  end if;

  v_rarity_bonus := case v_rarity
    when 'uncommon' then 1
    when 'rare' then 2
    when 'epic' then 3
    when 'legendary' then 4
    when 'mythical' then 5
    else 0
  end;

  v_stat_floor := 8 + v_rarity_bonus;
  v_stat_ceil := 15 + v_rarity_bonus;

  insert into public.user_pokemons (
    slack_user_id,
    species_id,
    level,
    shiny,
    attack,
    defense,
    hp,
    speed,
    source
  )
  values (
    p_slack_user_id,
    v_species_id,
    1,
    false,
    floor(random() * (v_stat_ceil - v_stat_floor + 1) + v_stat_floor)::integer,
    floor(random() * (v_stat_ceil - v_stat_floor + 1) + v_stat_floor)::integer,
    floor(random() * ((v_stat_ceil + 4) - (v_stat_floor + 2) + 1) + (v_stat_floor + 2))::integer,
    floor(random() * (v_stat_ceil - v_stat_floor + 1) + v_stat_floor)::integer,
    'market'
  )
  returning id into user_pokemon_id;

  update public.users
  set gold = gold - v_price
  where slack_user_id = p_slack_user_id
  returning gold into remaining_gold;

  insert into public.transactions (slack_user_id, type, amount)
  values (p_slack_user_id, 'market_purchase', -v_price);

  begin
    insert into public.market_purchases (
      market_date,
      slot,
      slack_user_id,
      user_pokemon_id,
      price_paid
    )
    values (
      p_market_date,
      p_slot,
      p_slack_user_id,
      user_pokemon_id,
      v_price
    );
  exception
    when unique_violation then
      raise exception 'already_bought_slot';
  end;

  return query select true, null::text, v_species_id, v_price, remaining_gold, user_pokemon_id;
exception
  when others then
    if sqlerrm like '%already_bought_slot%' then
      return query select false, 'already_bought_slot', null::integer, null::integer, v_user_gold, null::bigint;
      return;
    end if;
    raise;
end;
$$;
