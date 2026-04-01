-- Remove skills características do fluxo legado de !magicregister
create or replace function public.cleanup_characteristic_skills_from_magic_loadouts()
returns void
language plpgsql
security definer
as $$
begin
  update public.pokemon_magic_loadouts
     set spells = coalesce(
       (
         select jsonb_agg(entry)
         from jsonb_array_elements(coalesce(spells, '[]'::jsonb)) as entry
         where coalesce(entry->>'kind', '') <> 'characteristic'
       ),
       '[]'::jsonb
     )
   where exists (
     select 1
     from jsonb_array_elements(coalesce(spells, '[]'::jsonb)) as entry
     where coalesce(entry->>'kind', '') = 'characteristic'
   );
end;
$$;
