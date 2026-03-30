do $$
begin
  if exists (
    select 1
      from pg_constraint
     where conname = 'healing_stations_level_check'
       and conrelid = 'public.healing_stations'::regclass
  ) then
    alter table public.healing_stations
      drop constraint healing_stations_level_check;
  end if;

  alter table public.healing_stations
    add constraint healing_stations_level_check
    check (level between 1 and 30);
end $$;
