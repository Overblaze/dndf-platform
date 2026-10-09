"""Reads the System Reference Document 5.2.1 into headings, paragraphs and tables.

The official PDF (https://www.dndbeyond.com/srd, CC-BY-4.0) is expected at ~/dndf/sources/srd/SRD_CC_v5.2.1.pdf.
`pdftohtml -xml` gives every piece of text with its position and font; in this document the fonts say
what a piece is:

    Gill Sans SemiBold 39      chapter title          Gill Sans SemiBold 16   a table's title
    Gill Sans SemiBold 27/21/18  headings 1, 2, 3     Gill Sans (SemiBold) 14/15  table cells (headers)
    Gill Sans SemiBold 23      a monster's name       Optima 14               a stat block
    Small-caps Gill Sans 18+13 a heading set in capitals and small capitals (spell names)
    Cambria 15                 body text

Pages are two columns (text starts at x = 95 and x = 470); a table may run across both.
See docs/EXTRACTION.md.
"""

from __future__ import annotations

import html
import re
import subprocess
from collections import Counter
from dataclasses import dataclass, field
from functools import lru_cache
from pathlib import Path

PDF = Path.home() / "dndf" / "sources" / "srd" / "SRD_CC_v5.2.1.pdf"
BOOK = "5e SRD 5.2.1"
ATTRIBUTION = (
    "This work includes material from the System Reference Document 5.2.1 (“SRD 5.2.1”) by Wizards of the Coast LLC, "
    "available at https://www.dndbeyond.com/srd. The SRD 5.2.1 is licensed under the Creative Commons Attribution 4.0 "
    "International License, available at https://creativecommons.org/licenses/by/4.0/legalcode."
)
GUTTER = 455        # a piece that starts left of this is in the left column
RIGHT_BASE = 470
FULL_STOP = r"([.!?:]|[.!?][”)])$"  # how a paragraph that has come to its end ends
FOOTER_TOP = 1105   # the running foot and the page number sit below this
HEADING_SIZES = {39: 0, 27: 1, 21: 2, 18: 3}
MONSTER_NAME = 23
STAT_NAME = 4   # heading level given to a stat block's name
STAT_PART = 5   # and to "Traits", "Actions", "Bonus Actions" … inside one
TABLE_TITLE = 16


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
    bold: bool
    italic: bool
    lead: str = ""  # the words in bold the piece begins with ("Slam.", "Immunities"), when it goes on in plain

    @property
    def right(self) -> int:
        return self.left + self.width


@dataclass
class Line:
    page: int
    top: int
    column: int  # 0 left, 1 right, -1 across both
    items: list[Item]
    kind: str = "body"  # heading | body | table | stat | tabletitle | abilities
    level: int = -1
    data: list | None = None  # an ability table's rows

    @property
    def left(self) -> int:
        return self.items[0].left

    @property
    def text(self) -> str:
        # Pieces that stand apart are separate words even when neither carries the space ("Expanding" "and").
        out = ""
        for n, item in enumerate(self.items):
            apart = n > 0 and item.left - self.items[n - 1].right > 3
            out += (" " if apart else "") + piece(item)
        return squeeze(out)


def piece(item: Item) -> str:
    return item.text


def squeeze(text: str) -> str:
    return re.sub(r"[ \t ]+", " ", text).strip()


@lru_cache(maxsize=1)
def _xml() -> str:
    return subprocess.run(["pdftohtml", "-xml", "-i", "-q", "-stdout", str(PDF)], check=True, capture_output=True, text=True).stdout


@lru_cache(maxsize=1)
def _pages() -> dict[int, str]:
    out: dict[int, str] = {}
    for chunk in re.split(r"<page ", _xml())[1:]:
        out[int(re.match(r'number="(\d+)"', chunk).group(1))] = chunk
    return out


@lru_cache(maxsize=1)
def _fonts() -> dict[str, tuple[str, int, str]]:
    return {m[0]: (re.sub(r"^[A-Z]+\+", "", m[2]), int(m[1]), m[3]) for m in re.findall(r'<fontspec id="(\d+)" size="(\d+)" family="([^"]+)" color="(#\w+)"', _xml())}


def page_count() -> int:
    return max(_pages())


