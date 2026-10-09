# DnDF Platform

A free, private character platform for one Dungeons & Devil Fruits table (the One Piece 5e homebrew): live character
sheets that do the math and show their working, word-for-word rules text with page numbers, Discord sign-in, and Devil
Fruits kept secret by the database until the DM grants them. The website and (later) the Discord bot share one rules
engine, so their numbers can never disagree. The site is published at <https://overblaze.github.io/dndf-platform/>.

## Run it locally

You need Node.js 22 or newer.

```sh
npm install
npm run dev
```

Then open <http://localhost:5173/dndf-platform/>. To sign in locally, copy `.env.example` to `.env.local` and fill in the
Supabase URL and anon key; without them the site still runs, with sign-in switched off. Setting up the database and
Discord sign-in is covered in [supabase/README.md](supabase/README.md).

| Command | What it does |
|---|---|
| `npm test` | engine formula tests and database policy tests |
| `npm run validate` | checks every file in `data/rules/` against the schema |
| `npm run typecheck` | TypeScript check of every package |
| `npm run build` | production build of the site into `app/dist` |

## Where things are

- `app/`: the website (Vite, React, TypeScript)
- `packages/engine/`: the rules engine, one test per row of [docs/FORMULAS.md](docs/FORMULAS.md)
- `data/rules/`: public rules data; `data/schema/` holds its JSON Schema
- `supabase/migrations/`: the database, as numbered SQL files
- `tools/`: the rules validator and the PDF extraction scripts

Source PDFs, Devil Fruit data and anything secret stay outside this repository.

## Offline and installing

The built site is an installable web app. A service worker (`app/sw.template.js`, filled in by `app/vite.config.ts`
with the list of built files) keeps the app's own files on the device, so the site opens with no connection: the
Library, and characters and ships kept in the browser, all work. Opening the site asks the network first, so a new
deploy is picked up on the next load with a connection. The service worker never keeps anything from the database;
it is not registered by `npm run dev`.

Characters on an account work offline too (`app/src/lib/offline.ts`, and the wrapper in `app/src/lib/store.ts`): each
one read is kept in the browser's storage for that player; a change made with no connection is kept beside it and
sent when the connection returns, only if the character is still as the device last knew it. Otherwise nothing is
overwritten and the player chooses. Ships, Devil Fruits and the Crew and DM pages still need a connection.

## Docs

Everything about what this is and how it should behave is in [docs/](docs/): the product spec
([SPEC.md](docs/SPEC.md)), every formula ([FORMULAS.md](docs/FORMULAS.md)), the look and feel
([THEME.md](docs/THEME.md)), how book data is extracted ([EXTRACTION.md](docs/EXTRACTION.md)) and the current task
list ([KICKOFF.md](docs/KICKOFF.md)).

## Licence notice for spell text

This work includes material taken from the System Reference Document 5.1 (“SRD 5.1”) by Wizards of the Coast LLC and
available at https://dnd.wizards.com/resources/systems-reference-document. The SRD 5.1 is licensed under the Creative
Commons Attribution 4.0 International License available at https://creativecommons.org/licenses/by/4.0/legalcode.

That material is the 319 spells in `data/rules/dndf-10/srd_spells.json`. Spells the class lists name from other 5th
Edition books are held by name only; their text is not in this repository.
