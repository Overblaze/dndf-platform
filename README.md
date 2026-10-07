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

## Docs

Everything about what this is and how it should behave is in [docs/](docs/): the product spec
([SPEC.md](docs/SPEC.md)), every formula ([FORMULAS.md](docs/FORMULAS.md)), the look and feel
([THEME.md](docs/THEME.md)), how book data is extracted ([EXTRACTION.md](docs/EXTRACTION.md)) and the current task
list ([KICKOFF.md](docs/KICKOFF.md)).