def load_items(page: int) -> list[Item]:
    fonts = _fonts()
    items: list[Item] = []
    for top, left, width, _h, font, raw in re.findall(r'<text top="(-?\d+)" left="(-?\d+)" width="(\d+)" height="(\d+)" font="(\d+)">(.*?)</text>', _pages()[page], flags=re.S):
        if font not in fonts or int(top) >= FOOTER_TOP:
            continue
        family, size, color = fonts[font]
        text = html.unescape(re.sub(r"<[^>]+>", "", raw)).replace(" ", " ")
        # One and a half is printed as a 1 and a built fraction, which the text layer gives as "11/2" (twice in the document).
        text = re.sub(r"\b11/2\b", "1½", text)
        if not text.strip():
            continue
        # Capitals and small capitals are set as two sizes ("A" at 18 then "cid" at 13), and the text layer's
        # own upper and lower case for the small ones is not to be trusted ("plASh"): the size says which is which.
        if small_caps(family, size, "<b>" in raw):
            text = text.upper() if size >= 15 else text.lower()
        opening = re.match(r"\s*(?:<i>)?<b>(.*?)</b>", raw, flags=re.S)
        lead = squeeze(html.unescape(re.sub(r"<[^>]+>", "", opening.group(1)))) if opening else ""
        items.append(Item(page, int(top), int(left), int(width), family, size, color, text, "<b>" in raw or "SemiBold" in family, "<i>" in raw, lead))
    return items


def small_caps(family: str, size: int, bold: bool) -> bool:
    """A spell's name, a stat block's labels (the small-caps cut), or a sidebar's title (bold Gill Sans at 17 and 12)."""
    return "SC700" in family or (family == "GillSans" and bold and size in (17, 12))


def _kind(items: list[Item]) -> tuple[str, int]:
    caps = any(small_caps(i.family, i.size, i.bold) for i in items)
    first = max(items, key=lambda i: i.size) if caps else items[0]
    family, size = first.family, first.size
    if family == "GillSans" and first.bold and size == 17 and first.color != "#7b7879":
        return "sidebartitle", -1
    if "SC700" in family:
        # Capitals and small capitals: a spell's or an item's name (18), or a label inside a stat block (smaller).
        return ("heading", 3) if size >= 18 else ("stat", -1)
    if family.startswith("GillSans-SemiBold") and first.color == "#88191f":
        if size in HEADING_SIZES:
            return "heading", HEADING_SIZES[size]
        if size == MONSTER_NAME:
            return "heading", STAT_NAME
    if family == "GillSans" and size == 18 and first.color == "#88191f":
        return "heading", STAT_PART  # "Traits", "Actions" … inside a stat block
    if family.startswith("GillSans-SemiBold") and size == TABLE_TITLE:
        return "tabletitle", -1
    if family.startswith("Optima"):
        return "stat", -1
    if family.startswith("GillSans"):
        return "table", -1
    return "body", -1


def _wholly_bold(item: Item) -> bool:
    """Bold from end to end (a header cell), not a piece that only opens in bold ("Squares. Each square …")."""
    return "SemiBold" in item.family or (bool(item.lead) and item.lead == squeeze(item.text))


def _spans(item: Item) -> bool:
    """A piece that starts in the left column and runs into the right one: a wide table's cell or a wide heading.
    Body text never does (its measured width can overshoot by a few pixels, which is not a crossing)."""
    return item.left < GUTTER and item.right > RIGHT_BASE + 4 and not item.family.startswith("Cambria")


def _ability_tables(page: int, items: list[Item]) -> tuple[list[Item], list[Line]]:
    """A stat block's six ability scores. They are set as a little grid under three "MOD SAVE" headers: a capital
    and the rest of the label in small capitals ("S" + "tr"), then score, modifier and save. Taken out of the
    page's pieces and returned as lines of their own, each with its rows [label, score, modifier, save]."""
    heads = [i for i in items if i.size == 9 and i.text.strip() == "MOD SAVE"]
    groups: list[list[Item]] = []
    for head in sorted(heads, key=lambda i: (i.left >= GUTTER, i.top)):
        if groups and abs(groups[-1][0].top - head.top) <= 3 and (groups[-1][0].left < GUTTER) == (head.left < GUTTER):
            groups[-1].append(head)
        else:
            groups.append([head])
    taken: set[int] = set()
    lines: list[Line] = []
    for group in groups:
        top, side = group[0].top, group[0].left < GUTTER
        near = [i for i in items if (i.left < GUTTER) == side and top < i.top <= top + 50]
        caps = [i for i in near if "SC700" in i.family]
        # (One label in the document, the Adult White Dragon's "Con", is set whole in plain bold instead.)
        whole = [i for i in near if i.family == "GillSans" and i.size == 15 and i.bold and i.text.strip() in ("Str", "Dex", "Con", "Int", "Wis", "Cha")]
        values = [i for i in near if i.family == "GillSans" and i.size == 15 and not i.bold]
        big = sorted([i for i in caps if i.size >= 15] + whole, key=lambda i: (i.top - top > 22, i.left))  # two rows, 12 and 33 px under the header
        rows: list[list[str]] = []
        for n, cap in enumerate(big):
            tail = [i for i in caps if i.size < 15 and 0 <= i.left - cap.left <= 25 and 0 <= i.top - cap.top <= 8]
            after = [b.left for b in big if abs(b.top - cap.top) <= 3 and b.left > cap.left]
            edge = min(after) if after else cap.left + 130
            mine = sorted((v for v in values if abs(v.top - cap.top) <= 3 and cap.left < v.left < edge), key=lambda v: v.left)
            label = cap.text.strip() if cap in whole else cap.text.upper() + "".join(t.text.lower() for t in sorted(tail, key=lambda t: t.left))
            rows.append([label, *" ".join(v.text for v in mine).split()])
        for used in group + caps + whole + values:
            taken.add(id(used))
        lines.append(Line(page, top, 0 if side else 1, group, "abilities", -1, rows))
    return [i for i in items if id(i) not in taken], lines


