# Database setup (Supabase)

The database is plain SQL in `migrations/`, run by hand. No CLI needed.

## 1. Run the migrations

In the Supabase dashboard open **SQL Editor**, and for each file in `migrations/`, in number order
(`0001_init.sql`, then `0002_…` when it exists): paste the whole file, press **Run**, and wait for "Success".
Each file is run once. If one fails, nothing from that file is kept, so fix the problem and run it again.

## 2. Say who the DM is

Nobody is a DM until you name one. The first person to sign in gets nothing special. Run this in the SQL Editor
with the DM's Discord username (the unique handle from their Discord profile, not their display name):

```sql
insert into public.app_settings (key, value)
values ('dm_bootstrap_discord_username', 'your_discord_username')
on conflict (key) do update set value = excluded.value;
```

Capital letters and a leading `@` don't matter. That person becomes a DM the next time they sign in. If they had
already signed in before you ran this, they sign out and in again. To check:

```sql
select discord_username, display_name, is_dm from public.profiles;
```

## 3. Turn on Discord sign-in

1. In the [Discord Developer Portal](https://discord.com/developers/applications) create an application, open
   **OAuth2**, and add this redirect: `https://<your-project-ref>.supabase.co/auth/v1/callback`.
2. In Supabase: **Authentication → Sign In / Providers → Discord**. Switch it on and paste the Discord application's
   Client ID and Client Secret. The secret goes only here, never in this repository or a `.env` file.
3. In Supabase: **Authentication → URL Configuration**. Set **Site URL** to
   `https://overblaze.github.io/dndf-platform/` and add both of these to **Redirect URLs**:
   - `https://overblaze.github.io/dndf-platform/`
   - `http://localhost:5173/dndf-platform/`

## What the first migration sets up

| Table | Holds | Who can read / write |
|---|---|---|
| `profiles` | one row per user: Discord username, display name, `is_dm` | you, people in your campaigns, DMs / you can change only your display name |
| `campaigns` | name and table rulings (`settings`) | members read; only DMs create; the campaign's DMs change |
| `campaign_members` | who is in a campaign, as `player` or `dm` | members read; the campaign's DMs change |
| `characters` | the character as one JSON `doc`, pinned to `dndf-8.8` or `dndf-10` | the owner and the campaign's DMs; other players cannot read it |
| `character_history` | append-only log of changes | whoever can see the character; rows can't be edited or deleted |
| `app_settings` | site settings such as the bootstrap DM | nobody through the app; SQL Editor only |

## Sheet background pictures (`0002_sheet_backgrounds.sql`)

Creates a private storage bucket, `sheet-backgrounds`, for pictures players upload as their character sheet
background. Files are stored at `<owner id>/<character id>/<file>`, limited to 2 MB JPEG, PNG or WebP (the site shrinks
pictures before uploading). A player can add, see and delete only their own; the DMs of a character's campaign can
also see that character's picture. Until this file is run, the built-in backgrounds work and uploads show a
"not set up yet" message.

Row-level security is on for every table and signed-out visitors can read nothing. `npm test` runs
`supabase/tests/rls.test.ts`, which loads these migrations into an in-memory Postgres and checks each rule above.
