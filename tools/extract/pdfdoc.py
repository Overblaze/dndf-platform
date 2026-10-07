"""Reads a Homebrewery PDF into a stream of headings, paragraphs and table rows.

Uses `pdftohtml -xml` (poppler-utils), which keeps every piece of text with its
position and font. Fonts tell headings from body text; positions give the two
columns, paragraph indents and table cells. See docs/EXTRACTION.md.
"""

from __future__ import annotations

import html
import re
import subprocess
from dataclasses import dataclass, field
from pathlib import Path

SOURCES = Path.home() / "dndf" / "sources"

# Column geometry of the DnDF books (page is 918 px wide in pdftohtml units).
GUTTER = 459
LEFT_BASE = 81
RIGHT_BASE = 478
COLUMN_WIDTH = 359

# Heading fonts, largest first. MyFont 18 is the small heading used for options.
HEADING_LEVELS = {("MrEavesSCRemakeMedium", 32): 1, ("MrEavesSCRemakeMedium", 24): 2, ("MrEavesSCRemakeMedium", 19): 3, ("MyFont", 18): 4}
STAT_BLOCK_NAME = ("MrEavesSCRemakeMedium", 26)


@dataclass
class Item:
    page: int
    top: int
    left: int
    width: int
    family: str
    size: int
    color: str
    text: str
    bold: bool = False
    italic: bool = False

    @property
    def right(self) -> int:
        return self.left + self.width


@dataclass
class Line:
    page: int
    top: int
    left: int
    right: int
    kind: str  # heading | body | table | quote | statname
    level: int = 0
    text: str = ""
    runs: list[tuple[str, bool, bool]] = field(default_factory=list)  # (text, bold, italic)
    column: int = 0  # 0 left, 1 right, -1 spans both
    note: bool = False  # coloured stat-block text

    @property
    def lead(self) -> str:
        """Bold text the line opens with ("Hit Dice:"), or ""."""
        out = ""
        for text, bold, _ in self.runs:
            if not bold:
                break
            out += text
        return out.strip()


def load_items(pdf: str, first: int, last: int) -> list[Item]:
    path = SOURCES / pdf
    xml = subprocess.run(
        ["pdftohtml", "-xml", "-i", "-q", "-f", str(first), "-l", str(last), "-stdout", str(path)],
        check=True, capture_output=True, text=True,
    ).stdout
    fonts = {
        m[0]: (m[2], int(m[1]), m[3])
        for m in re.findall(r'<fontspec id="(\d+)" size="(\d+)" family="(?:[A-Z]+\+)?([\w-]+)" color="(#\w+)"', xml)
    }
    hidden = set(re.findall(r'<fontspec id="(\d+)"[^>]*opacity="0\.0+"', xml))
    items: list[Item] = []
    for chunk in re.split(r"<page ", xml)[1:]:
        page = int(re.match(r'number="(\d+)"', chunk).group(1))
        for top, left, width, _h, font, raw in re.findall(
            r'<text top="(-?\d+)" left="(-?\d+)" width="(\d+)" height="(\d+)" font="(\d+)">(.*?)</text>', chunk, flags=re.S
        ):
            if font in hidden or font not in fonts:
                continue
            family, size, color = fonts[font]
            text = html.unescape(re.sub(r"<[^>]+>", "", raw))
            if not text.strip():
                continue
            items.append(Item(page, int(top), int(left), int(width), family, size, color, text,
                              bold="Bold" in family or "<b>" in raw, italic="Italic" in family or "<i>" in raw))
    return items


def is_footer(item: Item) -> bool:
    return item.family.startswith("Bookinsanity") and item.size <= 12 and item.top > 1080


def kind_of(item: Item) -> tuple[str, int]:
    key = (item.family, item.size)
    if key in HEADING_LEVELS:
        return "heading", HEADING_LEVELS[key]
    if key == STAT_BLOCK_NAME:
        return "statname", 0
    if item.family.startswith("ScalySans") or (item.family == "MyFont" and item.size == 19):
        return "table", 0
    if item.family.startswith("WalterTurncoat"):
        return "quote", 0
    return "body", 0


