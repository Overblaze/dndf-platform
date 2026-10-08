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

## Private content: Devil Fruits and DM chapters (`0003_secret_entries.sql`)

Run `0003_secret_entries.sql` in the SQL Editor like the others. It creates two tables:

| Table | Holds | Who can read / write |
|---|---|---|
| `secret_entries` | every private entry: Devil Fruits, fruit advancements, DM chapters. One row per entry per book | DMs read everything. A player reads a fruit only when a grant names it for one of their characters, and the rules for fruit users only once they hold a fruit. Nobody can add or change rows through the site |
| `grants` | which character has (`owner`) or has learned about (`knowledge`) which entry, and whether the table has been told (`revealed`) | the campaign's DMs give, change and take away; the character's owner sees their own; other members see a grant only after it is revealed |

`campaign_fruits(campaign id)` answers "who has a fruit" for a campaign: other players get *that* a character has one,
and its name only after the DM reveals it.

The content itself never goes in this repository. It is loaded from `~/dndf/secret/*.json` on the DM's machine with the
service-role key that is already in `~/dndf/secret/bot.env`:

```bash
npm run load-secret --workspace bot -- --dry   # count what would be loaded, change nothing
npm run load-secret --workspace bot            # load; safe to run again after re-extracting
```

It prints counts only. Running it again replaces rows by key and never removes one, so existing grants are kept.

### Setting up the table, once the files above are run

1. **DM page** → type a campaign name → *Create campaign*. Whoever creates it is its DM.
2. Each player signs in to the site with Discord once. They then appear under *Add someone…* on the DM page.
3. Each player opens the **Crew** page and presses *Put in this campaign* next to their character. Until they do, the
   DM cannot see that character at all.
4. On the DM page, *Grant a fruit* next to a character: search by name, choose whether the character **has** the fruit
   or only **knows about** it. *Reveal* tells the rest of the table which fruit it is; *Take away* closes it again.

## Your own spells (`0004_homebrew.sql`)

Run `0004_homebrew.sql` in the SQL Editor like the others. It creates one table, `homebrew`, for things a player
writes themselves (custom spells for now).

| Table | Holds | Who can read / write |
|---|---|---|
| `homebrew` | a spell someone wrote, with who owns it and, if shared, which campaign | its owner always; everyone in the campaign it is shared with reads it; only the owner changes it; the campaign's DMs may remove a shared one |

Until this file is run, the Library's "Your spells" says which file to run, and spells written while signed out are
kept in the browser instead. A spell added to a character is copied onto the character, so sheets do not depend on
this table.

## The crew's wanted posters (`0005_crew.sql`)

Run `0005_crew.sql` in the SQL Editor like the others. It adds no table, only one function, `campaign_crew(campaign id)`:
members of a campaign get each character's name, level and the wanted poster its player has **issued** (bounty,
epithet, terms, date). A player still cannot read a crewmate's character; nothing else of a sheet leaves it. Until
this file is run, the Crew page says which file to run and everything else works.

## Ships (`0006_ships.sql`)

Run `0006_ships.sql` in the SQL Editor like the others. It creates one table, `ships`.

| Table | Holds | Who can read / write |
|---|---|---|
| `ships` | a ship as one JSON `doc` (components, crew, upgrades, hold, treasury, log) | its owner always. Put in a campaign, everyone in that campaign opens **and changes** it (the hold and treasury are shared). Only the owner can take it out of the campaign; only the owner or the campaign's DMs can delete it; nobody can change who owns it |

Until this file is run, the Ship page says which file to run, and ships made while signed out are kept in the browser.
