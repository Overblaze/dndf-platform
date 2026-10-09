-- DnDF Platform — 0008: accounts for players who have no Discord.
-- Run once in the Supabase SQL editor, after 0007 (see supabase/README.md, which also says which
-- switch to change in the dashboard first).
--
-- A player without Discord picks a username and a password. Supabase Auth only knows email
-- addresses, so the app signs them up as <username>@<a made-up domain>; no mail is ever sent there.
--
-- The site is public, so a password account can only be made with the table's join code, which
-- lives in app_settings (nobody can read that table through the app). The check is here in the
-- database, on the row Supabase Auth inserts, so it cannot be skipped by calling the sign-up
-- address directly. While the code is empty, no password account can be made at all.
--
-- A password account can never become the bootstrap DM: that is still decided only by a Discord
-- identity. And it cannot take a name that a Discord player already goes by.

begin;

insert into public.app_settings (key, value) values ('join_code', '')
on conflict (key) do nothing;

create function private.check_join_code()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  provider text := new.raw_app_meta_data ->> 'provider';
  wanted text;
  given text := lower(trim(coalesce(new.raw_user_meta_data ->> 'join_code', '')));
  username text := lower(split_part(coalesce(new.email, ''), '@', 1));
  bootstrap text;
begin
  -- Discord sign-ins are not asked for a code.
  if provider = 'discord'
     or (provider is null and coalesce(new.encrypted_password, '') = '' and not coalesce(new.is_anonymous, false)) then
    return new;
  end if;

  select lower(trim(s.value)) into wanted from public.app_settings s where s.key = 'join_code';
  if wanted is null or wanted = '' then
    raise exception 'dndf: password accounts are not open';
  end if;
  if given <> wanted then
    raise exception 'dndf: wrong table code';
  end if;

  select lower(ltrim(trim(s.value), '@')) into bootstrap from public.app_settings s where s.key = 'dm_bootstrap_discord_username';
  if username = '' or username = coalesce(bootstrap, '')
     or exists (select 1 from public.profiles p where lower(p.discord_username) = username or lower(p.display_name) = username) then
    raise exception 'dndf: that name is taken';
  end if;

  -- The code has done its work; it is not kept on the account.
  new.raw_user_meta_data := coalesce(new.raw_user_meta_data, '{}'::jsonb) - 'join_code';
  return new;
end;
$$;

create trigger dndf_check_join_code
before insert on auth.users
for each row execute function private.check_join_code();

-- As in 0001, with one addition: someone with no Discord identity is shown by the username they
-- signed up with. discord_username stays empty for them, so they can never match the bootstrap DM.
create or replace function private.sync_profile(uid uuid)
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

  if ident is null then
    select nullif(left(lower(split_part(coalesce(u.email, ''), '@', 1)), 32), '') into shown
    from auth.users u where u.id = uid;
  end if;

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

revoke all on function private.check_join_code() from public, anon, authenticated;

commit;
