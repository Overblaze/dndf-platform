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
| `/condition` | `add`, `remove` or `list`. A condition the rules define says what it does and is applied to the sheet and to `/roll` (a paralyzed character's Strength save fails without a roll); anything else is kept as a note. |
| `/status` | Hit points, AC, speed, pools, switches, conditions. |
| `/sheet` | The character sheet as a PDF (the website's print page). `full_text:` adds each feature's rules text. Private unless `public:` is set. |
| `/party` | Everyone in your campaign: hit points and AC. |
| `/bounty` | Your character's wanted poster as issued. `crew: true` lists every poster out in your campaign, highest first, with the total. |
| `/item list` | Everything your character carries, marking what is in use. |
| `/item add` | Something from the book's armory (names are offered as you type; it comes with its weight) or a plain item of your own. |
| `/make <kind>` | An item of your own that works on the sheet. `weapon` (damage dice, +N, two-handed…), `armor` (base AC, Dexterity), `shield`, `wondrous`, `consumable` or `gear`. Powers: `ability` with `ability_becomes` (19 for a Circlet of Intellect) or `ability_bonus`, `save_bonus`, `skill` and `skill_bonus`, `ac_bonus`, `speed_bonus`, `hp_bonus`, `charges`, `roll`, `effect`, `spells`, `attunement`. The same thing the website's "Make an item" saves. |
| `/roll` and advantage | A roll the sheet makes with advantage or disadvantage (Stealth in heavy armor, an item) is rolled that way without being asked, and the reply says why. Asking for the opposite cancels it to a straight roll. `/make armor` has `stealth_disadvantage`. |
| `/item use` | Put an item to use or away: one you made is switched on, and a weapon, armor or shield from the armory is readied or worn. `attune: attune` attunes to it (an item that requires attunement works only when both worn and attuned); three attunements by the rule, and going over is said, not stopped. |
| `/item remove` | Remove an item, or some of it. |
| `/surge list` | Your Haki by Color with its tier, and every Spirit Surge advancement you have. |
| `/surge add` | Record an advancement from a Spirit Surge: pick the `rarity`, then the `advancement` from the list offered as you type. Strengthen Self and Career Advancement ask for `choice` or `skill`. One the rules would hold back is added anyway, with the reason said. Devil Fruit advancements are private and are added on the website. |
| `/surge remove` | Take the most recent advancement of that name off again. |
| `/ship status` | Your crew's ship at a glance: speed, crew, every part's hit points, treasury, what is wrong. |
| `/ship damage` / `/ship repair` | One part of the ship, by name (`hull`, `sails`, `cannon 2`). Damage under the part's threshold does nothing. |
| `/ship treasury` | Put berries into the crew's treasury or take them out, with what for. |
| `/ship aboard` | Set how many crew, passengers or rations are aboard. |

Every `/ship` change is written in the ship's log with who made it, and is refused if the ship was changed on the
website at the same moment. A player reaches their own ships and those shared with a campaign they are in.

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

### Reports to the developer

Anyone can send Matt a bug, an idea or a need: the "Report a problem or idea" button under every page of the
site, or `/report send` in Discord. Each is saved in the `reports` table (`0010_reports.sql`) and the bot posts it
in one channel, with a **Mark completed** button that only someone who may manage messages in that channel can
press (the server's owner always may). Pressed, the message turns green, says who completed it and when, and the
button becomes **Reopen**. `/report open` lists what is not completed yet.

To switch it on, add one line to `~/dndf/secret/bot.env` and run `bash bot/install-service.sh`:

    DISCORD_REPORT_CHANNEL_ID=<the channel's id>

The id: in Discord, Settings → Advanced → Developer Mode on, then right-click the channel → Copy Channel ID. The
bot needs View Channel, Send Messages and Embed Links there; make the channel private to you and the bot so
reports stay out of the table's sight. Without the line, reports are still saved and are posted as soon as it is
added: none is lost while the bot is off, either.

Nothing secret is in this repository: no token, no key, no `bot.env`.

## Working on it
- `npm start --workspace bot` runs it in the foreground from this checkout (stop the service first,
  or both will answer).
- `npm run register --workspace bot` after changing `src/slash.ts`.
- `src/commands.ts` is plain functions with tests in `bot/test/commands.test.ts`.
- `npx tsx bot/test/pdf-smoke.ts out.pdf` and `npx tsx bot/test/db-smoke.ts` are hand checks.
- PDFs come from the live site by default; `DNDF_SITE_URL=http://localhost:4173/dndf-platform/`
  points them at a local preview.
