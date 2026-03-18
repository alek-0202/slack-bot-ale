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
  element_types text[] not null default '{}'::text[],
  base_attack integer not null default 10,
  base_defense integer not null default 10,
  base_hp integer not null default 12,
  base_speed integer not null default 10,
  created_at timestamptz not null default now()
);

create table if not exists public.user_pokemons (
  id bigint generated always as identity primary key,
  slack_user_id text not null,
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
  slack_user_id text not null,
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


create table if not exists public.market_change_requests (
  id bigint generated always as identity primary key,
  market_date date not null,
  channel_id text not null,
  platform text not null,
  initiated_by text not null,
  required_confirmations integer not null default 3 check (required_confirmations >= 1),
  confirmation_count integer not null default 0 check (confirmation_count >= 0),
  status text not null default 'pending' check (status in ('pending', 'completed', 'cancelled')),
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.market_change_confirmations (
  id bigint generated always as identity primary key,
  request_id bigint not null references public.market_change_requests(id) on delete cascade,
  user_id text not null,
  created_at timestamptz not null default now(),
  unique (request_id, user_id)
);

create table if not exists public.market_purchases (
  id bigint generated always as identity primary key,
  market_date date not null,
  slot integer not null,
  slack_user_id text not null,
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
  slack_user_id text not null,
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
  initiator_user_id text not null,
  target_user_id text not null,
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
  owner_user_id text not null,
  user_pokemon_id bigint not null references public.user_pokemons(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (trade_id, user_pokemon_id)
);

create index if not exists idx_daily_market_date on public.daily_market(market_date);
create unique index if not exists idx_market_change_requests_daily_channel_unique_pending on public.market_change_requests (market_date, channel_id) where status in ('pending', 'completed');
create index if not exists idx_market_change_confirmations_request on public.market_change_confirmations(request_id);
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


create or replace function public.calculate_upgrade_total_cost(p_current_level integer, p_target_level integer)
returns bigint
language plpgsql
immutable
as $$
declare
  v_current integer := greatest(coalesce(p_current_level, 1), 1);
  v_target integer := greatest(coalesce(p_target_level, v_current), v_current);
  v_total bigint := 0;
  i integer;
begin
  for i in v_current..(v_target - 1) loop
    v_total := v_total + public.calculate_upgrade_cost(i);
  end loop;

  return v_total;
end;
$$;

create or replace function public.evolve_user_pokemon(
  p_slack_user_id text,
  p_pokemon_id bigint
)
returns table (
  ok boolean,
  reason text,
  previous_species_id integer,
  new_species_id integer,
  previous_species_name text,
  new_species_name text,
  cost bigint,
  remaining_gold bigint
)
language plpgsql
as $$
declare
  v_user_gold bigint;
  v_level integer;
  v_current_species_id integer;
  v_next_species_id integer;
  v_current_species_name text;
  v_next_species_name text;
  v_rarity text;
  v_current_evolution_stage integer;
  v_next_base_attack integer;
  v_next_base_defense integer;
  v_next_base_hp integer;
  v_next_base_speed integer;
  v_cost bigint;
begin
  select up.level,
         current_species.id,
         current_species.name,
         current_species.rarity,
         current_species.evolution_stage,
         current_species.evolves_to
    into v_level,
         v_current_species_id,
         v_current_species_name,
         v_rarity,
         v_current_evolution_stage,
         v_next_species_id
  from public.user_pokemons up
  join public.pokemon_species current_species on current_species.id = up.species_id
  where up.id = p_pokemon_id
    and up.slack_user_id = p_slack_user_id
  for update of up, current_species;

  if not found then
    return query select false, 'pokemon_not_owned', null::integer, null::integer, null::text, null::text, null::bigint, null::bigint;
    return;
  end if;

  if v_next_species_id is null then
    return query select false, 'no_evolution_available', v_current_species_id, null::integer, v_current_species_name, null::text, 0::bigint, null::bigint;
    return;
  end if;

  select ps.name, ps.base_attack, ps.base_defense, ps.base_hp, ps.base_speed
    into v_next_species_name, v_next_base_attack, v_next_base_defense, v_next_base_hp, v_next_base_speed
  from public.pokemon_species ps
  where ps.id = v_next_species_id;

  if not found then
    return query select false, 'no_evolution_available', v_current_species_id, null::integer, v_current_species_name, null::text, 0::bigint, null::bigint;
    return;
  end if;

  if v_next_base_attack is null or v_next_base_defense is null or v_next_base_hp is null or v_next_base_speed is null then
    return query select false, 'species_stats_missing', v_current_species_id, v_next_species_id, v_current_species_name, v_next_species_name, 0::bigint, null::bigint;
    return;
  end if;

  select u.gold into v_user_gold
  from public.users u
  where u.slack_user_id = p_slack_user_id
  for update;

  if not found then
    return query select false, 'user_not_started', null::integer, null::integer, null::text, null::text, null::bigint, null::bigint;
    return;
  end if;

  v_cost := (4000 + (case v_rarity
    when 'uncommon' then 1000
    when 'rare' then 2000
    when 'epic' then 3000
    when 'legendary' then 4000
    when 'mythical' then 5000
    else 0
  end))::bigint * (2::bigint ^ greatest(coalesce(v_current_evolution_stage, 1) - 1, 0));

  if v_user_gold < v_cost then
    return query select false, 'insufficient_gold', v_current_species_id, v_next_species_id, v_current_species_name, v_next_species_name, v_cost, v_user_gold;
    return;
  end if;

  update public.user_pokemons
  set species_id = v_next_species_id,
      attack = greatest(1, ceil(v_next_base_attack * power(1.02, greatest(v_level - 1, 0)))::integer),
      defense = greatest(1, ceil(v_next_base_defense * power(1.02, greatest(v_level - 1, 0)))::integer),
      hp = greatest(1, ceil(v_next_base_hp * power(1.02, greatest(v_level - 1, 0)))::integer),
      speed = greatest(1, ceil(v_next_base_speed * power(1.02, greatest(v_level - 1, 0)))::integer)
  where id = p_pokemon_id
    and slack_user_id = p_slack_user_id;

  update public.users
  set gold = gold - v_cost
  where slack_user_id = p_slack_user_id
    and gold >= v_cost
  returning gold into remaining_gold;

  if remaining_gold is null then
    raise exception 'Gold insuficiente no momento da evolução';
  end if;

  insert into public.transactions (slack_user_id, type, amount)
  values (p_slack_user_id, 'pokemon_evolution', -v_cost);

  return query select true, null::text, v_current_species_id, v_next_species_id, v_current_species_name, v_next_species_name, v_cost, remaining_gold;
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
  cost bigint,
  remaining_gold bigint
)
language plpgsql
as $$
declare
  v_user_gold bigint;
  v_level integer;
  v_base_attack integer;
  v_base_defense integer;
  v_base_hp integer;
  v_base_speed integer;
  v_cost bigint;
  v_new_level integer;
begin
  select up.level, ps.base_attack, ps.base_defense, ps.base_hp, ps.base_speed
    into v_level, v_base_attack, v_base_defense, v_base_hp, v_base_speed
  from public.user_pokemons up
  join public.pokemon_species ps on ps.id = up.species_id
  where up.id = p_pokemon_id
    and up.slack_user_id = p_slack_user_id
  for update of up, ps;

  if not found then
    return query select false, 'pokemon_not_owned', null::integer, null::integer, null::bigint, null::bigint;
    return;
  end if;

  if v_base_attack is null or v_base_defense is null or v_base_hp is null or v_base_speed is null then
    return query select false, 'species_stats_missing', v_level, v_level, 0::bigint, null::bigint;
    return;
  end if;

  if v_level >= 50 then
    return query select false, 'max_level', v_level, v_level, 0::bigint, null::bigint;
    return;
  end if;

  select u.gold into v_user_gold
  from public.users u
  where u.slack_user_id = p_slack_user_id
  for update;

  if not found then
    return query select false, 'user_not_started', null::integer, null::integer, null::bigint, null::bigint;
    return;
  end if;

  v_cost := public.calculate_upgrade_cost(v_level);

  if v_user_gold < v_cost then
    return query select false, 'insufficient_gold', v_level, v_level, v_cost, v_user_gold;
    return;
  end if;

  v_new_level := v_level + 1;

  update public.user_pokemons
  set level = v_new_level,
      upgrade_spent_gold = coalesce(upgrade_spent_gold, 0) + v_cost,
      attack = greatest(1, ceil(v_base_attack * power(1.02, greatest(v_new_level - 1, 0)))::integer),
      defense = greatest(1, ceil(v_base_defense * power(1.02, greatest(v_new_level - 1, 0)))::integer),
      hp = greatest(1, ceil(v_base_hp * power(1.02, greatest(v_new_level - 1, 0)))::integer),
      speed = greatest(1, ceil(v_base_speed * power(1.02, greatest(v_new_level - 1, 0)))::integer)
  where id = p_pokemon_id
    and slack_user_id = p_slack_user_id;

  update public.users
  set gold = gold - v_cost
  where slack_user_id = p_slack_user_id
    and gold >= v_cost
  returning gold into remaining_gold;

  if remaining_gold is null then
    raise exception 'Gold insuficiente no momento do débito';
  end if;

  insert into public.transactions (slack_user_id, type, amount)
  values (p_slack_user_id, 'pokemon_upgrade', -v_cost);

  return query select true, null::text, v_level, v_new_level, v_cost, remaining_gold;
end;
$$;

create or replace function public.upgrade_user_pokemon_batch(
  p_slack_user_id text,
  p_pokemon_id bigint,
  p_target_level integer
)
returns table (
  ok boolean,
  reason text,
  previous_level integer,
  new_level integer,
  cost bigint,
  remaining_gold bigint
)
language plpgsql
as $$
declare
  v_user_gold bigint;
  v_level integer;
  v_target_level integer := coalesce(p_target_level, 0);
  v_base_attack integer;
  v_base_defense integer;
  v_base_hp integer;
  v_base_speed integer;
  v_total_cost bigint;
begin
  select up.level, ps.base_attack, ps.base_defense, ps.base_hp, ps.base_speed
    into v_level, v_base_attack, v_base_defense, v_base_hp, v_base_speed
  from public.user_pokemons up
  join public.pokemon_species ps on ps.id = up.species_id
  where up.id = p_pokemon_id
    and up.slack_user_id = p_slack_user_id
  for update of up, ps;

  if not found then
    return query select false, 'pokemon_not_owned', null::integer, null::integer, null::bigint, null::bigint;
    return;
  end if;

  if v_base_attack is null or v_base_defense is null or v_base_hp is null or v_base_speed is null then
    return query select false, 'species_stats_missing', v_level, v_level, 0::bigint, null::bigint;
    return;
  end if;

  if v_target_level <= 0 then
    return query select false, 'invalid_target_level', v_level, v_target_level, 0::bigint, null::bigint;
    return;
  end if;

  if v_level >= 50 then
    return query select false, 'max_level_reached', v_level, v_level, 0::bigint, null::bigint;
    return;
  end if;

  if v_target_level > 50 then
    return query select false, 'target_above_max_level', v_level, v_target_level, 0::bigint, null::bigint;
    return;
  end if;

  if v_target_level <= v_level then
    return query select false, 'target_must_be_higher', v_level, v_target_level, 0::bigint, null::bigint;
    return;
  end if;

  select u.gold into v_user_gold
  from public.users u
  where u.slack_user_id = p_slack_user_id
  for update;

  if not found then
    return query select false, 'user_not_started', null::integer, null::integer, null::bigint, null::bigint;
    return;
  end if;

  v_total_cost := public.calculate_upgrade_total_cost(v_level, v_target_level);

  if v_user_gold < v_total_cost then
    return query select false, 'insufficient_gold', v_level, v_target_level, v_total_cost, v_user_gold;
    return;
  end if;

  update public.user_pokemons
  set level = v_target_level,
      upgrade_spent_gold = coalesce(upgrade_spent_gold, 0) + v_total_cost,
      attack = greatest(1, ceil(v_base_attack * power(1.02, greatest(v_target_level - 1, 0)))::integer),
      defense = greatest(1, ceil(v_base_defense * power(1.02, greatest(v_target_level - 1, 0)))::integer),
      hp = greatest(1, ceil(v_base_hp * power(1.02, greatest(v_target_level - 1, 0)))::integer),
      speed = greatest(1, ceil(v_base_speed * power(1.02, greatest(v_target_level - 1, 0)))::integer)
  where id = p_pokemon_id
    and slack_user_id = p_slack_user_id;

  update public.users
  set gold = gold - v_total_cost
  where slack_user_id = p_slack_user_id
    and gold >= v_total_cost
  returning gold into remaining_gold;

  if remaining_gold is null then
    raise exception 'Gold insuficiente no momento do débito do upgrade em lote';
  end if;

  insert into public.transactions (slack_user_id, type, amount)
  values (p_slack_user_id, 'pokemon_upgrade_batch', -v_total_cost);

  return query select true, null::text, v_level, v_target_level, v_total_cost, remaining_gold;
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
  v_price integer;
  v_base_attack integer;
  v_base_defense integer;
  v_base_hp integer;
  v_base_speed integer;
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

  select dm.species_id, dm.price, ps.base_attack, ps.base_defense, ps.base_hp, ps.base_speed
    into v_species_id, v_price, v_base_attack, v_base_defense, v_base_hp, v_base_speed
  from public.daily_market dm
  join public.pokemon_species ps on ps.id = dm.species_id
  where dm.market_date = p_market_date
    and dm.slot = p_slot;

  if not found then
    return query select false, 'invalid_slot', null::integer, null::integer, v_user_gold, null::bigint;
    return;
  end if;

  if v_base_attack is null or v_base_defense is null or v_base_hp is null or v_base_speed is null then
    return query select false, 'species_stats_missing', v_species_id, v_price, v_user_gold, null::bigint;
    return;
  end if;

  if v_user_gold < v_price then
    return query select false, 'insufficient_gold', v_species_id, v_price, v_user_gold, null::bigint;
    return;
  end if;

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
    greatest(1, v_base_attack),
    greatest(1, v_base_defense),
    greatest(1, v_base_hp),
    greatest(1, v_base_speed),
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
