-- A crew's ship: one JSON document, like a character. A ship belongs to whoever made it. Put it in a
-- campaign and the whole crew can open it and change it (the hold and the treasury are shared);
-- only its owner or the campaign's DMs can delete it, and nobody can take its ownership.
begin;

create table public.ships (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  -- null: only its owner sees it. Set: everyone in that campaign shares it.
  campaign_id uuid references public.campaigns (id) on delete set null,
  name text generated always as (doc ->> 'name') stored,
  doc jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index ships_owner_idx on public.ships (owner_id);
create index ships_campaign_idx on public.ships (campaign_id);

create trigger ships_touch before update on public.ships
for each row execute function private.touch_updated_at();

-- Whoever may change a shared ship may not hand it to someone else.
create function private.keep_ship_owner()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.owner_id := old.owner_id;
  return new;
end;
$$;
create trigger ships_keep_owner before update on public.ships
for each row execute function private.keep_ship_owner();

alter table public.ships enable row level security;

create policy ships_select on public.ships for select to authenticated
using (owner_id = (select auth.uid()) or (campaign_id is not null and private.is_campaign_member(campaign_id)));

create policy ships_insert on public.ships for insert to authenticated
with check (owner_id = (select auth.uid()) and (campaign_id is null or private.is_campaign_member(campaign_id)));

-- The crew changes the shared ship. It can be moved only into a campaign the person changing it is in,
-- and only its owner can take it out of every campaign.
create policy ships_update on public.ships for update to authenticated
using (owner_id = (select auth.uid()) or (campaign_id is not null and private.is_campaign_member(campaign_id)))
with check (
  (owner_id = (select auth.uid()) and (campaign_id is null or private.is_campaign_member(campaign_id)))
  or (campaign_id is not null and private.is_campaign_member(campaign_id))
);

create policy ships_delete on public.ships for delete to authenticated
using (owner_id = (select auth.uid()) or (campaign_id is not null and private.is_campaign_dm(campaign_id)));

revoke all on public.ships from anon, authenticated;
grant select, insert, update, delete on public.ships to authenticated;

commit;
