-- What a crew knows about each other: who sails together, and the wanted poster each has had issued.
-- A player cannot read a crewmate's character (only its owner and the campaign's DMs can), so this
-- function hands the members of a campaign just the public part: the name, the level, and the poster
-- the character's player chose to issue. Nothing else of the sheet leaves it.
begin;

create function public.campaign_crew(cid uuid)
returns table (character_id uuid, character_name text, player_name text, level int, bounty numeric, epithet text, terms text, issued text)
language sql stable security definer
set search_path = ''
as $$
  select c.id,
         c.name,
         coalesce(p.display_name, p.discord_username, 'someone'),
         coalesce((select sum((cls ->> 'level')::int) from jsonb_array_elements(case when jsonb_typeof(c.doc -> 'classes') = 'array' then c.doc -> 'classes' else '[]'::jsonb end) cls
                   where jsonb_typeof(cls -> 'level') = 'number'), 0)::int,
         case when jsonb_typeof(c.doc #> '{bounty,posted,value}') = 'number' then (c.doc #>> '{bounty,posted,value}')::numeric end,
         c.doc #>> '{bounty,posted,epithet}',
         c.doc #>> '{bounty,posted,terms}',
         c.doc #>> '{bounty,posted,at}'
  from public.characters c
  left join public.profiles p on p.id = c.owner_id
  where c.campaign_id = cid
    and private.is_campaign_member(cid)
  order by c.name;
$$;

revoke all on function public.campaign_crew(uuid) from public, anon;
grant execute on function public.campaign_crew(uuid) to authenticated;

commit;