def _wide_tables(items: list[Item]) -> list[tuple[int, int]]:
    """Where on the page a table runs across both columns, as (first top, last top). Its cells need not cross
    the gutter, so it is known by its header: a row of header cells on both sides at one height that do not
    say the same thing twice (two halves of one narrow table set side by side repeat their header), with no
    table title of its own on the right. It goes on down for as long as both sides hold nothing but cells."""
    def cell(i: Item) -> bool:
        return _kind([i])[0] == "table"

    def head(i: Item) -> bool:
        return cell(i) and i.bold and i.size == 14

    bands: list[list[Item]] = []
    for item in sorted(items, key=lambda i: i.top):
        if bands and item.top - bands[-1][0].top <= 3:
            bands[-1].append(item)
        else:
            bands.append([item])
    found: list[tuple[int, int]] = []
    n = 0
    while n < len(bands):
        band = bands[n]
        left = sorted((i for i in band if i.left < GUTTER), key=lambda i: i.left)
        right = sorted((i for i in band if i.left >= GUTTER), key=lambda i: i.left)
        top = band[0].top
        titled = any(_kind([i])[0] == "tabletitle" and i.left >= GUTTER and 0 <= top - i.top <= 45 for i in items)
        same = squeeze(" ".join(i.text for i in left)) == squeeze(" ".join(i.text for i in right))
        # (Just under the table's title the header may mix bold and plain: "Terrain" beside "Foraging DC".)
        under = any(_kind([i])[0] == "tabletitle" and i.left < GUTTER and 0 < top - i.top <= 30 for i in items)
        mixed = any(head(i) for i in left) and any(not head(i) for i in left)  # plain header cells on the left too
        heads = all(head(i) for i in band) or (under and mixed and all(cell(i) for i in band))
        if not (left and right and heads and not same and not titled):
            n += 1
            continue
        start, end = n, n
        while start > 0 and all(head(i) for i in bands[start - 1]) and bands[start][0].top - bands[start - 1][0].top <= 20:
            start -= 1
        while end + 1 < len(bands) and all(cell(i) for i in bands[end + 1]) and bands[end + 1][0].top - bands[end][0].top <= 60:
            end += 1
        if end - n >= 2:
            first = bands[start][0].top
            titles = [i.top for i in items if _kind([i])[0] == "tabletitle" and 0 < first - i.top <= 45]
            found.append((min(titles, default=first), bands[end][0].top + 3))
        n = end + 1
    return found


def build_lines(page: int) -> list[Line]:
    """Pieces that sit on one baseline in one column become a line."""
    items, lines = _ability_tables(page, sorted(load_items(page), key=lambda i: (i.top, i.left)))
    wide = _wide_tables(items)

    def across(i: Item) -> bool:
        return _spans(i) or (_kind([i])[0] in ("table", "tabletitle") and any(a <= i.top <= b for a, b in wide))

    rows: list[list[Item]] = []
    for item in items:
        for row in reversed(rows[-6:]):
            # Capitals and small capitals differ in height, so their tops differ by a few pixels.
            caps = small_caps(item.family, item.size, item.bold) and small_caps(row[0].family, row[0].size, row[0].bold)
            same = (item.left < GUTTER) == (row[0].left < GUTTER) or across(item) or any(across(i) for i in row)
            if abs(row[0].top - item.top) <= (9 if caps else 3) and same:
                row.append(item)
                break
        else:
            rows.append([item])
    for row in rows:
        row.sort(key=lambda i: i.left)
        left = [i for i in row if i.left < GUTTER]
        right = [i for i in row if i.left >= GUTTER]
        crosses = any(across(i) for i in row)
        for part, column in ((row, -1),) if crosses else ((left, 0), (right, 1)):
            if not part:
                continue
            kind, level = _kind(part)
            lines.append(Line(page, min(i.top for i in part), column, part, kind, level))
    return lines


def reading_order(lines: list[Line]) -> list[Line]:
    """Left column then right column, in bands between whatever runs across both."""
    spans = sorted((l for l in lines if l.column == -1), key=lambda l: l.top)
    # A wide table is many spanning rows one after another: the columns above it come first, then all of it.
    out: list[Line] = []
    floor = -10_000
    i = 0
    while i <= len(spans):
        ceiling = spans[i].top if i < len(spans) else 10_000
        band = [l for l in lines if l.column != -1 and floor <= l.top < ceiling]
        for column in (0, 1):
            out.extend(sorted((l for l in band if l.column == column), key=lambda l: l.top))
        if i < len(spans):
            out.append(spans[i])
            floor = spans[i].top
        i += 1
    return out


