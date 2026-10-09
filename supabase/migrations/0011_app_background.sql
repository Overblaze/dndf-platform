-- The table's own background picture: shown behind every page of the site unless a character has
-- chosen a background of its own. A site DM uploads it on the DM page.
--
-- The picture is in a public bucket: anyone who opens the site sees it, signed in or not, so there
-- is nothing to keep secret about it. Only a site DM can put one there, replace it or remove it.
-- One row says which file is the current one.
begin;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('app-background', 'app-background', true, 3145728, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create policy app_background_select on storage.objects for select to authenticated
using (bucket_id = 'app-background' and private.is_site_dm());

create policy app_background_insert on storage.objects for insert to authenticated
with check (bucket_id = 'app-background' and private.is_site_dm());

create policy app_background_update on storage.objects for update to authenticated
using (bucket_id = 'app-background' and private.is_site_dm())
with check (bucket_id = 'app-background' and private.is_site_dm());

create policy app_background_delete on storage.objects for delete to authenticated
using (bucket_id = 'app-background' and private.is_site_dm());

-- Which picture is current. One row only (id is always true); background_path is the file's name
-- in the bucket, or null for none.
create table public.site_appearance (
  id boolean primary key default true check (id),
  background_path text check (background_path is null or (char_length(background_path) between 1 and 200 and background_path !~ '[/\\]')),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null default auth.uid()
);

insert into public.site_appearance (id) values (true);

alter table public.site_appearance enable row level security;

create policy site_appearance_read on public.site_appearance for select to anon, authenticated
using (true);

create policy site_appearance_change on public.site_appearance for update to authenticated
using (private.is_site_dm())
with check (private.is_site_dm());

revoke all on public.site_appearance from anon, authenticated;
grant select on public.site_appearance to anon, authenticated;
grant update (background_path) on public.site_appearance to authenticated;

-- Who changed it and when is written here, not taken from the browser.
create function private.stamp_site_appearance()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end;
$$;

revoke all on function private.stamp_site_appearance() from public, anon, authenticated;

create trigger site_appearance_stamp
before update on public.site_appearance
for each row execute function private.stamp_site_appearance();

commit;
