-- Things a player writes themselves and wants to keep: custom spells first, room for more kinds later.
-- A row is its owner's. Give it a campaign and everyone in that campaign can read it (and use it on
-- their own characters); only its owner changes it, and the campaign's DMs may remove it.
begin;

create table public.homebrew (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  -- null: private to its owner. Set: shared with that campaign.
  campaign_id uuid references public.campaigns (id) on delete set null,
  kind text not null check (kind in ('spell')),
  name text not null check (length(trim(name)) between 1 and 120),
  data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index homebrew_owner_idx on public.homebrew (owner_id);
create index homebrew_campaign_idx on public.homebrew (campaign_id);

create trigger homebrew_touch before update on public.homebrew
for each row execute function private.touch_updated_at();

alter table public.homebrew enable row level security;

create policy homebrew_select on public.homebrew for select to authenticated
using (owner_id = (select auth.uid()) or (campaign_id is not null and private.is_campaign_member(campaign_id)));

-- You can only add your own, and only share with a campaign you are in.
create policy homebrew_insert on public.homebrew for insert to authenticated
with check (owner_id = (select auth.uid()) and (campaign_id is null or private.is_campaign_member(campaign_id)));

create policy homebrew_update on public.homebrew for update to authenticated
using (owner_id = (select auth.uid()))
with check (owner_id = (select auth.uid()) and (campaign_id is null or private.is_campaign_member(campaign_id)));

create policy homebrew_delete on public.homebrew for delete to authenticated
using (owner_id = (select auth.uid()) or (campaign_id is not null and private.is_campaign_dm(campaign_id)));

revoke all on public.homebrew from anon, authenticated;
grant select, insert, update, delete on public.homebrew to authenticated;

commit;