@dataclass
class Heading:
    level: int
    text: str
    page: int


@dataclass
class Para:
    text: str
    page: int
    stat: bool = False
    lead: str = ""  # its opening words in bold: a run-in heading ("Unknown Spell.") or a stat block's label ("Senses")


@dataclass
class Table:
    title: str
    rows: list[list[str]]
    page: int
    wide: bool = False
    over: list[tuple[str, int, int]] = field(default_factory=list)  # headers set over several columns: text, first, last
    notes: list[str] = field(default_factory=list)  # footnotes under it ("*Halve the value for a consumable …")
    head: bool = True  # whether its first row is a header


@dataclass
class Abilities:
    """A stat block's ability scores: [label, score, modifier, save] six times."""
    rows: list[list[str]]
    page: int


@dataclass
class Sidebar:
    title: str
    paragraphs: list[str]
    page: int


@dataclass
class Facts:
    """Labels and their values: "Casting Time: Action", "Size: Medium (about 4–7 feet tall)"."""
    rows: list[tuple[str, str]]
    page: int


Block = Heading | Para | Table | Sidebar | Facts | Abilities


@lru_cache(maxsize=1)
def vocabulary() -> tuple[Counter, Counter]:
    """Every word that appears whole within a line, and every hyphenated compound, in the document."""
    words: Counter = Counter()
    joined: Counter = Counter()
    for page in range(1, page_count() + 1):
        for item in load_items(page):
            for token in re.findall(r"[A-Za-z]+(?:-[A-Za-z]+)+", item.text):
                joined[token.lower()] += 1
            body = item.text.rstrip()
            body = body[: body.rfind(" ") + 1] if body.endswith("-") else body  # a word cut at the line's end is not evidence
            for token in re.findall(r"[A-Za-z]+", body):
                words[token.lower()] += 1
    return words, joined


def join_lines(texts: list[str]) -> str:
    """Lines of one paragraph as running text. A word cut at a line's end is put back together; a hyphen that
    belongs to the word ("long-term") is kept, judged by how the document writes that word elsewhere."""
    words, joined = vocabulary()
    out = ""
    for text in texts:
        text = text.strip()
        if not out:
            out = text
            continue
        cut = re.search(r"([A-Za-z]+)-$", out)
        start = re.match(r"([A-Za-z]+)", text)
        if cut and start:
            whole = (cut.group(1) + start.group(1)).lower()
            compound = f"{cut.group(1)}-{start.group(1)}".lower()
            # Kept as a compound only when the document writes it so elsewhere and never as one word.
            keep = joined[compound] > 0 and words[whole] == 0
            out = out + text if keep else out[:-1] + text
        else:
            out = f"{out} {text}"
    return squeeze(out)


def _runs(line: Line) -> list[tuple[int, int, str]]:
    """A line's pieces joined where they touch: a cell with a word in bold or italics comes as several pieces
    ("on a ", "1", ", ", "Enlarge/Reduce"), and only the first of them says where the cell begins."""
    runs: list[tuple[int, int, str]] = []
    for item in sorted(line.items, key=lambda i: i.left):
        if runs and item.left - runs[-1][1] <= 6:
            left, right, text = runs[-1]
            # (Touching pieces are one word or carry their own space; a small gap between two that carry none is a space.)
            gap = " " if item.left - right > 2 and not text.endswith(" ") and not item.text.startswith(" ") else ""
            runs[-1] = (left, max(right, item.right), text + gap + item.text)
        else:
            runs.append((item.left, item.right, item.text))
    return runs


def _several(text: str) -> bool:
    words = text.split()
    return len(words) > 1 and all(re.fullmatch(r"[—–-]|\+?\d+", w) for w in words)


RIGHT_SHIFT = RIGHT_BASE - 95  # a table that goes on in the right column is the same table, 375 px over


def _header_lines(lines: list[Line]) -> int:
    """How many lines at the top are the header. It may take two ("Proficiency" over "Bonus"); a wide one may
    mix bold and plain ("Terrain" beside "Foraging DC")."""
    def head(line: Line) -> bool:
        bold = sum(1 for i in line.items if i.bold)
        return bold == len(line.items) or (bold >= 2 and len(line.items) >= 4)

    heads = 0
    while heads < len(lines) - 1 and head(lines[heads]) and (heads == 0 or 0 < lines[heads].top - lines[heads - 1].top <= 20):
        heads += 1
    return heads


