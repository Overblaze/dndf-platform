-- DnDF Platform — 0009: a fix to 0008.
-- Run once in the Supabase SQL editor, after 0008.
--
-- 0008 named an account with no Discord identity after the first part of its email address, which is
-- right for a password account (that part is its username). But Supabase writes a brand-new Discord
-- account before it writes its Discord identity, and with the email address Discord hands over, so a
-- new Discord player was shown to the table as the first part of their email address and kept that
-- name. This names only password accounts that way, and puts right anyone already affected.
--
-- Second fix: 0008 took the join code off a new account's details as it was made, but Supabase Auth
-- writes those details again a moment later, so the code stayed on the account (readable only by
-- that player, who knew it anyway, but it was meant not to be kept). It is now taken off on every
-- later write as well.

begin;

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

  -- Only an account made with a password is named after its address (which is its username).
  -- A Discord account is first written before its Discord identity is, with the email address
  -- Discord hands over; that address must never become the name shown to the table.
  if ident is null then
    select nullif(left(lower(split_part(coalesce(u.email, ''), '@', 1)), 32), '') into shown
    from auth.users u
    where u.id = uid and u.raw_app_meta_data ->> 'provider' = 'email';
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

-- Anyone signed in with Discord who is shown as the first part of their email address goes back to
-- their Discord name.
update public.profiles p
set display_name = coalesce(nullif(trim(i.identity_data #>> '{custom_claims,global_name}'), ''), p.discord_username),
    updated_at = now()
from auth.users u
join auth.identities i on i.user_id = u.id and i.provider = 'discord'
where p.id = u.id
  and coalesce(u.email, '') <> ''
  and lower(p.display_name) = lower(left(split_part(u.email, '@', 1), 32));

create function private.drop_join_code()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.raw_user_meta_data ? 'join_code' then
    new.raw_user_meta_data := new.raw_user_meta_data - 'join_code';
  end if;
  return new;
end;
$$;
revoke all on function private.drop_join_code() from public, anon, authenticated;

create trigger dndf_drop_join_code
before update on auth.users
for each row execute function private.drop_join_code();

commit;
