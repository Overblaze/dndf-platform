-- Reports to the developer: a bug, an idea, something needed. Anyone using the site can send one,
-- signed in or not; the bot posts each to a Discord channel and marks it done when told there.
--
-- Nobody can read the reports of others through the site. A signed-in player can read their own
-- (to see whether one is done). Only the bot, which holds the service-role key, changes a report
-- after it is sent.
begin;

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  -- The account that sent it; null when sent while signed out or from Discord by someone not linked.
  user_id uuid references auth.users (id) on delete set null default auth.uid(),
  -- The name to show: the account's, or what a signed-out visitor typed.
  reporter text not null default '' check (char_length(reporter) <= 60),
  kind text not null default 'bug' check (kind in ('bug', 'idea', 'other')),
  message text not null check (char_length(btrim(message)) between 3 and 2000),
  -- Where it was sent from: the page ("#/sheet/…"), the site's build, the browser. No character data.
  page text not null default '' check (char_length(page) <= 200),
  app_version text not null default '' check (char_length(app_version) <= 40),
  device text not null default '' check (char_length(device) <= 300),
  source text not null default 'site' check (source in ('site', 'discord')),
  status text not null default 'new' check (status in ('new', 'posted', 'done')),
  discord_message_id text,
  done_at timestamptz,
  done_by text
);

create index reports_status_idx on public.reports (status, created_at);
create index reports_user_idx on public.reports (user_id, created_at desc);

alter table public.reports enable row level security;

-- Sending: as yourself or as nobody, never as someone else, and never already posted or done.
create policy reports_send on public.reports for insert to anon, authenticated
  with check (
    user_id is not distinct from auth.uid()
    and status = 'new'
    and source = 'site'
    and discord_message_id is null
    and done_at is null
    and done_by is null
  );

-- Reading: only your own, and only when signed in.
create policy reports_read_own on public.reports for select to authenticated
  using (user_id = auth.uid());

revoke all on public.reports from anon, authenticated;
grant insert (reporter, kind, message, page, app_version, device) on public.reports to anon, authenticated;
grant select on public.reports to authenticated;

-- So the channel cannot be flooded: at most 5 reports in ten minutes from one account, and at most
-- 20 an hour from everyone who is signed out put together.
create function private.limit_reports()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.source <> 'site' then
    return new;
  end if;
  if new.user_id is not null then
    if (select count(*) from public.reports r where r.user_id = new.user_id and r.created_at > now() - interval '10 minutes') >= 5 then
      raise exception 'Too many reports just now. Try again in a few minutes.' using errcode = 'P0001';
    end if;
  elsif (select count(*) from public.reports r where r.user_id is null and r.source = 'site' and r.created_at > now() - interval '1 hour') >= 20 then
    raise exception 'Too many reports from signed-out visitors just now. Sign in, or try again later.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

revoke all on function private.limit_reports() from public, anon, authenticated;

create trigger reports_limit
before insert on public.reports
for each row execute function private.limit_reports();

commit;
