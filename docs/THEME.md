# Theme: "Grand Line sea chart"

Aged parchment, teal sea, terracotta land, sepia ink, a faint chart grid and a compass rose. Matches the approved concept boards.

## Colors (CSS custom properties)
| Token | Hex | Use |
|---|---|---|
| --paper | #EFE0B9 | page background (+ 96 px grid: rgba(150,120,70,.16) 1 px lines) |
| --header | #E4CF9C | top bar |
| --card | #F8EED4 | cards |
| --card-inner | #F3E6C4 | tiles inside cards |
| --raised | #EEDDB2 | buttons, active nav |
| --line | #B89B63 | card borders |
| --rule | #D9C391 | dividers |
| --ink | #3B2A1A | main text |
| --ink-soft | #4E3B24 | secondary text |
| --muted | #6B5434 | labels, page refs (≥ 4.5:1 on cards) |
| --accent | #A9471F | primary buttons (text #FFF4DC), pips, selection |
| --accent-ink | #8E3B1C | accent text, headings on cards |
| --accent-tint | #F4D6BC | active states |
| --damage | #B83A26 | HP bar, damage (text #9E2F1E) |
| --heal | #2E7D74 | healing, ship hold, temp HP (text #1F5E57, tint #D9EEE6) |
| --fruit | #6A4C9C | borrowed/Devil Fruit (text #5A3E8A, tint #E8DDF2) |
| --warn | #C8952E | rulings/warnings (bg #F6E2B0, text #6B4A0E) |
| --poster | #FBF3DD | wanted poster paper, border #8A6F45 |

## Type (Google Fonts)
- Headings: "IM Fell English SC" (italic notes: "IM Fell English").
- Logo and wanted poster only: "Pirata One".
- Body: "Barlow" 15 px; numbers and labels: "Barlow Condensed" (labels 13 px, uppercase, letter-spacing .12em).

## Patterns
- Every rule shows a small page ref ("p.86") in --muted.
- Edited values: 2 px --accent outline + "edited · book X · use book/calculated".
- Breakdown box: dashed --accent border on --card-inner, line items then a bold total.
- Pips for limited resources; segmented buttons for modes; 44 px minimum touch targets.
- No emoji, no gradients other than the chart grid. Don't reproduce the One Piece logo or canon ship designs.