def _layout(lines: list[Line]) -> tuple[list[int], list[list[tuple[int, int, str, int]]], int]:
    """Where a table's columns begin, each line's runs with the column each belongs to (-1: none of its own),
    and how many lines are header. The columns are found from the rows under the header: cells of one column
    either start together (text) or are centred on one another (numbers), and a place only one or two cells
    stand is a stray. The header is then laid over them a word at a time, because the text layer often gives
    several header cells, or all of them, as one piece ("Amount Storage")."""
    heads = _header_lines(lines)
    runs: list[tuple[int, int, int, str]] = []
    top: list[tuple[int, int, int, str]] = []
    for n, line in enumerate(lines):
        shift = RIGHT_SHIFT if line.column == 1 else 0
        (top if n < heads else runs).extend((n, left - shift, right - shift, text) for left, right, text in _runs(line))
    group = list(range(len(runs)))

    def find(k: int) -> int:
        while group[k] != k:
            group[k] = group[group[k]]
            k = group[k]
        return k

    def alike(la: int, ra: int, ta: str, lb: int, rb: int, tb: str) -> bool:
        # (A piece that is several cells at once, "1 — —", is centred on nothing.)
        plain = not _several(ta) and not _several(tb)
        narrow = ra - la <= 110 and rb - lb <= 110 and plain
        # Longer cells centred on one another to the pixel are one column too ("1 charge per spell level" over "(maximum 4 …").
        centred = ra - la <= 200 and rb - lb <= 200 and plain and abs((la + ra) - (lb + rb)) <= 6
        return abs(lb - la) <= 16 or (narrow and abs((la + ra) - (lb + rb)) <= 20) or centred

    order = sorted(range(len(runs)), key=lambda k: runs[k][1])
    for x, a in enumerate(order):
        _n, la, ra, ta = runs[a]
        for b in order[x + 1:]:
            _m, lb, rb, tb = runs[b]
            if lb - la > 140:
                break
            if alike(la, ra, ta, lb, rb, tb):
                group[find(a)] = find(b)
    members: dict[int, list[int]] = {}
    for k in range(len(runs)):
        members.setdefault(find(k), []).append(k)
    need = max(2, (len(lines) - heads) // 6)

    def named(ks: list[int]) -> bool:
        # A header cell of its own names a column even when few rows have anything in it (a spell slot table's "9").
        return any(len(t.split()) == 1 and alike(l, r, t, runs[k][1], runs[k][2], runs[k][3]) for _n, l, r, t in top for k in ks)

    kept = sorted((min(runs[k][1] for k in ks), root) for root, ks in members.items() if len(ks) >= need or named(ks))
    if not kept:
        kept = [(min(r[1] for r in runs), find(order[0]))]
    starts = [start for start, _root in kept]
    index = {root: c for c, (_start, root) in enumerate(kept)}
    per_line: list[list[tuple[int, int, str, int]]] = [[] for _ in lines]
    for k, (n, left, right, text) in enumerate(runs):
        per_line[n].append((left, right, text, index.get(find(k), -1)))
    for n, left, right, text in top:
        if text.strip().startswith("—"):
            per_line[n].append((left, right, text, -1))  # set over several columns; _table deals with it
            continue
        # Each word goes to the last column that begins before the word ends (a header may be centred over
        # its numbers, so it can begin before they do).
        at = 0
        for word in text.split():
            at = text.index(word, at)
            x0 = left + (right - left) * at / max(1, len(text))
            x1 = left + (right - left) * (at + len(word)) / max(1, len(text))
            column = max((c for c, start in enumerate(starts) if start <= x1 - 4), default=0)
            last = per_line[n][-1] if per_line[n] else None
            if last and last[3] == column:
                per_line[n][-1] = (last[0], int(x1), f"{last[2]} {word}", column)
            else:
                per_line[n].append((int(x0), int(x1), word, column))
            at += len(word)
    return starts, per_line, heads


def _cells(runs: list[tuple[int, int, str, int]], starts: list[int], spanning: bool = False) -> list[str]:
    cells = [""] * len(starts)
    placed = []
    for left, right, text, column in sorted(runs):
        if column < 0:
            # A stray: it belongs to the last column that starts at or before it.
            column = max((k for k, start in enumerate(starts) if left >= start - 4), default=0)
        placed.append((left, right, text, column))
    taken = {c for _l, _r, _t, c in placed}
    for left, right, text, column in placed:
        parts = [(column, text)]
        following = starts[column + 1] if column + 1 < len(starts) else None
        # Several cells given as one piece ("2 — — — — — — — —" under nine headers): one word to each column it lies over.
        over = [c for c in range(column + 1, len(starts)) if starts[c] < right - 4]
        free = over[: next((n for n, c in enumerate(over) if c in taken), len(over))]
        words = text.split()
        if free and len(words) == len(free) + 1:
            parts = [(column + n, word) for n, word in enumerate(words)]
        elif free and " " in text.strip() and not spanning:
            # Cells the text layer gave as one piece ("86–90 A Hostile", "1d10 Damage Type"): cut at the space
            # nearest each column it runs well into.
            body = text.rstrip()
            parts, begun, where = [], 0, column
            for c in free:
                spaces = [m.start() for m in re.finditer(" ", body) if m.start() > begun and body[begun: m.start()].strip()]
                if right <= starts[c] + 30 or not spaces:
                    break
                at = min(spaces, key=lambda k: abs(left + (right - left) * k / max(1, len(text)) - starts[c]))
                parts.append((where, body[begun:at]))
                begun, where = at, c
            parts.append((where, body[begun:]))
        for where, words in parts:
            cells[where] = squeeze(f"{cells[where]} {words}") if cells[where] else squeeze(words)
    return cells


def _pairs(lines: list[Line]) -> list[list[str]] | None:
    """A list of short forms and their meanings set as two lists side by side ("AC Armor Class … M Material
    component"), each keeping its own line spacing, so the two do not line up as rows. Read one list, then the other."""
    items = [i for line in lines for i in line.items]
    keys = [i for i in items if i.bold and i.size == 15]
    spots = sorted({i.left for i in keys})
    columns = [s for n, s in enumerate(spots) if n == 0 or s - spots[n - 1] > 40]
    # Only that: every bold piece is a short form, standing at one of two places.
    plain = len(keys) == len([i for i in items if i.bold]) and all(any(abs(i.left - c) <= 3 for c in columns) for i in keys)
    if not plain or len(columns) != 2 or len(keys) < 8 or len({l.column for l in lines}) != 1 or len({l.page for l in lines}) != 1:
        return None
    rows: list[list[str]] = []
    for n, start in enumerate(columns):
        end = columns[n + 1] if n + 1 < len(columns) else 10_000
        mine = sorted((i for i in keys if abs(i.left - start) <= 40 and i.left < end), key=lambda i: i.top)
        for k, key in enumerate(mine):
            until = mine[k + 1].top - 4 if k + 1 < len(mine) else 10_000
            meaning = sorted((i for i in items if not i.bold and key.left < i.left < end and key.top - 4 <= i.top < until), key=lambda i: (i.top, i.left))
            rows.append([squeeze(key.text), join_lines([i.text for i in meaning])])
    return rows


def _table(title: str, lines: list[Line]) -> Table:
    pairs = None if title else _pairs(lines)
    if pairs:
        return Table(title, pairs, lines[0].page, head=False)
    # Footnotes under the table run across its columns; they are not rows.
    notes: list[str] = []
    foot = next((n for n, line in enumerate(lines) if n > 1 and re.match(r"[*†‡]", line.text)), None)
    if foot is not None:
        for line in lines[foot:]:
            if re.match(r"[*†‡]", line.text) or not notes:
                notes.append(line.text)
            else:
                notes[-1] = join_lines([notes[-1], line.text])
        lines = lines[:foot]
    starts, per_line, heads = _layout(lines)
    numbered = [bool(re.match(r"\d[\d–-]*\s+\S", l.text)) for l in lines]
    if len(starts) == 1 and len(lines[0].text.split()) == 2 and len(lines) > 3 and numbered[1] and sum(numbered[1:]) >= len(lines) // 2:
        # Every row came as one piece ("01–08 Bag of 100 GP" under "1d100 Patch"): the number is the first column,
        # and a line without one is the rest of the row above.
        rows = [lines[0].text.split()]
        for line, new in list(zip(lines, numbered))[1:]:
            if new:
                rows.append(line.text.split(None, 1))
            else:
                rows[-1][1] = join_lines([rows[-1][1], line.text])
        return Table(title, rows, lines[0].page, notes=notes)
    if len(starts) == 1:
        # One column: a list, a line to a row. A formula ("Spell save DC = 8 + …") or a bullet may take two lines.
        rows = []
        for n, line in enumerate(lines):
            text = line.text
            tight = n > 0 and line.page == lines[n - 1].page and 0 < line.top - lines[n - 1].top <= 20
            more = tight and rows and ((" = " in rows[-1][0] and " = " not in text) or (rows[0][0].startswith("•") and not text.startswith("•")))
            if more:
                rows[-1][0] = join_lines([rows[-1][0], text])
            else:
                rows.append([text])
        return Table(title, rows, lines[0].page, notes=notes, head=False)
    rows: list[list[str]] = []
    previous: Line | None = None
    over: list[tuple[str, int, int]] = []
    for n, line in enumerate(lines):
        bold = all(i.bold for i in line.items)
        heading = n < heads
        if heading:
            # A header set over several columns ("——Spell Slots per Spell Level——"): kept apart, with the columns it covers.
            for run in list(per_line[n]):
                under = [c for c, start in enumerate(starts) if run[0] - 8 <= start < run[1]]
                if run[3] == -1 and len(under) >= 2 and run[2].strip().startswith("—"):
                    over.append((squeeze(run[2].strip("—- ")), under[0], under[-1]))
                    per_line[n].remove(run)
            if not per_line[n]:
                continue
        cells = _cells(per_line[n], starts, heading)
        # A header row the text layer gave as one piece ("1d100 Trinket"): one word to a column when they match.
        if n == 0 and heads and len(line.items) == 1 and len(starts) > 1:
            parts = re.split(r"\s{2,}", line.items[0].text.strip())
            words = line.items[0].text.split()
            cells = parts if len(parts) == len(starts) else words if len(words) == len(starts) else cells
        close = previous is not None and line.page == previous.page and 0 < line.top - previous.top <= 20
        # The rest of a cell that ran onto another line: set tight under it, with nothing in the first column
        # (or nothing but the first column, when that is the cell that ran on).
        wrapped = close and (not cells[0] or sum(1 for c in cells if c) == 1)
        if rows and n > 0 and (heading or (wrapped and n > 1 and not all(i.bold for i in previous.items))):
            rows[-1] = [join_lines([a, b]) if a and b else a or b for a, b in zip(rows[-1], cells)]
        elif rows and bold and cells == rows[0]:
            pass  # the header again, where the table goes on in the next column or on the next page
        else:
            rows.append(cells)
        previous = line
    # Two columns never told apart because every row gave them as one piece ("13 14" under "Dex. Con."): as many
    # columns as every row has numbers there.
    c = 0
    while rows and len(rows) > 2 and c < len(rows[0]):
        counts = {len(r[c].split()) for r in rows}
        if len(counts) == 1 and min(counts) > 1 and all(_several(r[c]) for r in rows[1:]) and not over:
            rows = [r[:c] + r[c].split() + r[c + 1:] for r in rows]
        c += 1
    # A column that has only its header, beside one that has everything but: the header stood off to one side.
    c = 0
    while rows and c < len(rows[0]):
        lonely = rows[0][c] and not any(r[c] for r in rows[1:])
        beside = next((d for d in (c + 1, c - 1) if 0 <= d < len(rows[0]) and not rows[0][d] and any(r[d] for r in rows[1:])), None)
        if lonely and beside is not None and len(rows) > 1 and not over:
            rows[0][beside] = rows[0][c]
            rows = [r[:c] + r[c + 1:] for r in rows]
            continue
        c += 1
    return Table(title, rows, lines[0].page, any(l.column == -1 for l in lines), over, notes, heads > 0)


def to_blocks(first: int, last: int) -> list[Block]:
    blocks: list[Block] = []
    lines: list[Line] = []
    for page in range(first, last + 1):
        lines.extend(reading_order(build_lines(page)))

    para: list[Line] = []
    table: list[Line] = []
    title = ""
    sidebar: Sidebar | None = None
    side_lines: list[Line] = []
    side_left = 0

    def flush_sidebar() -> None:
        nonlocal sidebar, side_lines
        if sidebar is None:
            return
        chunk: list[Line] = []
        for line in side_lines + [None]:  # type: ignore[list-item]
            if line is None or (chunk and (line.top - chunk[-1].top >= 21 or line.page != chunk[-1].page and re.search(FULL_STOP, chunk[-1].text) or "".join(i.text for i in line.items).startswith("  ") or bool(re.search(r"[.:]$", line.items[0].lead)))):
                if chunk:
                    sidebar.paragraphs.append(join_lines([l.text for l in chunk]))
                chunk = []
            if line is not None:
                chunk.append(line)
        blocks.append(sidebar)
        sidebar, side_lines = None, []

    def flush_para() -> None:
        nonlocal para
        if para:
            text = join_lines([l.text for l in para])
            lead = para[0].items[0].lead
            # (A name in bold that runs onto a second piece, "Goat of" + "Traveling.", is taken up to its full stop.)
            if lead and not re.search(r"[.:]$", lead) and para[0].kind != "stat":
                more = re.match(re.escape(lead) + r"[^.:]{0,40}[.:]", text)
                lead = more.group(0) if more and len(para[0].items) > 1 and para[0].items[1].bold else ""
            blocks.append(Para(text, para[0].page, para[0].kind == "stat", lead if text.startswith(lead) and 0 < len(lead) < min(len(text), 90) else ""))
            para = []

    def flush_table() -> None:
        nonlocal table, title
        if table:
            blocks.append(_table(title, table))
        elif title:
            blocks.append(Para(title, 0))
        table, title = [], ""

    for line in lines:
        if line.kind == "sidebartitle":
            flush_para(); flush_table(); flush_sidebar()
            sidebar, side_left = Sidebar(line.text, [], line.page), line.left
            continue
        # A sidebar's text: Gill Sans starting where its title starts (a little in for a list), in this column or,
        # where it runs on, the next. A row of nothing but bold is the header of a table that follows it.
        aside = sidebar is not None and line.kind == "table" and not all(_wholly_bold(i) for i in line.items)
        if aside and min((line.left - side_left - shift for shift in (0, RIGHT_SHIFT, -RIGHT_SHIFT)), key=abs) in range(-3, 26):
            side_lines.append(line)
            continue
        if sidebar is not None:
            flush_sidebar()
        if line.kind == "abilities":
            flush_para(); flush_table()
            blocks.append(Abilities(line.data or [], line.page))
            continue
        if line.kind == "heading":
            flush_para(); flush_table()
            # A heading that wraps onto a second line of the same size is one heading.
            last_block = blocks[-1] if blocks else None
            if isinstance(last_block, Heading) and last_block.level == line.level and last_block.page == line.page and getattr(to_blocks, "_last_top", -99) + 62 >= line.top and to_blocks._last_col == line.column:  # type: ignore[attr-defined]
                last_block.text = squeeze(f"{last_block.text} {line.text}")
            else:
                blocks.append(Heading(line.level, line.text, line.page))
            to_blocks._last_top, to_blocks._last_col = line.top, line.column  # type: ignore[attr-defined]
            continue
        if line.kind == "tabletitle":
            flush_para(); flush_table()
            title = line.text
            continue
        if line.kind == "table":
            flush_para()
            first = line.items[0]
            label = first.bold and first.text.strip().endswith(":") and "SemiBold" in first.family
            going = bool(blocks) and isinstance(blocks[-1], Facts) and not table and not title
            if label and not table and not title:
                # A label in bold and its value beside it. The value may run on for several lines.
                value = join_lines(["".join(i.text for i in line.items[1:])]) if len(line.items) > 1 else ""
                if going and getattr(to_blocks, "_fact", None) is not None and (line.page != to_blocks._fact.page or line.column != to_blocks._fact.column or 0 < line.top - to_blocks._fact.top <= 30):  # type: ignore[attr-defined]
                    blocks[-1].rows.append((first.text.strip()[:-1], value))
                else:
                    blocks.append(Facts([(first.text.strip()[:-1], value)], line.page))
                to_blocks._fact = line  # type: ignore[attr-defined]
                continue
            fact = getattr(to_blocks, "_fact", None)
            follows = fact is not None and line.page == fact.page and 0 < line.top - fact.top <= 21 and line.column == fact.column
            # Its value may run on at the top of the next column or page: it does when it had not come to an end.
            carries = fact is not None and (line.page != fact.page or line.column != fact.column) and bool(blocks) and isinstance(blocks[-1], Facts) and bool(re.search(r"[-,(]$|[a-z0-9]$", blocks[-1].rows[-1][1])) and bool(re.match(r"[a-z(0-9]", line.text))
            if going and not first.lead and (follows or carries):
                name, value = blocks[-1].rows[-1]
                blocks[-1].rows[-1] = (name, join_lines([value, line.text]) if value else line.text)
                to_blocks._fact = line  # type: ignore[attr-defined]
                continue
            to_blocks._fact = None  # type: ignore[attr-defined]
            table.append(line)
            continue
        to_blocks._fact = None  # type: ignore[attr-defined]
        flush_table()
        raw = "".join(i.text for i in line.items)
        previous = para[-1] if para else None
        new = (
            previous is None
            or previous.kind != line.kind
            or raw.startswith("  ")                                   # a run-in heading, set off by an indent
            or (line.page == previous.page and line.column == previous.column and line.top - previous.top >= 23)
            or (line.items[0].bold and line.left < previous.left - 6)  # a hanging list: the next item starts back at the margin
            or (line.kind == "stat" and bool(line.items[0].lead) and line.left <= previous.left + 3)  # a stat block's next entry
            # At the top of a new column or page nothing on the page says whether a paragraph goes on:
            # it does unless the text before it had come to a full stop.
            or ((line.page != previous.page or line.column != previous.column) and bool(re.search(FULL_STOP, previous.text)))
        )
        if new:
            flush_para()
        para.append(line)
    flush_para(); flush_table(); flush_sidebar()
    return _rejoin(blocks)


def _rejoin(blocks: list[Block]) -> list[Block]:
    """A table or a sidebar set in the middle of a paragraph cuts it in two. The second half starts in lower
    case and the first has no full stop: they are put back together, ahead of what stood between them."""
    out: list[Block] = []
    for block in blocks:
        if isinstance(block, Para) and not block.stat and re.match(r"[a-z]", block.text):
            back = len(out) - 1
            while back >= 0 and isinstance(out[back], (Table, Sidebar, Facts)):
                back -= 1
            before = out[back] if back >= 0 else None
            if isinstance(before, Para) and not before.stat and back < len(out) - 1 and not re.search(FULL_STOP, before.text):
                before.text = join_lines([before.text, block.text])
                continue
        out.append(block)
    return out


def outline(first: int, last: int) -> list[Heading]:
    return [b for b in to_blocks(first, last) if isinstance(b, Heading)]
