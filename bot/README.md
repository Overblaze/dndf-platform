# DnDF Discord bot

Runs on Matt's mini PC as a user service. It uses the same rules engine (`packages/engine`) and the
same rules data (`data/rules`) as the website, so its numbers cannot differ from the sheet's.

## Commands
| Command | What it does |
|---|---|
| `/roll what:` | A roll from your sheet (`athletics`, `dex save`, `initiative`, an attack's name) or plain dice (`2d6+3`). `with:` advantage or disadvantage. An attack also rolls its damage. |
| `/hp change: amount:` | Take damage, heal, or gain temporary hit points. Saved to the character. |
| `/rest kind:` | A short or long rest. `hit_dice:` on a short rest spends that many; the bot rolls them. |
| `/dawn` | What comes back at dawn. |
| `/status` | Hit points, AC, speed, pools, switches, conditions. |
| `/sheet` | The character sheet as a PDF (the website's print page). `full_text:` adds each feature's rules text. Private unless `public:` is set. |
| `/party` | Everyone in your campaign: hit points and AC. |

Every command takes `character:` (it suggests your characters as you type) and defaults to the one you
changed most recently. A change made by the bot is written to the character's History with the
character as it was before, so the website's History can undo it.

## Housekeeping
When it starts and once a day after, the bot removes change logs older than 90 days from
`character_history`. It never removes a character: the statement names only the history table, and
the database's link runs from character to history, not back.

## Who can see what
The bot holds the Supabase **service-role key**, which bypasses row-level security. `src/db.ts` is the
only file that uses it, and every function there starts from the Discord user who ran the command:
their own characters, or the campaigns they are a member of. A Discord user is matched to a website
account through the identity Supabase Auth recorded at Discord sign-in, never through profile fields
a user can edit. Commands from any server other than the one in `bot.env` are ignored.

## Setting it up
1. Create the bot, invite it, and fill in `~/dndf/secret/bot.env` (five values; the file must be
   readable only by you). The steps are in the project conversation and in `docs/KICKOFF.md`.
2. `bash bot/install-service.sh` — copies `main` to `~/dndf/bot-live`, installs it, registers the
   slash commands on the server, and starts the service. Run it again after a merge to update.
   The service is told where this machine's Node is. After changing Node's version (for example
   with nvm), run the script again.
3. `journalctl --user -u dndf-bot -f` shows its log. `bash bot/install-service.sh --remove` stops it.

Nothing secret is in this repository: no token, no key, no `bot.env`.

## Working on it
- `npm start --workspace bot` runs it in the foreground from this checkout (stop the service first,
  or both will answer).
- `npm run register --workspace bot` after changing `src/slash.ts`.
- `src/commands.ts` is plain functions with tests in `bot/test/commands.test.ts`.
- `npx tsx bot/test/pdf-smoke.ts out.pdf` and `npx tsx bot/test/db-smoke.ts` are hand checks.
- PDFs come from the live site by default; `DNDF_SITE_URL=http://localhost:4173/dndf-platform/`
  points them at a local preview.