def build_lines(items: list[Item]) -> list[Line]:
    """Joins the pieces that sit side by side on one line (bold lead-ins, italics, small caps)."""
    lines: list[Line] = []
    by_page: dict[int, list[Item]] = {}
    for item in items:
        if not is_footer(item):
            by_page.setdefault(item.page, []).append(item)
    for page, page_items in by_page.items():
        page_items.sort(key=lambda i: (i.top, i.left))
        used = [False] * len(page_items)
        for i, start in enumerate(page_items):
            if used[i]:
                continue
            used[i] = True
            group = [start]
            kind, level = kind_of(start)
            # Table cells stay separate; running text is stitched back together.
            max_gap = 12 if kind != "table" else 7
            extended = True
            while extended:
                extended = False
                for j in range(i + 1, len(page_items)):
                    other = page_items[j]
                    if used[j] or other.top - group[-1].top > 8:
                        if other.top - group[-1].top > 8:
                            break
                        continue
                    if abs(other.top - group[-1].top) > 7 or kind_of(other)[0] != kind:
                        continue
                    # Pieces in another font (฿, italics) can sit a few pixels higher and so sort first:
                    # grow the line to the left as well as to the right.
                    if -3 <= other.left - group[-1].right <= max_gap:
                        group.append(other)
                    elif -3 <= group[0].left - other.right <= max_gap:
                        group.insert(0, other)
                    else:
                        continue
                    used[j] = True
                    extended = True
                    break
            text = ""
            runs: list[tuple[str, bool, bool]] = []
            for k, piece in enumerate(group):
                gap = piece.left - group[k - 1].right if k else 0
                glue = " " if k and gap >= 3 and not text.endswith(" ") and not piece.text.startswith(" ") else ""
                text += glue + piece.text
                runs.append((glue + piece.text, piece.bold, piece.italic))
            left, right = group[0].left, max(p.right for p in group)
            line = Line(page, min(p.top for p in group), left, right, kind, level, re.sub(r"\s+", " ", text).strip(), runs,
                        note=start.color == "#662f45")
            line.column = -1 if left < GUTTER - 15 and right > GUTTER + 15 else (0 if left < GUTTER else 1)
            lines.append(line)
    return lines


def reading_order(lines: list[Line]) -> list[Line]:
    """Page by page: full-width blocks split the page into bands; inside a band, left column then right."""
    ordered: list[Line] = []
    pages: dict[int, list[Line]] = {}
    for line in lines:
        pages.setdefault(line.page, []).append(line)
    for page in sorted(pages):
        page_lines = sorted(pages[page], key=lambda l: (l.top, l.left))
        # A table row is full width if any of its cells crosses the gutter, and so are the rows touching it.
        table_rows: dict[int, list[Line]] = {}
        for line in page_lines:
            if line.kind == "table":
                key = next((t for t in table_rows if abs(t - line.top) <= 3), line.top)
                table_rows.setdefault(key, []).append(line)
        wide_tops = {t for t, cells in table_rows.items() if any(c.column == -1 for c in cells)}
        # A class table can sit in both columns without any cell crossing the gutter: its rows
        # start with a level ("1st") on the left and carry on at the same height on the right.
        for t, cells in table_rows.items():
            first = min(cells, key=lambda c: c.left)
            if re.fullmatch(r"\d+(st|nd|rd|th)", first.text) and first.left < 140 and any(c.left > GUTTER for c in cells):
                wide_tops.add(t)
        tops = sorted(table_rows)
        changed = True
        while changed:
            changed = False
            for a, b in zip(tops, tops[1:]):
                if b - a <= 24 and (a in wide_tops) != (b in wide_tops):
                    wide_tops.update((a, b))
                    changed = True
        for t in wide_tops:
            for cell in table_rows[t]:
                cell.column = -1
        bands: list[tuple[int, list[Line]]] = []
        current: list[Line] = []
        for line in page_lines:
            if line.column == -1:
                if current:
                    bands.append((0, current))
                    current = []
                if bands and bands[-1][0] == 1:
                    bands[-1][1].append(line)
                else:
                    bands.append((1, [line]))
            else:
                current.append(line)
        if current:
            bands.append((0, current))
        for wide, band in bands:
            if wide:
                ordered.extend(sorted(band, key=lambda l: (l.top, l.left)))
            else:
                ordered.extend(sorted((l for l in band if l.column == 0), key=lambda l: (l.top, l.left)))
                ordered.extend(sorted((l for l in band if l.column == 1), key=lambda l: (l.top, l.left)))
    return ordered


# --- Blocks -----------------------------------------------------------------


@dataclass
class Heading:
    level: int
    text: str
    page: int
    stat: bool = False  # the name of a stat block


@dataclass
class Para:
    text: str
    page: int
    lead: str = ""  # bold lead-in, if the paragraph opens with one
    listed: bool = False  # came from a bulleted or indented list
    lines: list[str] = field(default_factory=list)  # the printed lines, before joining


@dataclass
class Table:
    rows: list[list[Line]]  # cells of each visual row, left to right
    page: int
    wide: bool = False

    def texts(self) -> list[list[str]]:
        return [[c.text for c in row] for row in self.rows]


@dataclass
class Quote:
    text: str
    page: int


Block = Heading | Para | Table | Quote

_FORMULA = re.compile(r"^[A-Z][\w ’'()-]{2,48} = ")
_ENDS_SENTENCE = re.compile(r"[.:!?)”\"]$")


