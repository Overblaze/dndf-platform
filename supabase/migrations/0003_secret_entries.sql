-- DnDF Platform — 0003: private rules content (Devil Fruits, fruit advancements, DM chapters,
-- licensed stat blocks) and the grants that let a player read one.
-- Run once in the Supabase SQL editor, after 0001 and 0002 (see supabase/README.md).
--
-- Nothing in here is ever in the website's files or the public repository. The rows are loaded
-- from ~/dndf/secret on the DM's machine with the service-role key. A signed-in player's browser
-- can only be sent an entry the rules below allow, so secrecy does not depend on the app hiding
-- anything.

begin;

-- One write-up of one thing, from one book. The same fruit can appear in several books, so the
-- key is the entry's id and its book together ("devilFruit.example@expanded-encyclopedia").
create table public.secret_entries (
  key text primary key,
  id text not null,
  kind text not null,
  name text not null,
  book text not null,
  versions text[] not null default '{}',
  -- Who may read it:
  --   grant    only a player it has been granted to (a Devil Fruit)
  --   holders  any player who holds a fruit (fruit advancements, the encyclopedia's fruit rules)
  --   dm       DMs only (DM chapters, generation tables)
  audience text not null check (audience in ('grant', 'holders', 'dm')),
  data jsonb not null,
  loaded_at timestamptz not null default now()
);
create index secret_entries_kind_idx on public.secret_entries (kind);
create index secret_entries_id_idx on public.secret_entries (id);

-- A DM's decision that a character has, or knows about, one entry.
create table public.grants (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  entry_key text not null references public.secret_entries (key) on delete cascade,
  character_id uuid not null references public.characters (id) on delete cascade,
  -- owner: the character has it (a fruit eaten). knowledge: the player may read it (an appraisal).
  kind text not null default 'owner' check (kind in ('owner', 'knowledge')),
  -- Once revealed, everyone in the campaign may read the entry and see who has it.
  revealed boolean not null default false,
  note text,
  granted_by uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (entry_key, character_id, kind)
);
create index grants_campaign_idx on public.grants (campaign_id);
create index grants_character_idx on public.grants (character_id);

-- ---------------------------------------------------------------------------
-- Helpers (security definer, so the rules below can look at grants and
-- characters without those tables' own rules getting in the way)
-- ---------------------------------------------------------------------------

-- A DM of the site or of any campaign: may read all private content, to choose what to grant.
create function private.is_any_dm()
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select private.is_site_dm()
    or exists (select 1 from public.campaign_members where user_id = (select auth.uid()) and role = 'dm');
$$;

create function private.owns_character(cid uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (select 1 from public.characters where id = cid and owner_id = (select auth.uid()));
$$;

create function private.character_in_campaign(chid uuid, cid uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (select 1 from public.characters where id = chid and campaign_id = cid);
$$;

-- Whether the signed-in player may read one private entry.
create function private.can_read_secret(entry_key text, entry_audience text)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select case entry_audience
    when 'dm' then false
    when 'holders' then exists (
      select 1 from public.grants g
      join public.characters c on c.id = g.character_id
      where g.kind = 'owner' and c.owner_id = (select auth.uid())
    )
    else exists (
      select 1 from public.grants g
      left join public.characters c on c.id = g.character_id
      where g.entry_key = can_read_secret.entry_key
        and (
          c.owner_id = (select auth.uid())
          or (g.revealed and exists (
            select 1 from public.campaign_members m
            where m.campaign_id = g.campaign_id and m.user_id = (select auth.uid())
          ))
        )
    )
  end;
$$;

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------

alter table public.secret_entries enable row level security;
alter table public.grants enable row level security;

-- secret_entries: DMs read everything; a player reads only what a grant allows. Nobody signed
-- in can add, change or remove an entry: they are loaded with the service-role key.
create policy secret_entries_select on public.secret_entries for select to authenticated
using (private.is_any_dm() or private.can_read_secret(key, audience));

-- grants: the campaign's DMs manage them. A player sees the grants for their own characters, and
-- the revealed ones in a campaign they belong to.
create policy grants_select on public.grants for select to authenticated
using (
  private.is_campaign_dm(campaign_id)
  or private.owns_character(character_id)
  or (revealed and private.is_campaign_member(campaign_id))
);

create policy grants_insert on public.grants for insert to authenticated
with check (private.is_campaign_dm(campaign_id) and private.character_in_campaign(character_id, campaign_id));

create policy grants_update on public.grants for update to authenticated
using (private.is_campaign_dm(campaign_id))
with check (private.is_campaign_dm(campaign_id) and private.character_in_campaign(character_id, campaign_id));

create policy grants_delete on public.grants for delete to authenticated
using (private.is_campaign_dm(campaign_id));

-- ---------------------------------------------------------------------------
-- Who in the campaign has a fruit: everyone at the table can see THAT a crewmate has one, and
-- what it is only once it is revealed (or it is their own, or they are the DM).
-- ---------------------------------------------------------------------------
create function public.campaign_fruits(cid uuid)
returns table (character_id uuid, character_name text, revealed boolean, entry_key text, entry_name text)
language sql stable security definer
set search_path = ''
as $$
  select g.character_id,
         c.name,
         g.revealed,
         case when g.revealed or c.owner_id = (select auth.uid()) or private.is_campaign_dm(cid) then g.entry_key end,
         case when g.revealed or c.owner_id = (select auth.uid()) or private.is_campaign_dm(cid) then e.name end
  from public.grants g
  join public.characters c on c.id = g.character_id
  join public.secret_entries e on e.key = g.entry_key
  where g.campaign_id = cid
    and g.kind = 'owner'
    and e.kind = 'devilFruit'
    and private.is_campaign_member(cid);
$$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

revoke all on public.secret_entries, public.grants from anon, authenticated;
grant select on public.secret_entries to authenticated;
grant select, insert, update, delete on public.grants to authenticated;

revoke all on function public.campaign_fruits(uuid) from public, anon;
grant execute on function public.campaign_fruits(uuid) to authenticated;
revoke all on function
  private.is_any_dm(), private.owns_character(uuid), private.character_in_campaign(uuid, uuid), private.can_read_secret(text, text)
from public;
grant execute on function
  private.is_any_dm(), private.owns_character(uuid), private.character_in_campaign(uuid, uuid), private.can_read_secret(text, text)
to authenticated;

commit;
