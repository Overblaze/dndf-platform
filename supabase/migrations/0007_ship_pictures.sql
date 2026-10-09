-- DnDF Platform — 0007: a ship's map and artwork.
-- Run once in the Supabase SQL editor, after 0006 (see supabase/README.md).
--
-- Files live in a private storage bucket at <ship id>/<file>. Whoever can open a ship can see its
-- pictures, and whoever can change it (its owner, or its whole crew once it is in a campaign) can
-- add and remove them. Nobody else can, and nobody signed out can.

begin;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('ship-pictures', 'ship-pictures', false, 4194304, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- True when the signed-in person can open the ship whose id is the file's folder. Written out rather
-- than left to the ships table's own policies, so it reads the same whoever owns that table.
create function private.can_open_ship_folder(object_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.ships s
    where s.id::text = (storage.foldername(object_name))[1]
      and (s.owner_id = (select auth.uid()) or (s.campaign_id is not null and private.is_campaign_member(s.campaign_id)))
  );
$$;
revoke all on function private.can_open_ship_folder(text) from public, anon;
grant execute on function private.can_open_ship_folder(text) to authenticated;

create policy ship_pictures_select on storage.objects for select to authenticated
using (bucket_id = 'ship-pictures' and private.can_open_ship_folder(name));

create policy ship_pictures_insert on storage.objects for insert to authenticated
with check (bucket_id = 'ship-pictures' and private.can_open_ship_folder(name));

create policy ship_pictures_delete on storage.objects for delete to authenticated
using (bucket_id = 'ship-pictures' and private.can_open_ship_folder(name));

commit;