def to_blocks(lines: list[Line]) -> list[Block]:
    blocks: list[Block] = []
    i = 0
    prev: Line | None = None
    para_lines: list[Line] = []
    para_listed = False

    def flush() -> None:
        nonlocal para_lines, para_listed
        if para_lines:
            text = para_lines[0].text
            for a, b in zip(para_lines, para_lines[1:]):
                text += " " + b.text
            blocks.append(Para(re.sub(r"\s+", " ", text).strip(), para_lines[0].page, para_lines[0].lead, para_listed, [l.text for l in para_lines]))
        para_lines = []
        para_listed = False

    while i < len(lines):
        line = lines[i]
        if line.kind == "heading" or line.kind == "statname":
            flush()
            # Headings that wrap come as two lines of the same level.
            text = line.text
            while i + 1 < len(lines) and lines[i + 1].kind == line.kind and lines[i + 1].level == line.level and lines[i + 1].page == line.page \
                    and 0 < lines[i + 1].top - lines[i].top <= line_height(line) and lines[i + 1].column == line.column:
                i += 1
                text += " " + lines[i].text
            # Stat block names nest inside the feature they belong to.
            blocks.append(Heading(line.level if line.kind == "heading" else 4, text, line.page, stat=line.kind == "statname"))
            prev = None
        elif line.kind == "quote":
            flush()
            text = line.text
            while i + 1 < len(lines) and lines[i + 1].kind == "quote":
                i += 1
                text += " " + lines[i].text
            blocks.append(Quote(re.sub(r"\s+", " ", text), line.page))
            prev = None
        elif line.kind == "table":
            flush()
            rows: list[list[Line]] = []
            start = line
            while i < len(lines) and lines[i].kind == "table" and lines[i].page == start.page and (lines[i].column == start.column):
                if rows and abs(rows[-1][0].top - lines[i].top) <= 3:
                    rows[-1].append(lines[i])
                elif rows and lines[i].top - rows[-1][0].top > 60:
                    break
                else:
                    rows.append([lines[i]])
                i += 1
            i -= 1
            for row in rows:
                row.sort(key=lambda c: c.left)
            blocks.append(Table(rows, start.page, wide=start.column == -1))
            prev = None
        else:
            base = LEFT_BASE if line.left < GUTTER else RIGHT_BASE
            indent = line.left - base
            same_flow = prev is not None and prev.page == line.page and prev.column == line.column and 0 < line.top - prev.top <= 26
            cross_flow = prev is not None and not same_flow and not (prev.page == line.page and prev.column == line.column)
            prev_indent = (prev.left - (LEFT_BASE if prev.left < GUTTER else RIGHT_BASE)) if prev else 0
            listed = indent >= 17
            formula = bool(_FORMULA.match(line.text)) and indent >= 9
            # Text wraps only when the next word doesn't fit. If the line above had room for this
            # line's first word, the break was deliberate: a new bullet or paragraph.
            forced = False
            if prev is not None and (same_flow or cross_flow):
                limit = (LEFT_BASE if prev.left < GUTTER else RIGHT_BASE) + COLUMN_WIDTH
                first_word = line.text.split(" ")[0]
                word_width = (line.right - line.left) / max(1, len(line.text)) * len(first_word)
                forced = prev.right + 5 + word_width + 22 < limit
            if not para_lines:
                new = True
            elif formula:
                new = True  # "Fury save DC = 8 + …" is centred on its own line(s)
            elif _FORMULA.match(para_lines[0].text) and indent >= 9 and same_flow and not _ENDS_SENTENCE.search(prev.text):
                new = False
            elif listed:
                # Inside a list: a new item starts after a line that ends a sentence.
                new = not para_listed or forced
            elif para_listed:
                new = True
            elif 9 <= indent <= 16:
                # A first-line indent starts a paragraph, except under a bold lead-in ("Hit Dice: …"),
                # where the wrapped lines hang at the same indent.
                hanging = bool(para_lines[0].lead) and same_flow and line.top - prev.top <= 19 and not _ENDS_SENTENCE.search(prev.text)
                new = not hanging
            elif same_flow:
                new = line.top - prev.top > 22 or forced  # a gap between blocks, or a deliberate break
                if prev_indent >= 9 and prev_indent <= 16 and indent < 9:
                    new = False
            else:
                # Continuing in the next column or page: same paragraph unless the last line closed one.
                new = bool(_ENDS_SENTENCE.search(prev.text)) and line.text[:1].isupper() if prev else True
            if line.lead and indent < 9 and para_lines and (
                not same_flow or line.top - prev.top > 19 or _ENDS_SENTENCE.search(prev.text) or para_lines[0].lead
            ):
                new = True
            if new:
                flush()
                para_listed = listed
            para_lines.append(line)
            prev = line
        i += 1
    flush()
    return blocks


def line_height(line: Line) -> int:
    return 44 if line.level == 1 else 34


def read_blocks(pdf: str, first: int, last: int) -> list[Block]:
    return to_blocks(reading_order(build_lines(load_items(pdf, first, last))))


if __name__ == "__main__":
    import sys

    pdf, first, last = sys.argv[1], int(sys.argv[2]), int(sys.argv[3])
    for block in read_blocks(pdf, first, last):
        if isinstance(block, Heading):
            print(f"\n{'#' * block.level} {block.text}  [p{block.page}]")
        elif isinstance(block, Para):
            print(("  - " if block.listed else "  ") + block.text)
        elif isinstance(block, Quote):
            print(f"  > {block.text}")
        else:
            print(f"  [table p{block.page}{' wide' if block.wide else ''}]")
            for row in block.texts():
                print("    | " + " | ".join(row))
