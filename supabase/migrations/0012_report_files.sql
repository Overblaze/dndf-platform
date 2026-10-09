-- A file with a report to the developer: a PDF or a text file of source material to add later.
--
-- Only someone signed in can send one (a file from a signed-out visitor could be anything from
-- anyone). It waits in a private bucket, in the sender's own folder, until the bot has taken it:
-- the bot posts it in the developer's Discord channel, keeps a copy on its own machine, and
-- removes it from the bucket. Nobody else can read it meanwhile.
begin;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('report-files', 'report-files', false, 52428800, array['application/pdf', 'text/plain', 'text/markdown'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- <your id>/<file>: add to, look at and clear out only your own folder.
create policy report_files_insert on storage.objects for insert to authenticated
with check (bucket_id = 'report-files' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy report_files_select on storage.objects for select to authenticated
using (bucket_id = 'report-files' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy report_files_delete on storage.objects for delete to authenticated
using (bucket_id = 'report-files' and (storage.foldername(name))[1] = (select auth.uid())::text);

alter table public.reports
  -- Where the file waits in the bucket; cleared by the bot once it has taken it.
  add column file_path text check (file_path is null or char_length(file_path) between 3 and 300),
  -- Its name as the sender had it, and its size in bytes.
  add column file_name text check (file_name is null or char_length(file_name) between 1 and 120),
  add column file_size bigint check (file_size is null or file_size between 1 and 52428800),
  -- Where the bot put its own copy (a file name on its machine). Written by the bot only.
  add column file_saved text check (file_saved is null or char_length(file_saved) <= 200);

alter table public.reports drop constraint reports_kind_check;
alter table public.reports add constraint reports_kind_check check (kind in ('bug', 'idea', 'other', 'source'));

-- Sending, as before, and now with a file: only when signed in, only from your own folder, and
-- never with the bot's own note already filled in.
drop policy reports_send on public.reports;
create policy reports_send on public.reports for insert to anon, authenticated
  with check (
    user_id is not distinct from auth.uid()
    and status = 'new'
    and source = 'site'
    and discord_message_id is null
    and done_at is null
    and done_by is null
    and file_saved is null
    and (
      (file_path is null and file_name is null and file_size is null)
      or (
        auth.uid() is not null
        and file_name is not null
        and file_size is not null
        and file_path like auth.uid()::text || '/%'
        and file_path !~ '\.\.'
      )
    )
  );

grant insert (file_path, file_name, file_size) on public.reports to authenticated;

commit;
