-- DnDF Platform — 0002: pictures players upload as their character sheet background.
-- Run once in the Supabase SQL editor, after 0001 (see supabase/README.md).
--
-- Files live in a private storage bucket at <owner id>/<character id>/<file>.
-- A player can add, read and delete only inside their own folder; the DMs of a
-- character's campaign can also see that character's picture.

begin;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('sheet-backgrounds', 'sheet-backgrounds', false, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create policy sheet_backgrounds_select on storage.objects for select to authenticated
using (
  bucket_id = 'sheet-backgrounds'
  and (
    (storage.foldername(name))[1] = (select auth.uid())::text
    -- objects.name, spelled out: characters has a name column of its own.
    or exists (
      select 1 from public.characters c
      where c.id::text = (storage.foldername(objects.name))[2]
        and c.owner_id::text = (storage.foldername(objects.name))[1]
        and private.is_campaign_dm(c.campaign_id)
    )
  )
);

create policy sheet_backgrounds_insert on storage.objects for insert to authenticated
with check (
  bucket_id = 'sheet-backgrounds'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

create policy sheet_backgrounds_delete on storage.objects for delete to authenticated
using (
  bucket_id = 'sheet-backgrounds'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

commit;
