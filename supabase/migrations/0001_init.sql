-- DnDF Platform — 0001: profiles, campaigns, members, characters, history, settings.
-- Run once in the Supabase SQL editor (see supabase/README.md).
-- Row-level security is on for every table; nothing is readable without a policy.

begin;

-- Helper functions live here. The schema is not exposed through the API.
create schema if not exists private;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

-- Site-wide key/value settings. No policies: only the SQL editor (or the
-- service role) can read or write it.
create table public.app_settings (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

-- One row per signed-in user. is_dm means "may create and run campaigns";
-- it is set only by private.sync_profile, never by the user.
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  discord_username text,
  display_name text,
  is_dm boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 80),
  -- Table rulings the DM can change (see CLAUDE.md, "Table rulings already decided").
  settings jsonb not null default '{}'::jsonb,
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.campaign_members (
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role text not null default 'player' check (role in ('player', 'dm')),
  joined_at timestamptz not null default now(),
  primary key (campaign_id, user_id)
);
create index campaign_members_user_idx on public.campaign_members (user_id);

create table public.characters (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  campaign_id uuid references public.campaigns (id) on delete set null,
  rules_version text not null check (rules_version in ('dndf-8.8', 'dndf-10')),
  doc jsonb not null default '{}'::jsonb,
  name text generated always as (doc ->> 'name') stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index characters_owner_idx on public.characters (owner_id);
create index characters_campaign_idx on public.characters (campaign_id);

-- Append-only log of changes to a character (drives History and undo).
create table public.character_history (
  id bigint generated always as identity primary key,
  character_id uuid not null references public.characters (id) on delete cascade,
  actor_id uuid default auth.uid() references public.profiles (id) on delete set null,
  change jsonb not null,
  at timestamptz not null default now()
);
create index character_history_character_idx on public.character_history (character_id, at desc);

-- ---------------------------------------------------------------------------
-- Profile sync and the bootstrap DM
-- ---------------------------------------------------------------------------

-- Creates or refreshes a user's profile from their Discord identity, and makes
-- them a DM only if their Discord username equals the
-- dm_bootstrap_discord_username row in app_settings. The first person to sign
-- in gets nothing special.
--
-- The username is read from auth.identities (written by Supabase Auth from
-- Discord), not from auth.users.raw_user_meta_data, which a signed-in user can
-- edit themselves.
create function private.sync_profile(uid uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  ident jsonb;
  username text;
  shown text;
  legacy_tag boolean;
  bootstrap text;
begin
  select i.identity_data into ident
  from auth.identities i
  where i.user_id = uid and i.provider = 'discord'
  order by i.updated_at desc nulls last
  limit 1;

  -- Supabase stores the Discord handle as full_name, and as name with "#0" added.
  username := lower(nullif(trim(coalesce(ident ->> 'full_name', split_part(ident ->> 'name', '#', 1))), ''));
  shown := coalesce(nullif(trim(ident #>> '{custom_claims,global_name}'), ''), username);
  -- Old-style "name#1234" handles are not unique, so they can never match the bootstrap name.
  legacy_tag := split_part(coalesce(ident ->> 'name', ''), '#', 2) not in ('', '0');

  insert into public.profiles as p (id, discord_username, display_name)
  values (uid, username, shown)
  on conflict (id) do update
    set discord_username = excluded.discord_username,
        display_name = coalesce(p.display_name, excluded.display_name),
        updated_at = now()
    where excluded.discord_username is not null
      and (p.discord_username is distinct from excluded.discord_username or p.display_name is null);

  select lower(ltrim(trim(s.value), '@')) into bootstrap
  from public.app_settings s
  where s.key = 'dm_bootstrap_discord_username';

  if username is not null and not legacy_tag and bootstrap <> '' and username = bootstrap then
    update public.profiles set is_dm = true, updated_at = now() where id = uid and not is_dm;
  end if;
end;
$$;

-- Runs on sign-up and on every later sign-in (Supabase Auth updates the user row).
-- A problem here must never block signing in; the app also calls
-- sync_my_profile() after sign-in, which reports errors properly.
create function private.on_auth_user_changed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  begin
    perform private.sync_profile(new.id);
  exception when others then
    raise warning 'dndf: could not sync profile for %: %', new.id, sqlerrm;
  end;
  return new;
end;
$$;

create trigger dndf_sync_profile
after insert or update on auth.users
for each row execute function private.on_auth_user_changed();

-- Called by the app after sign-in: refreshes and returns the caller's profile.
create function public.sync_my_profile()
returns public.profiles
language plpgsql
security definer
set search_path = ''
as $$
declare
  result public.profiles;
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;
  perform private.sync_profile(auth.uid());
  select * into result from public.profiles where id = auth.uid();
  return result;
end;
$$;

-- ---------------------------------------------------------------------------
-- Helpers used by the policies (security definer so policies don't recurse)
-- ---------------------------------------------------------------------------

create function private.is_site_dm()
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (select 1 from public.profiles where id = (select auth.uid()) and is_dm);
$$;

create function private.is_campaign_member(cid uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.campaign_members
    where campaign_id = cid and user_id = (select auth.uid())
  );
$$;

create function private.is_campaign_dm(cid uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.campaign_members
    where campaign_id = cid and user_id = (select auth.uid()) and role = 'dm'
  );
$$;

create function private.shares_campaign(other uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.campaign_members mine
    join public.campaign_members theirs on theirs.campaign_id = mine.campaign_id
    where mine.user_id = (select auth.uid()) and theirs.user_id = other
  );
$$;

create function private.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger profiles_touch before update on public.profiles
for each row execute function private.touch_updated_at();
create trigger campaigns_touch before update on public.campaigns
for each row execute function private.touch_updated_at();
create trigger characters_touch before update on public.characters
for each row execute function private.touch_updated_at();

-- Whoever creates a campaign becomes its DM.
create function private.on_campaign_created()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.created_by is not null then
    insert into public.campaign_members (campaign_id, user_id, role)
    values (new.id, new.created_by, 'dm')
    on conflict (campaign_id, user_id) do update set role = 'dm';
  end if;
  return new;
end;
$$;

create trigger campaigns_add_creator_as_dm
after insert on public.campaigns
for each row execute function private.on_campaign_created();

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------

alter table public.app_settings enable row level security;
alter table public.profiles enable row level security;
alter table public.campaigns enable row level security;
alter table public.campaign_members enable row level security;
alter table public.characters enable row level security;
alter table public.character_history enable row level security;

-- profiles: you, people in your campaigns, and DMs (so they can add players).
create policy profiles_select on public.profiles for select to authenticated
using (id = (select auth.uid()) or private.shares_campaign(id) or private.is_site_dm());

-- Only display_name can be changed (see the column grant below).
create policy profiles_update_own on public.profiles for update to authenticated
using (id = (select auth.uid()))
with check (id = (select auth.uid()));

-- campaigns: members read the basics; DMs create; the campaign's DMs manage.
create policy campaigns_select on public.campaigns for select to authenticated
using (created_by = (select auth.uid()) or private.is_campaign_member(id));

create policy campaigns_insert on public.campaigns for insert to authenticated
with check (created_by = (select auth.uid()) and private.is_site_dm());

create policy campaigns_update on public.campaigns for update to authenticated
using (private.is_campaign_dm(id))
with check (private.is_campaign_dm(id));

create policy campaigns_delete on public.campaigns for delete to authenticated
using (private.is_campaign_dm(id));

-- campaign_members: members see the crew list; the campaign's DMs manage it.
create policy campaign_members_select on public.campaign_members for select to authenticated
using (private.is_campaign_member(campaign_id));

create policy campaign_members_insert on public.campaign_members for insert to authenticated
with check (private.is_campaign_dm(campaign_id));

create policy campaign_members_update on public.campaign_members for update to authenticated
using (private.is_campaign_dm(campaign_id))
with check (private.is_campaign_dm(campaign_id));

create policy campaign_members_delete on public.campaign_members for delete to authenticated
using (private.is_campaign_dm(campaign_id));

-- characters: the owner, and the DMs of the character's campaign. Other
-- players cannot read a crewmate's sheet from the database at all.
create policy characters_select on public.characters for select to authenticated
using (owner_id = (select auth.uid()) or private.is_campaign_dm(campaign_id));

create policy characters_insert on public.characters for insert to authenticated
with check (
  owner_id = (select auth.uid())
  and (campaign_id is null or private.is_campaign_member(campaign_id))
);

create policy characters_update on public.characters for update to authenticated
using (owner_id = (select auth.uid()) or private.is_campaign_dm(campaign_id))
with check (
  (owner_id = (select auth.uid()) and (campaign_id is null or private.is_campaign_member(campaign_id)))
  or private.is_campaign_dm(campaign_id)
);

create policy characters_delete on public.characters for delete to authenticated
using (owner_id = (select auth.uid()) or private.is_campaign_dm(campaign_id));

-- character_history: follows the character (the subquery is itself filtered by
-- the characters policies). Rows can be added, never changed or removed.
create policy character_history_select on public.character_history for select to authenticated
using (exists (select 1 from public.characters c where c.id = character_id));

create policy character_history_insert on public.character_history for insert to authenticated
with check (
  actor_id = (select auth.uid())
  and exists (select 1 from public.characters c where c.id = character_id)
);

-- ---------------------------------------------------------------------------
-- Grants: signed-out visitors get nothing; signed-in users get only what the
-- policies above are written for.
-- ---------------------------------------------------------------------------

revoke all on
  public.app_settings, public.profiles, public.campaigns,
  public.campaign_members, public.characters, public.character_history
from anon, authenticated;

grant select on public.profiles to authenticated;
grant update (display_name) on public.profiles to authenticated;
grant select, insert, update, delete on public.campaigns to authenticated;
grant select, insert, update, delete on public.campaign_members to authenticated;
grant select, insert, update, delete on public.characters to authenticated;
grant select, insert on public.character_history to authenticated;

revoke all on all functions in schema private from public;
revoke all on function public.sync_my_profile() from public, anon;
grant execute on function public.sync_my_profile() to authenticated;

grant usage on schema private to authenticated;
grant execute on function
  private.is_site_dm(),
  private.is_campaign_member(uuid),
  private.is_campaign_dm(uuid),
  private.shares_campaign(uuid)
to authenticated;

commit;
