# -*- coding: utf-8 -*-
"""Generates the Boomtown design-canvas artboards from one shared game state."""
import json, os, io

OUT = os.path.dirname(os.path.abspath(__file__))
COLS = list(range(1, 13))
ROWS = list("ABCDEFGHI")

# ---------------------------------------------------------------- rules data
PRICE_ROWS = [200, 300, 400, 500, 600, 700, 800, 900, 1000, 1100, 1200]
PRIMARY    = [2000, 3000, 4000, 5000, 6000, 7000, 8000, 9000, 10000, 11000, 12000]
SECOND2015 = [1500, 2200, 3000, 3700, 4200, 5000, 5700, 6200, 7000, 7700, 8200]
TERTIARY   = [1000, 1500, 2000, 2500, 3000, 3500, 4000, 4500, 5000, 5500, 6000]
BANDS_CLASSIC = ["2", "3", "4", "5", "6–10", "11–20", "21–30", "31–40", "41+"]
BANDS_2015    = ["2", "3", "4", "5", "6–7", "8–17", "18–27", "28–37", "38+"]

def band_index(size, edition="classic"):
    if size < 2: return None
    cuts = [2, 3, 4, 5, 10, 20, 30, 40] if edition == "classic" else [2, 3, 4, 5, 7, 17, 27, 37]
    for i, c in enumerate(cuts):
        if size <= c: return i
    return 8

def row_index(size, tier, edition="classic"):
    b = band_index(size, edition)
    return None if b is None else b + (tier - 1)

def price(size, tier, edition="classic"):
    r = row_index(size, tier, edition)
    return None if r is None else PRICE_ROWS[r]

# ---------------------------------------------------------------- game state
# One company per industry is drawn into each game, so there are always seven,
# always one of each, and the industry marks stay unique on the board.
POOL = {
  "books":       (1, "#D9A425", "#221E12", [
      ("Chapter Eleven",   "books, coffee, denial",             "Borders"),
      ("Woolyworth",       "everything, sort of, cheap",        "Woolworth"),
      ("Seers Roebeck",    "the catalogue was the internet",    "Sears Roebuck"),
      ("Waldenbust",       "the finest bookstore at your local airport",          "Waldenbooks")]),
  "electronics": (1, "#C64A20", "#FFFFFF", [
      ("Radio Hut",        "batteries, phones and $70 HDMI cables",   "RadioShack"),
      ("Circuit Village",  "the warranty is the product",       "Circuit City"),
      ("Compuwas",         "beige boxes, bold promises",        "CompUSA"),
      ("Fried Electronics","an aisle of cables you don't need", "Fry's")]),
  "air":         (2, "#2C5AA0", "#FFFFFF", [
      ("Pan-Atlas",        "the glamour of air travel",         "Pan Am"),
      ("Transworld Air",   "wings over everywhere",             "TWA"),
      ("Braniffle",        "the plane is painted orange",       "Braniff"),
      ("Concordia",        "there at breakfast, broke by lunch","Concorde")]),
  "energy":      (2, "#2C7A57", "#FFFFFF", [
      ("Enrun",            "energy, creatively accounted",      "Enron"),
      ("Texicorps",        "a star, a pump, a lawsuit",         "Texaco"),
      ("Standard Oyl",     "too big, then thirty-four pieces",  "Standard Oil"),
      ("Wattage",          "power, unapologetically",           "generic utility")]),
  "tech":        (2, "#6B4B98", "#FFFFFF", [
      ("Blackcurrant",     "the keyboard people",               "BlackBerry"),
      ("Noquia",           "indestructible, briefly essential", "Nokia"),
      ("Palmistry",        "the future, in your palm, in 1998", "Palm"),
      ("Netscapade",       "we were the internet once",         "Netscape")]),
  "video":       (3, "#AE3462", "#FFFFFF", [
      ("Megahit Video",    "be kind, rewind",                   "Blockbuster"),
      ("Tinseltown Video", "new releases and 42 copies of 'Next Friday'",   "Hollywood Video"),
      ("Fotomatic",        "one hour, one kiosk, one photo",    "Fotomat"),
      ("Tower of Records", "listening booths, teenage employees and no returns",   "Tower Records")]),
  "toys":        (3, "#22808F", "#FFFFFF", [
      ("Toys \u042f Were",     "where a kid was a customer",        "Toys R Us"),
      ("Kaybee Toyworks",  "the mall's loudest storefront",     "KB Toys"),
      ("Chuck E. Wheeze",  "animatronics and birthday grief",   "Chuck E. Cheese"),
      ("Discovery Zonked", "a ball pit of uncertain hygiene",   "Discovery Zone")]),
}
ORDER = ["books", "electronics", "air", "energy", "tech", "video", "toys"]
DRAW = {k: 0 for k in ORDER}          # which candidate this game drew
CORP = {}
for _k in ORDER:
    _tier, _col, _ink, _cands = POOL[_k]
    _name, _flavor, _riff = _cands[DRAW[_k]]
    CORP[_k] = dict(key=_k, name=_name, tier=_tier, color=_col, ink=_ink,
                    flavor=_flavor, riff=_riff)

TILES = {
  "books":     ["2C","3C","4C","5C","2D","3D","4D","5D","2E","3E","4E"],
  "electronics":     ["9A","10A","11A","10B"],
  "tech":  ["8D","7E","8E","7F","8F","7G","8G"],
  "energy": ["11E","10F","11F","12F","10G","11G"],
  "video":  ["2G","3G","4G","5G","2H","3H","4H","5H","2I","3I","4I","5I"],
}
EATEN = {"video": ["air"]}
HQ = {"books": "3D", "electronics": "10A", "tech": "7F", "energy": "11F", "video": "3H"}
UNINC = ["1A", "6B", "12I"]

SIZE = {k: len(v) for k, v in TILES.items()}
for k in ORDER: SIZE.setdefault(k, 0)

PLAYERS = [
  # name, cash, holdings
  ("You",   4700, {"books":4, "electronics":2, "tech":5, "energy":3, "video":1}),
  ("Nadia", 8200, {"books":6, "electronics":0, "tech":3, "energy":3, "video":4}),
  ("Ravi",  2300, {"books":2, "electronics":3, "tech":1, "energy":0, "video":6}),
  ("June",  5900, {"books":1, "electronics":3, "tech":2, "energy":1, "video":5}),
]
def held(key): return sum(p[2].get(key, 0) for p in PLAYERS)
BANK = {k: 25 - held(k) for k in ORDER}

# hand: tile, effect-kind, one-line consequence
HAND = [
  ("6A",  "found", "Founds a corporation with 6B"),
  ("9B",  "grow",  "Radio Hut grows to 5"),
  ("9F",  "merge", "Blackcurrant absorbs Enrun"),
  ("3F",  "dead",  "Would merge two safe corporations"),
  ("12H", "found", "Founds a corporation with 12I"),
  ("7C",  "none",  "No effect — isolated tile"),
]
SELECTED = "9F"
TARGETS = {t[0]: t[1] for t in HAND}

# derived market
# ---------------------------------------------------------------- merged names
import re as _re

def _letters(n):
    return "".join(ch for ch in n if ("a" <= ch <= "z") or ("A" <= ch <= "Z"))

def _syls(word):
    """Rough syllable split: break after a vowel run when the next consonant is
    followed by a vowel (VCV), or between two consonants that precede one (VCCV)."""
    w, v, out, cur, i = word.lower(), "aeiouy", [], "", 0
    while i < len(w):
        cur += w[i]
        if w[i] in v:
            j = i + 1
            while j < len(w) and w[j] in v:
                cur += w[j]; j += 1
            if j < len(w) - 1 and w[j] not in v and w[j + 1] in v:
                out.append(cur); cur = ""
            elif j < len(w) - 2 and w[j] not in v and w[j + 1] not in v and w[j + 2] in v:
                cur += w[j]; j += 1
                out.append(cur); cur = ""
            i = j
        else:
            i += 1
    if cur:
        out.append(cur)
    return out or [w]

def stem(name, keep=0.75):
    """The part of a corporation's own name it keeps forever. Computed once, from
    the base name, and never shortened again."""
    p = _letters(name)
    return p[:max(2, int(round(keep * len(p))))].capitalize()

def fragment(name, minlen=3, maxlen=6):
    """What a corporation leaves behind when it is swallowed: the tail of its last
    real word, split by syllable."""
    words = [w for w in (_letters(x) for x in _re.split(r"[^A-Za-z\u0400-\u04FF]+", name)) if len(w) > 1]
    if not words:
        return _letters(name)[-minlen:].lower()
    sy = _syls(words[-1])
    frag, k = sy[-1], 2
    while len(frag) < minlen and k <= len(sy):
        frag, k = "".join(sy[-k:]), k + 1
    return frag[-maxlen:]

def display_name(base, eaten, keep=0.75, collapse=True):
    """Derived, never stored: the corporation's stem plus one fragment for every
    corporation it has ever absorbed, in the order it absorbed them."""
    out = stem(base, keep)
    for name in eaten:
        f = fragment(name)
        if collapse and out and f and out[-1].lower() == f[0].lower():
            f = f[1:]
        out += f
    return out

def market(edition="classic"):
    rows = []
    for k in ORDER:
        c, s_ = CORP[k], SIZE[k]
        p = price(s_, c["tier"], edition)
        r = row_index(s_, c["tier"], edition)
        eaten = EATEN.get(k, [])
        flavors = [c["flavor"]] + [CORP[e]["flavor"] for e in eaten]
        rows.append(dict(c, size=s_, price=p,
                         primary=PRIMARY[r] if r is not None else None,
                         second=SECOND2015[r] if r is not None else None,
                         tertiary=TERTIARY[r] if r is not None else None,
                         bank=BANK[k], safe=s_ >= 11,
                         mine=PLAYERS[0][2].get(k, 0),
                         eaten=eaten, slots=len(flavors),
                         flavor=" · ".join(flavors),
                         display=display_name(c["name"], [CORP[e]["name"] for e in eaten]) if eaten else c["name"]))
    return rows

def money(n): return "$" + format(n, ",d")

# ---------------------------------------------------------------- board cells
def cell_state(tile):
    for k, ts in TILES.items():
        if tile in ts: return ("corp", k)
    if tile in UNINC: return ("uninc", None)
    if tile in TARGETS: return ("target", TARGETS[tile])
    return ("empty", None)

def board(cell=58, gap=5, hdr=24, *, empty_bg, empty_ink, grid_ink, uninc_bg,
          accent, radius=3, label_size=10, header_ink=None, ring=None, font_w=600):
    header_ink = header_ink or empty_ink
    ring = ring or accent
    out = ['<div style="display:grid;grid-template-columns:%dpx repeat(12, %dpx);'
           'grid-auto-rows:%dpx;gap:%dpx">' % (hdr, cell, cell, gap)]
    out.append('<div style="height:%dpx"></div>' % hdr)
    for c in COLS:
        out.append('<div style="display:flex;align-items:center;justify-content:center;'
                   'font-size:11px;letter-spacing:.08em;color:%s;height:%dpx">%d</div>' % (header_ink, hdr, c))
    for r in ROWS:
        out.append('<div style="display:flex;align-items:center;justify-content:center;'
                   'font-size:11px;letter-spacing:.08em;color:%s">%s</div>' % (header_ink, r))
        for c in COLS:
            t = "%d%s" % (c, r)
            kind, meta = cell_state(t)
            base = ('display:flex;align-items:center;justify-content:center;border-radius:%dpx;'
                    'font-size:%dpx;font-weight:%d;letter-spacing:.04em;' % (radius, label_size, font_w))
            if kind == "corp":
                co = CORP[meta]
                inner = t
                if HQ.get(meta) == t:
                    inner = ('<div style="display:flex;flex-direction:column;align-items:center;gap:2px">'
                             '<div style="width:22px;height:22px;border-radius:50%%;background:%s;color:%s;'
                             'display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700">%s</div>'
                             '<div style="font-size:9px;opacity:.85;letter-spacing:.06em">%s</div></div>'
                             % (co["ink"], co["color"], co["name"][0], t))
                out.append('<div style="%sbackground:%s;color:%s">%s</div>' % (base, co["color"], co["ink"], inner))
            elif kind == "uninc":
                out.append('<div style="%sbackground:%s;color:#FFFFFF">%s</div>' % (base, uninc_bg, t))
            elif kind == "target":
                if meta == "merge":
                    out.append('<div style="%sbackground:%s;color:#FFFFFF;box-shadow:0 0 0 3px %s">%s</div>'
                               % (base, accent, accent, t))
                elif meta == "dead":
                    out.append('<div style="%sbackground:%s;color:%s;box-shadow:inset 0 0 0 2px %s;opacity:.85">'
                               '<span style="text-decoration:line-through;text-decoration-thickness:2px">%s</span></div>'
                               % (base, empty_bg, accent, accent, t))
                else:
                    out.append('<div style="%sbackground:%s;color:%s;box-shadow:inset 0 0 0 2px %s">%s</div>'
                               % (base, empty_bg, ring, ring, t))
            else:
                out.append('<div style="%sbackground:%s;color:%s">%s</div>' % (base, empty_bg, empty_ink, t))
    out.append('</div>')
    return "".join(out)

BOARD_PX = lambda cell=58, gap=5, hdr=24: (hdr + 12*cell + 12*gap, hdr + 9*cell + 9*gap)

# ---------------------------------------------------------------- icons
def icon(kind, color, size=16):
    s = ('<svg width="%d" height="%d" viewBox="0 0 24 24" fill="none" stroke="%s" '
         'stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' % (size, size, color))
    p = {
      "found": '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M12 8v8M8 12h8"/>',
      "grow":  '<path d="M5 19h14"/><path d="M12 16V5"/><path d="M8 9l4-4 4 4"/>',
      "merge": '<path d="M4 6h5l3 6"/><path d="M4 18h5l3-6"/><path d="M12 12h8"/><path d="M17 9l3 3-3 3"/>',
      "dead":  '<circle cx="12" cy="12" r="9"/><path d="M6 6l12 12"/>',
      "none":  '<circle cx="12" cy="12" r="3"/>',
      "safe":  '<path d="M12 3l7 3v6c0 4-3 7-7 9-4-2-7-5-7-9V6z"/>',
      "coin":  '<circle cx="12" cy="12" r="8"/><path d="M12 8v8M9.5 10h4a1.5 1.5 0 010 3h-3a1.5 1.5 0 000 3h4"/>',
    }[kind]
    return s + p + "</svg>"

def chevron(color, size=20):
    return ('<svg width="%d" height="%d" viewBox="0 0 24 24" fill="none" stroke="%s" stroke-width="2" '
            'stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>' % (size, size, color))

DC_HEAD = ('<!doctype html>\n<html>\n<head>\n  <meta charset="utf-8">\n'
           '  <script src="./support.js"></script>\n</head>\n<body>\n<x-dc>\n')
DC_FOOT = '\n</x-dc>\n</body>\n</html>\n'

def write(name, helmet, bodyhtml):
    with io.open(os.path.join(OUT, name), "w", encoding="utf-8") as f:
        f.write(DC_HEAD + "<helmet>\n" + helmet + "\n</helmet>\n" + bodyhtml + DC_FOOT)
    print("wrote", name)

# =============================================================== DIRECTION A
A_BG, A_PANEL, A_INK, A_MUTED, A_RULE, A_ACCENT = "#EFE7D6", "#F8F3E7", "#22201C", "#7A7061", "#CDC2A8", "#A5361F"
A_HELMET = """  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Oswald:wght@400;500;600&family=Barlow+Semi+Condensed:wght@400;500;600;700&display=swap">
  <style>
    body { margin: 0; }
    a { color: #A5361F; } a:hover { color: #7A2413; }
    .num { font-variant-numeric: tabular-nums; }
  </style>"""

def a_chip(label, value, border=A_RULE, ink=A_INK):
    return ('<div style="display:flex;align-items:center;gap:8px;border:1px solid %s;border-radius:2px;'
            'padding:5px 10px"><span style="font-size:10px;letter-spacing:.14em;text-transform:uppercase;'
            'color:%s">%s</span><span style="font-family:\'Oswald\',sans-serif;font-size:14px;color:%s" '
            'class="num">%s</span></div>' % (border, A_MUTED, label, ink, value))

def a_market():
    rows = []
    head = ('<div style="display:grid;grid-template-columns:150px 30px 44px 74px 48px 48px 96px;'
            'gap:0;padding:0 12px 8px;font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:%s;'
            'border-bottom:1px solid %s">'
            '<div>Corporation</div><div>Tr</div><div style="text-align:right">Size</div>'
            '<div style="text-align:right">Share</div><div style="text-align:right">You</div>'
            '<div style="text-align:right">Bank</div><div style="text-align:right">Status</div></div>' % (A_MUTED, A_RULE))
    for m in market():
        on = m["size"] > 0
        status = ('<span style="display:inline-flex;align-items:center;gap:4px;color:%s">%s SAFE</span>'
                  % (A_ACCENT, icon("safe", A_ACCENT, 13))) if m["safe"] else (
                  '<span style="color:%s">active</span>' % A_INK if on else
                  '<span style="color:%s">unfounded</span>' % A_MUTED)
        rows.append(
          '<div style="display:grid;grid-template-columns:150px 30px 44px 74px 48px 48px 96px;align-items:center;'
          'padding:0 12px;height:34px;border-bottom:1px solid rgba(205,194,168,.5);%s">'
          '<div style="display:flex;align-items:center;gap:9px">'
          '<span style="width:13px;height:13px;border-radius:2px;background:%s;%s"></span>'
          '<span style="font-family:\'Oswald\',sans-serif;font-size:14px;letter-spacing:.02em">%s</span></div>'
          '<div style="font-size:11px;color:%s">%d</div>'
          '<div style="text-align:right" class="num">%s</div>'
          '<div style="text-align:right;font-family:\'Oswald\',sans-serif;font-size:14px" class="num">%s</div>'
          '<div style="text-align:right;font-weight:700" class="num">%s</div>'
          '<div style="text-align:right;color:%s" class="num">%d</div>'
          '<div style="text-align:right;font-size:11px;letter-spacing:.06em;text-transform:uppercase">%s</div></div>'
          % ("" if on else "opacity:.45", m["color"],
             "" if on else "box-shadow:inset 0 0 0 1px rgba(0,0,0,.25);background:transparent",
             m["display"], A_MUTED, m["tier"], m["size"] or "—",
             money(m["price"]) if m["price"] else "—",
             m["mine"] or "—", A_MUTED, m["bank"], status))
    return ('<div style="background:%s;border:1px solid %s;padding:12px 0 0">'
            '<div style="padding:0 12px 10px;font-family:\'Oswald\',sans-serif;font-size:13px;letter-spacing:.16em;'
            'text-transform:uppercase">Stock market</div>%s%s</div>' % (A_PANEL, A_RULE, head, "".join(rows)))

def a_players():
    cards = []
    for i, (name, cash, h) in enumerate(PLAYERS):
        active = i == 0
        chips = "".join(
          '<span style="display:flex;align-items:center;gap:3px"><span style="width:8px;height:8px;border-radius:1px;'
          'background:%s"></span><span class="num" style="font-size:11px">%d</span></span>'
          % (CORP[k]["color"], v) for k, v in h.items() if v)
        cards.append(
          '<div style="flex-grow:1;background:%s;border:%s;padding:10px 12px;display:flex;flex-direction:column;gap:7px">'
          '<div style="display:flex;align-items:baseline;justify-content:space-between">'
          '<span style="font-family:\'Oswald\',sans-serif;font-size:14px;letter-spacing:.04em">%s</span>'
          '<span style="font-size:9px;letter-spacing:.12em;text-transform:uppercase;color:%s">%s</span></div>'
          '<div style="font-family:\'Oswald\',sans-serif;font-size:19px" class="num">%s</div>'
          '<div style="display:flex;gap:9px;flex-wrap:wrap">%s</div></div>'
          % (A_PANEL, ("2px solid %s" % A_ACCENT) if active else ("1px solid %s" % A_RULE),
             name, A_ACCENT if active else A_MUTED, "to play" if active else "", money(cash), chips))
    return '<div style="display:flex;gap:12px">%s</div>' % "".join(cards)

def a_rack():
    tiles = []
    for t, kind, note in HAND:
        sel = t == SELECTED
        tiles.append(
          '<div style="display:flex;flex-direction:column;align-items:center;gap:7px;width:112px">'
          '<div style="width:70px;height:70px;border-radius:3px;display:flex;align-items:center;justify-content:center;'
          'font-family:\'Oswald\',sans-serif;font-size:24px;letter-spacing:.04em;%s" class="num">%s</div>'
          '<div style="display:flex;align-items:center;gap:5px;height:16px">%s'
          '<span style="font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:%s">%s</span></div>'
          '<div style="font-size:11px;line-height:1.25;text-align:center;color:%s;%s">%s</div></div>'
          % ("background:%s;color:#FFF;box-shadow:0 0 0 3px %s" % (A_ACCENT, A_ACCENT) if sel else
             ("background:%s;color:%s;border:1px solid %s;opacity:.5" % (A_PANEL, A_MUTED, A_RULE) if kind == "dead"
              else "background:%s;color:%s;border:1px solid %s" % (A_PANEL, A_INK, A_RULE)),
             t,
             icon(kind, A_ACCENT if sel or kind == "dead" else A_MUTED, 14),
             A_ACCENT if sel or kind == "dead" else A_MUTED,
             {"found":"found","grow":"grow","merge":"merge","dead":"dead","none":"idle"}[kind],
             A_MUTED, "opacity:.7" if kind == "dead" else "", note))
    return ('<div style="display:flex;flex-direction:column;gap:11px">'
            '<div style="display:flex;align-items:baseline;justify-content:space-between">'
            '<span style="font-family:\'Oswald\',sans-serif;font-size:13px;letter-spacing:.16em;text-transform:uppercase">Your tiles</span>'
            '<span style="font-size:11px;color:%s">3F is permanently unplayable — set it aside and draw a replacement</span></div>'
            '<div style="display:flex;gap:12px">%s</div></div>' % (A_MUTED, "".join(tiles)))

def a_consequence():
    return (
      '<div style="background:%s;border-left:3px solid %s;border-top:1px solid %s;border-right:1px solid %s;'
      'border-bottom:1px solid %s;padding:16px 18px;display:flex;flex-direction:column;gap:13px">'
      '<div style="display:flex;align-items:center;gap:9px">%s'
      '<span style="font-family:\'Oswald\',sans-serif;font-size:15px;letter-spacing:.14em;text-transform:uppercase;color:%s">Placing 9F</span></div>'
      '<div style="font-size:15px;line-height:1.45">Blackcurrant <span class="num">(7)</span> absorbs Enrun '
      '<span class="num">(6)</span> and is renamed <strong>Blackcurrun</strong>. Enrun goes defunct at '
      '<span class="num">6</span> tiles — share price <span class="num">$700</span>.</div>'
      '<div style="display:flex;flex-direction:column;gap:7px;border-top:1px solid %s;padding-top:12px">'
      '<div style="font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:%s">Stockholder bonuses</div>'
      '<div style="display:flex;justify-content:space-between;font-size:14px"><span>You and Nadia tie at '
      '<span class="num">3</span> shares</span><span class="num" style="font-family:\'Oswald\',sans-serif">$5,250 each</span></div>'
      '<div style="display:flex;justify-content:space-between;font-size:14px;color:%s"><span>June — '
      '<span class="num">1</span> share</span><span class="num">no bonus</span></div>'
      '<div style="font-size:11px;color:%s;line-height:1.4">Primary $7,000 + minority $3,500 combined and split. '
      'Under the 2015 ruleset this pays $6,000 each and June takes the tertiary $3,500.</div></div>'
      '<div style="display:flex;flex-direction:column;gap:7px;border-top:1px solid %s;padding-top:12px">'
      '<div style="font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:%s">Your 3 defunct shares</div>'
      '<div style="display:flex;gap:8px">%s</div></div></div>'
      % (A_PANEL, A_ACCENT, A_RULE, A_RULE, A_RULE, icon("merge", A_ACCENT, 17), A_ACCENT,
         A_RULE, A_MUTED, A_MUTED, A_MUTED, A_RULE, A_MUTED,
         "".join('<div style="flex-grow:1;border:1px solid %s;padding:8px 10px;display:flex;flex-direction:column;gap:3px">'
                 '<span style="font-family:\'Oswald\',sans-serif;font-size:13px;letter-spacing:.1em;text-transform:uppercase">%s</span>'
                 '<span style="font-size:11px;color:%s" class="num">%s</span></div>' % (A_RULE, t, A_MUTED, s)
                 for t, s in [("Hold", "keep all 3"), ("Sell", "$2,100"), ("Trade", "2 → 1 Blackcurrun")])))

def build_a():
    bw, bh = BOARD_PX()
    body = (
      '<div style="width:1440px;height:900px;background:%s;color:%s;'
      'font-family:\'Barlow Semi Condensed\',\'Helvetica Neue\',Arial,sans-serif;font-size:13px;'
      'display:flex;flex-direction:column;overflow:hidden">'
      # header
      '<div style="height:64px;flex-shrink:0;background:%s;border-bottom:2px solid %s;display:flex;'
      'align-items:center;justify-content:space-between;padding:0 40px">'
      '<div style="display:flex;align-items:baseline;gap:14px">'
      '<span style="font-family:\'Oswald\',sans-serif;font-size:26px;font-weight:600;letter-spacing:.24em">BOOMTOWN</span>'
      '<span style="font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:%s">Hot-seat · 4 players</span></div>'
      '<div style="display:flex;gap:10px">%s%s%s</div></div>'
      # body
      '<div style="flex-grow:1;display:flex;gap:30px;padding:28px 40px">'
      '<div style="width:%dpx;flex-shrink:0;display:flex;flex-direction:column;gap:24px">%s%s</div>'
      '<div style="flex-grow:1;display:flex;flex-direction:column;gap:18px">%s%s%s</div>'
      '</div></div>'
      % (A_BG, A_INK, "#E5DAC1", A_INK, A_MUTED,
         a_chip("Ruleset", "Classic"), a_chip("Turn", "14"),
         a_chip("Phase", "Place a tile", A_ACCENT, A_ACCENT),
         bw,
         board(empty_bg="#E3D8BF", empty_ink="#A2977E", grid_ink=A_RULE, uninc_bg="#78705F",
               accent=A_ACCENT, header_ink=A_MUTED, ring="#9C9078"),
         a_rack(), a_players(), a_market(), a_consequence()))
    write("BoardRoom.dc.html", A_HELMET, body)

# =============================================================== DIRECTION B
B_BG, B_PANEL, B_INK, B_MUTED, B_RULE, B_ACCENT = "#FAF6F0", "#FFFFFF", "#1C1917", "#867A6D", "#E7DED2", "#B3462F"
B_HELMET = """  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=DM+Serif+Display&family=DM+Sans:wght@400;500;700&family=IBM+Plex+Mono:wght@400;500&display=swap">
  <style>
    body { margin: 0; }
    a { color: #B3462F; } a:hover { color: #8A3320; }
    .num { font-variant-numeric: tabular-nums; }
    .ser { font-family: 'DM Serif Display', Georgia, serif; }
    .mono { font-family: 'IBM Plex Mono', ui-monospace, monospace; }
    @keyframes lPulse { 0%, 100% { box-shadow: inset 0 0 0 1.5px #D3A68F, inset 0 2px 3px rgba(94,74,52,.1), 0 2px 6px -3px rgba(179,70,47,.5); } 50% { box-shadow: inset 0 0 0 1.5px #D98A4E, inset 0 2px 3px rgba(94,74,52,.1), 0 2px 10px -3px rgba(217,138,78,.7); } }
  </style>"""

# ------------------------------------------------- DIRECTION B — LANGUAGE
# The crafted visual language build_b()/build_beats() implement (U1). Concrete,
# not categorical: an implementer reads target values off this sheet.
#
# Elevation — three fixed levels, one light source (warm, from above). Level 1
# is a resting card, 2 a raised panel (the corp band), 3 a floating plate (the
# board). Never more than three; never a fourth "modal" level — dialogs reuse 3.
L_ELEV = {
    1: "0 1px 0 rgba(255,253,250,.8) inset, 0 2px 6px -3px rgba(94,74,52,.35)",
    2: "0 1px 0 rgba(255,253,250,.8) inset, 0 10px 22px -14px rgba(94,74,52,.5)",
    3: "0 1px 0 rgba(255,253,250,.8) inset, 0 24px 48px -20px rgba(94,74,52,.6), 0 8px 16px -8px rgba(94,74,52,.35)",
}
# Texture ceiling (R3) — the only texture the language allows anywhere, and
# never above this opacity. Not a scanned-paper or canvas image: a two-stop
# radial dot-grain standing in for print grain.
L_GRAIN_MAX = 0.05
L_GRAIN = "background-image:radial-gradient(rgba(28,25,23,.4) .6px, transparent 1.1px);background-size:3px 3px;opacity:%s;" % L_GRAIN_MAX
# Framing devices — named so U6/U7 can implement them by name, not guess.
# "cap band": a colour-filled header strip capping a card (the corp card's
# industry cap, a dialog's title bar). "top rule": a 3px ink-or-accent rule
# along a panel's top edge, for panels with no cap (Shareholders, Story).
L_TOP_RULE = "border-top:3px solid %s;" % B_INK
# Accent's role, stated once: primary call-to-action, the "safe" indicator, the
# active/selected state, and a kicker's underline rule. Never a fill colour for
# large surfaces and never decorative — every accent pixel means "act" or "true".
L_TILT_DEG = 6  # the board's perspective rotateX — gentle, not showy (KTD6)


def build_language():
    def swatch(label, style, caption, w=220, h=96):
        return (
            '<div style="display:flex;flex-direction:column;gap:8px">'
            '<div style="width:%dpx;height:%dpx;border-radius:6px;background:%s;%s"></div>'
            '<div style="font-size:12px;font-weight:600">%s</div>'
            '<div class="mono" style="font-size:10px;line-height:1.5;color:%s;max-width:%dpx">%s</div></div>'
            % (w, h, B_PANEL, style, label, B_MUTED, w, caption)
        )

    elevation = "".join(
        swatch("Elevation %d" % lvl, "box-shadow:%s" % shadow,
               shadow.replace(", ", ",<br>"))
        for lvl, shadow in L_ELEV.items()
    )

    framing = (
        swatch("Cap band", "border-top:34px solid %s;position:relative" % CORP["tech"]["color"],
               "A colour-filled strip capping a card — the corp card's industry cap, a dialog's title bar. Height is content-driven, never fixed.")
        + swatch("Top rule", L_TOP_RULE,
                 "A 3px ink rule along a panel's top edge — for panels with no cap: Shareholders, Story, Reference.")
        + swatch("Texture ceiling", L_GRAIN, "Max texture anywhere: %d%% opacity dot-grain. Never a scanned-paper, canvas or wood-grain image (R3)." % int(L_GRAIN_MAX * 100))
    )

    accent_chips = "".join(
        '<span style="display:inline-flex;align-items:center;gap:8px;background:%s;border:1px solid %s;'
        'border-radius:20px;padding:7px 14px;font-size:12px">%s</span>'
        % (B_PANEL, B_RULE, label)
        for label in [
            '<span style="width:9px;height:9px;border-radius:50%%;background:%s;display:inline-block"></span>Primary call-to-action' % B_ACCENT,
            '<span style="color:%s">◇ safe</span> — the one status the accent marks' % B_ACCENT,
            '<span style="color:%s;font-weight:700">Selected · active</span>' % B_ACCENT,
            '<span style="border-bottom:2px solid %s;color:%s">kicker underline</span>' % (B_ACCENT, B_ACCENT),
        ]
    )

    type_rows = "".join(
        '<div style="display:flex;align-items:baseline;gap:18px;padding:10px 0;border-bottom:1px solid %s">'
        '<span class="mono" style="width:120px;flex-shrink:0;font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:%s">%s</span>'
        '<span style="%s">%s</span></div>'
        % (B_RULE, B_MUTED, role, style, sample)
        for role, style, sample in [
            ("Display", "font-family:'DM Serif Display',Georgia,serif;font-size:32px", "Noqurun"),
            ("Kicker / label", "font-size:10px;letter-spacing:.18em;text-transform:uppercase;color:%s" % B_MUTED, "a corporation is founded"),
            ("Body", "font-size:14px;line-height:1.5", "Placing 9F hands the keyboard people a power company with imaginative books."),
            ("Numeric / mono", "font-family:'IBM Plex Mono',monospace;font-variant-numeric:tabular-nums;font-size:20px", "$5,250 · 7D · 14"),
        ]
    )

    def corp_flat(m):
        return (
            '<div style="width:230px;background:%s;border:1px solid %s;border-radius:3px;padding:13px 14px;'
            'display:flex;flex-direction:column;gap:9px">'
            '<div style="display:flex;align-items:center;gap:8px">%s<span style="font-size:16px">%s</span></div>'
            '<span class="num" style="font-size:20px">%s</span></div>'
            % (B_PANEL, B_RULE, b_mark(m["key"], m["color"], 20), m["display"], money(m["price"]))
        )

    def corp_crafted(m):
        return (
            '<div style="width:230px;background:%s;border:1px solid %s;border-top:3px solid %s;border-radius:3px;'
            'box-shadow:%s;display:flex;flex-direction:column;overflow:hidden">'
            '<div style="padding:11px 14px;display:flex;align-items:center;justify-content:space-between;'
            'background:linear-gradient(160deg, color-mix(in srgb, %s 88%%, #fff), %s)">%s'
            '<span style="font-size:9.5px;letter-spacing:.16em;text-transform:uppercase;opacity:.8;color:%s">tier %d</span></div>'
            '<div style="padding:12px 14px 15px;display:flex;flex-direction:column;gap:8px">'
            '<div class="ser" style="font-size:20px">%s</div>'
            '<span class="mono num" style="font-size:24px">%s</span></div></div>'
            % (B_PANEL, B_RULE, m["color"], L_ELEV[1], m["color"], m["color"],
               b_mark(m["key"], m["ink"], 22), m["ink"], m["tier"], m["display"], money(m["price"]))
        )

    sample = market()[3]  # Noquia (tech) — a representative mid-market corp
    before_after = (
        '<div style="display:flex;flex-direction:column;gap:8px">%s'
        '<div class="mono" style="font-size:10px;color:%s">Before — flat card, 1px border, no cap</div></div>'
        '<div style="display:flex;align-items:center;justify-content:center;width:36px">%s</div>'
        '<div style="display:flex;flex-direction:column;gap:8px">%s'
        '<div class="mono" style="font-size:10px;color:%s">After — industry cap band, elevation-1 shadow, ink-on-colour badge</div></div>'
        % (corp_flat(sample), B_MUTED, chevron(B_MUTED, 20), corp_crafted(sample), B_MUTED)
    )

    illustration_brief = (
        '<div style="display:flex;flex-direction:column;gap:10px;max-width:900px">'
        '<div style="font-size:13px;line-height:1.6;color:%s">'
        '<strong style="color:%s">Subject:</strong> the skyline the seven corporations are building — abstracted '
        'building silhouettes and cranes, not literal logos or people. <strong style="color:%s">Treatment:</strong> '
        'flat, faceted shapes in one or two industry-adjacent tones over the warm paper ground — figurative '
        'silhouette, not photographic, not cartoon-mascot. <strong style="color:%s">Relationship to Saxon City:</strong> '
        'the skyline is the same "corporations as subject" idea the whole direction is built on, seen from outside '
        'instead of from the ledger. <strong style="color:%s">References:</strong> Wingspan\'s box-cover skyline '
        'silhouette, Ticket to Ride Europe\'s title-screen skyline, and the WPA travel-poster flat-shape tradition. '
        '<strong style="color:%s">Avoid:</strong> photographic skylines, any real building silhouette, cute mascot '
        'figures, gradients heavier than the elevation scale above.</div></div>'
        % (B_INK, B_ACCENT, B_ACCENT, B_ACCENT, B_ACCENT, B_ACCENT)
    )

    def section(title, inner):
        return (
            '<div style="display:flex;flex-direction:column;gap:16px">'
            '<div class="ser" style="font-size:22px;border-bottom:1px solid %s;padding-bottom:10px">%s</div>'
            '%s</div>' % (B_RULE, title, inner)
        )

    body = (
        '<div style="width:1440px;min-height:1900px;background:%s;color:%s;'
        'font-family:\'DM Sans\',Helvetica,Arial,sans-serif;font-size:13px;padding:44px 60px 60px;'
        'display:flex;flex-direction:column;gap:34px">'
        '<div style="display:flex;flex-direction:column;gap:8px">'
        '<span class="mono" style="font-size:10px;letter-spacing:.18em;text-transform:uppercase;color:%s">Boomtown · visual language</span>'
        '<span class="ser" style="font-size:34px">The crafted system (U1)</span>'
        '<span style="font-size:13px;color:%s;max-width:820px">Anchors unchanged — %s / %s, DM Serif Display + DM Sans. '
        'Depth comes from elevation, framing and one texture ceiling, never from material mimicry (R3). '
        'This sheet is the spec build_b() and build_beats() implement.</span></div>'
        '%s%s%s%s%s%s</div>'
        % (B_BG, B_INK, B_MUTED, B_MUTED, B_BG, B_ACCENT,
           section("Elevation scale — three levels, one warm light source", '<div style="display:flex;gap:20px">%s</div>' % elevation),
           section("Framing &amp; texture ceiling", '<div style="display:flex;gap:20px">%s</div>' % framing),
           section("Corporation card — before / after", '<div style="display:flex;align-items:center;gap:18px">%s</div>' % before_after),
           section("Type hierarchy — four roles, not two", type_rows),
           section("The accent's role — stated, not decorative", '<div style="display:flex;gap:12px;flex-wrap:wrap">%s</div>' % accent_chips),
           section("Illustration style brief (seed — refined at U9)", illustration_brief))
    )
    write("Language.dc.html", B_HELMET, body)

def b_mark(key, color, size=26):
    """A drawn corporate mark per industry — placeholder identities, one per corporation."""
    g = {
      "books":    '<path d="M12 7v13"/><path d="M12 7C10 5 7 4.5 3 5v13c4-.5 7 0 9 2"/><path d="M12 7c2-2 5-2.5 9-2v13c-4-.5-7 0-9 2"/>',
      "electronics":     '<rect x="3" y="10" width="18" height="10" rx="2"/><circle cx="8" cy="15" r="2"/><path d="M13 14h5M13 17h5"/><path d="M8 10L17 3"/>',
      "air":     '<path d="M12 2c3 3 3 17 0 20-3-3-3-17 0-20z"/><path d="M2 12h20"/><path d="M4.5 7.5c4.7 2 10.3 2 15 0M4.5 16.5c4.7-2 10.3-2 15 0"/>',
      "energy":        '<path d="M13 3l-7 10h5l-1 8 7-10h-5z"/>',
      "tech": '<rect x="6" y="2" width="12" height="20" rx="2"/><path d="M9 6h6"/><path d="M9 11h2M13 11h2M9 14h2M13 14h2M9 17h6"/>',
      "video":      '<rect x="2" y="6" width="20" height="12" rx="1.5"/><circle cx="8" cy="12" r="2.5"/><circle cx="16" cy="12" r="2.5"/><path d="M2 9h20"/>',
      "toys":     '<rect x="3" y="9" width="12" height="12" rx="1.5"/><path d="M7 13h4M9 11v4"/><path d="M17 3l1.6 3.3 3.4.5-2.5 2.4.6 3.6-3.1-1.7-3.1 1.7.6-3.6L12 6.8l3.4-.5z"/>',
    }[key]
    return ('<svg width="%d" height="%d" viewBox="0 0 24 24" fill="none" stroke="%s" stroke-width="1.6" '
            'stroke-linecap="round" stroke-linejoin="round">%s</svg>' % (size, size, color, g))

NAME_TO_KEY = {c["name"]: k for k, c in CORP.items()}

def b_band():
    rows = market()
    active = [m for m in rows if m["size"] > 0]
    tray = [m for m in rows if m["size"] == 0]
    cards = []
    for m in active:
        pct = int(round(m["mine"] / 25.0 * 100))
        marks = "".join(b_mark(k, CORP[k]["color"], 15) for k in m["eaten"])
        lineage = ('<span style="display:inline-flex;align-items:center;gap:5px;padding-left:9px;'
                   'margin-left:3px;border-left:1px solid %s">%s</span>' % (B_RULE, marks)) if m["eaten"] else ""
        sub = m["flavor"]
        # Cap band (U1 framing device): a colour-filled strip holding the mark
        # (ink-on-colour, matching the shareholder-chip and HQ-badge treatment)
        # and the tier label — not just a border-top hairline.
        cap = (
          '<div style="display:flex;align-items:center;justify-content:space-between;padding:10px 14px;'
          'background:linear-gradient(160deg, color-mix(in srgb, %s 88%%, #fff), %s);color:%s">'
          '%s<span class="mono" style="font-size:9.5px;letter-spacing:.16em;text-transform:uppercase;opacity:.85">'
          'tier %d%s</span></div>'
          % (m["color"], m["color"], m["ink"], b_mark(m["key"], m["ink"], 22), m["tier"],
             '<span style="margin-left:8px">%s safe</span>' % icon("safe", m["ink"], 12) if m["safe"] else "")
        )
        cards.append(
          '<div style="flex-grow:%d;flex-basis:0;min-width:0;background:%s;border:1px solid %s;border-radius:4px;'
          'box-shadow:%s;display:flex;flex-direction:column;overflow:hidden">%s'
          '<div style="padding:12px 14px 15px;display:flex;flex-direction:column;gap:9px;flex-grow:1">'
          '<div><div class="ser" style="font-size:19px;line-height:1.1">%s</div>'
          '<div style="font-size:11px;line-height:1.3;color:%s;margin-top:3px;height:29px;overflow:hidden">%s</div></div>'
          '<div style="display:flex;align-items:center;gap:8px">'
          '<span class="ser num" style="font-size:22px">%s</span>'
          '<span style="font-size:11px;color:%s" class="num">%d tiles</span>%s</div>'
          '<div style="display:flex;flex-direction:column;gap:5px;margin-top:auto">'
          '<div style="display:flex;justify-content:space-between;font-size:11px;color:%s">'
          '<span>your stake</span><span class="num">%d of %d</span></div>'
          '<div style="height:5px;background:%s;border-radius:0;overflow:hidden">'
          '<div style="width:%d%%;height:100%%;background:%s"></div></div></div></div></div>'
          % (m["slots"], B_PANEL, B_RULE, L_ELEV[1], cap,
             m["display"], B_MUTED, sub,
             money(m["price"]), B_MUTED, m["size"], lineage,
             B_MUTED, m["mine"], 25 - m["bank"], B_RULE, pct, m["color"]))
    chips = "".join(
      '<div style="display:flex;align-items:center;gap:8px;opacity:.55">%s'
      '<span class="ser" style="font-size:14px">%s</span></div>'
      % (b_mark(m["key"], m["color"], 17), m["name"]) for m in tray)
    tray_col = ('<div style="width:154px;flex-shrink:0;border:1.5px dashed %s;border-radius:4px;padding:13px 14px;'
                'display:flex;flex-direction:column;gap:11px;background:repeating-linear-gradient(135deg,'
                'rgba(203,189,169,.16) 0 10px, transparent 10px 20px), rgba(255,255,255,.4)">'
                '<div class="mono" style="font-size:10px;letter-spacing:.13em;text-transform:uppercase;color:%s">In the tray</div>'
                '%s<div style="font-size:10.5px;line-height:1.4;color:%s;margin-top:auto">Free to found again, '
                'under their own names.</div></div>' % (B_RULE, B_MUTED, "".join(chips), B_MUTED))
    return '<div style="display:flex;gap:12px;align-items:stretch">%s%s</div>' % ("".join(cards), tray_col)

def b_rack():
    tiles = []
    for t, kind, note in HAND:
        sel = t == SELECTED
        tiles.append(
          '<div style="width:58px;display:flex;flex-direction:column;align-items:center;gap:7px">'
          '<div style="width:52px;height:52px;border-radius:9px;display:flex;align-items:center;justify-content:center;'
          'font-size:19px;font-weight:700;%s" class="mono num">%s</div>'
          '<span class="mono" style="font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:%s">%s</span></div>'
          % ("background:%s;color:#FFF;box-shadow:%s" % (B_ACCENT, L_ELEV[1]) if sel else
             ("background:%s;color:%s;border:1px dashed %s;opacity:.55" % (B_BG, B_MUTED, B_MUTED) if kind == "dead"
              else "background:%s;color:%s;border:1px solid %s;box-shadow:0 3px 0 %s,0 8px 14px -6px rgba(60,45,30,.4)"
                   % (B_PANEL, B_INK, B_RULE, B_RULE)),
             t, B_ACCENT if sel else B_MUTED,
             {"found":"found","grow":"grow","merge":"merge","dead":"dead","none":"idle"}[kind]))
    return ('<div style="display:flex;flex-direction:column;gap:10px">'
            '<div class="ser" style="font-size:16px">Your tiles</div>'
            '<div style="display:flex;gap:10px">%s</div></div>' % "".join(tiles))

def b_story():
    return (
      '<div style="background:%s;%sborder-radius:4px;box-shadow:%s;padding:18px 20px;display:flex;'
      'flex-direction:column;gap:13px">'
      '<div style="display:flex;align-items:center;gap:9px">%s<span class="ser" style="font-size:19px">'
      'Blackcurrant takes over Enrun</span></div>'
      '<div style="font-size:14px;line-height:1.5;color:%s">Placing <strong style="color:%s" class="num">9F</strong> '
      'hands the keyboard people a power company with imaginative books. Blackcurrant is larger at '
      '<span class="num">7</span> tiles, so Enrun is dissolved at <span class="num">6</span>.</div>'
      '<div style="display:flex;align-items:center;gap:14px;background:%s;border:1px solid %s;border-radius:3px;'
      'padding:12px 16px">'
      '<div style="font-size:11px;color:%s;width:96px;flex-shrink:0;line-height:1.35">The survivor<br>is renamed</div>'
      '<div class="ser" style="font-size:26px;color:%s">%s</div>'
      '<div style="font-size:11px;color:%s;line-height:1.45;flex-grow:1">The stem keeps everything it has ever '
      'eaten, and the card widens into Enrun\'s slot to hold it.</div></div>'
      '<div style="display:flex;gap:10px;border-top:1px solid %s;padding-top:13px">'
      '<div style="flex-grow:1"><div style="font-size:11px;color:%s">You and Nadia, tied at 3 shares</div>'
      '<div class="ser num" style="font-size:23px;color:%s">$5,250 each</div></div>'
      '<div style="flex-grow:1"><div style="font-size:11px;color:%s">June, 1 share</div>'
      '<div class="ser num" style="font-size:23px;color:%s">no bonus</div></div></div>'
      '<div style="font-size:11px;line-height:1.45;color:%s">Tied for primary, so the two bonuses are combined and split.</div></div>'
      % (B_PANEL, L_TOP_RULE, L_ELEV[1], b_mark("tech", CORP["tech"]["color"], 22), B_MUTED, B_INK,
         B_BG, B_RULE, B_MUTED, CORP["tech"]["color"], display_name("Blackcurrant", ["Enrun"]), B_MUTED,
         B_RULE, B_MUTED, B_INK, B_MUTED, B_MUTED, B_MUTED))

def b_portfolio():
    rows = []
    for i, (name, cash, h) in enumerate(PLAYERS):
        # Icon + colour, not colour alone (accessibility) — the same
        # ink-on-colour badge treatment as the corp-card cap and the HQ marker.
        chips = "".join(
                        '<span style="display:inline-flex;align-items:center;gap:4px">'
                        '<span style="width:15px;height:15px;border-radius:50%%;background:%s;display:flex;'
                        'align-items:center;justify-content:center;flex-shrink:0">%s</span>'
                        '<span class="mono" style="font-size:11px">%d</span></span>'
                        % (CORP[k]["color"], b_mark(k, CORP[k]["ink"], 10), v)
                        for k, v in h.items() if v)
        rows.append('<div style="display:flex;align-items:center;justify-content:space-between;height:27px;'
                    'border-bottom:1px solid %s;%s">'
                    '<span style="width:70px;font-size:13px;font-weight:%d">%s</span>'
                    '<div style="display:flex;gap:11px;flex-grow:1">%s</div>'
                    '<span class="ser num" style="font-size:16px">%s</span></div>'
                    % (B_RULE, "" if i < 3 else "border-bottom:none", 700 if i == 0 else 400,
                       name + (" ·" if i == 0 else ""), chips, money(cash)))
    return ('<div style="background:%s;%sborder-radius:4px;box-shadow:%s;padding:14px 18px">'
            '<div class="ser" style="font-size:15px;margin-bottom:6px">Shareholders</div>%s</div>'
            % (B_PANEL, L_TOP_RULE, L_ELEV[1], "".join(rows)))

def b_board_crafted(cell=48, gap=5, hdr=22, tilt=L_TILT_DEG):
    """The crafted board (U1/U2): lit warm paper, elevation-3 shadow scale, a
    gentle CSS-3D tilt (rotateX only — no canvas/WebGL, KTD6), industry cells as
    a subtle gradient with a lifted HQ badge. Static-frame equivalent of the
    handoff's Direction D board treatment, ported into the shared generator."""
    rows = ['<div style="height:%dpx"></div>' % hdr]
    for c in COLS:
        rows.append('<div style="display:flex;align-items:center;justify-content:center;font-size:10px;'
                     'letter-spacing:.08em;color:%s;height:%dpx">%d</div>' % (B_MUTED, hdr, c))
    for r in ROWS:
        rows.append('<div style="display:flex;align-items:center;justify-content:center;font-size:10px;'
                     'letter-spacing:.08em;color:%s">%s</div>' % (B_MUTED, r))
        for c in COLS:
            t = "%d%s" % (c, r)
            kind, meta = cell_state(t)
            base = ('display:flex;align-items:center;justify-content:center;border-radius:8px;'
                    'font-size:11px;font-weight:500;letter-spacing:.03em;position:relative;')
            if kind == "corp":
                co = CORP[meta]
                d1 = "color-mix(in srgb, %s 74%%, #1C1917)" % co["color"]
                d2 = "color-mix(in srgb, %s 56%%, #1C1917)" % co["color"]
                lift = 2.3 if HQ.get(meta) == t else 2
                cellstyle = (base +
                    'background:linear-gradient(170deg, color-mix(in srgb, %s 88%%, #fff) 0%%, %s 62%%, %s 100%%);'
                    'color:%s;font-weight:600;box-shadow:0 %.1fpx 0 %s, 0 %.1fpx 0 %s, 0 %.1fpx 10px -4px rgba(60,45,30,.55), '
                    'inset 0 1px 0 rgba(255,255,255,.3);transform:translateZ(%.1fpx);'
                    % (co["color"], co["color"], d1, co["ink"], lift, d1, lift * 2, d2, lift * 2 + 4, lift * 3))
                if HQ.get(meta) == t:
                    inner = (
                        '<span style="width:28px;height:28px;border-radius:50%%;background:%s;display:flex;'
                        'align-items:center;justify-content:center;box-shadow:0 1px 3px rgba(0,0,0,.4),'
                        'inset 0 1px 0 rgba(255,255,255,.2)">%s</span>'
                        '<span style="position:absolute;right:3px;bottom:2px;font-size:7px;padding:1px 3px;'
                        'border-radius:3px;background:rgba(0,0,0,.3);color:#fff;letter-spacing:.03em" class="mono">%s</span>'
                        % (co["ink"], b_mark(meta, co["color"], 15), t)
                    )
                else:
                    inner = t
                rows.append('<div style="%s">%s</div>' % (cellstyle, inner))
            elif kind == "uninc":
                rows.append('<div style="%sbackground:linear-gradient(180deg,#BDB2A4,#A4988A);color:#fff;'
                            'box-shadow:0 1.5px 0 #8D8274,0 3px 0 #7B7163,0 5px 8px -3px rgba(60,45,30,.5),'
                            'inset 0 1px 0 rgba(255,255,255,.25)">%s</div>' % (base, t))
            elif kind == "target":
                if meta == "merge":
                    rows.append('<div style="%sbackground:#F6EFE4;color:%s;animation:lPulse 2.2s ease-in-out infinite">%s</div>'
                               % (base, B_ACCENT, t))
                elif meta == "dead":
                    rows.append('<div style="%sbackground:#EFE7DB;color:%s;opacity:.85;box-shadow:inset 0 0 0 1.5px %s,'
                               'inset 0 2px 3px rgba(94,74,52,.16)"><s style="text-decoration-thickness:2px">%s</s></div>'
                               % (base, B_ACCENT, B_ACCENT, t))
                else:
                    rows.append('<div style="%sbackground:#F6EFE4;color:%s;box-shadow:inset 0 0 0 1.5px #C6B8A6,'
                               'inset 0 2px 3px rgba(94,74,52,.1)">%s</div>' % (base, B_MUTED, t))
            else:
                rows.append('<div style="%sbackground:#EFE7DB;color:#B6A897;box-shadow:inset 0 2px 3px rgba(94,74,52,.16),'
                            'inset 0 -1px 0 rgba(255,253,250,.7)">%s</div>' % (base, t))
    return (
        '<div style="position:relative;padding:16px 16px 24px;border-radius:10px;box-sizing:border-box;'
        'background:linear-gradient(180deg,#F7F0E5,#EFE6D9);box-shadow:%s, 0 46px 70px -28px rgba(60,45,30,.55),'
        '0 10px 20px -8px rgba(60,45,30,.35);transform:rotateX(%ddeg);transform-style:preserve-3d;'
        'transform-origin:50%% 100%%">'
        '<div style="display:grid;grid-template-columns:%dpx repeat(12, %dpx);grid-auto-rows:%dpx;gap:%dpx;'
        'font-variant-numeric:tabular-nums">%s</div></div>'
        % (L_ELEV[3], tilt, hdr, cell, cell, gap, "".join(rows))
    )


def build_b():
    body = (
      '<div style="width:1440px;height:900px;background:%s;color:%s;font-family:\'DM Sans\',Helvetica,Arial,sans-serif;'
      'font-size:13px;display:flex;flex-direction:column;overflow:hidden;padding:0">'
      '<div style="height:70px;flex-shrink:0;display:flex;align-items:center;justify-content:space-between;'
      'padding:0 36px;background:%s;color:%s;box-shadow:0 14px 30px -18px rgba(28,25,23,.85)">'
      '<div style="display:flex;align-items:center;gap:14px"><span class="ser" style="font-size:24px">Boomtown</span>'
      '<span style="width:1px;height:20px;background:#46403A"></span>'
      '<span class="mono" style="font-size:10px;letter-spacing:.18em;text-transform:uppercase;color:#9C9086">seven start-ups, one skyline</span></div>'
      '<div style="display:flex;align-items:center;gap:22px;font-size:12px;color:#9C9086">'
      '<span class="mono" style="font-size:10px;letter-spacing:.16em;text-transform:uppercase">Classic</span>'
      '<span style="display:flex;align-items:baseline;gap:7px"><span class="mono" style="font-size:10px;letter-spacing:.16em;'
      'text-transform:uppercase">turn</span><span class="ser num" style="font-size:19px;color:%s">14</span></span>'
      '<span style="border:1px solid #46403A;border-radius:3px;padding:7px 14px;font-size:11px;letter-spacing:.08em;'
      'text-transform:uppercase;color:%s">Reference</span>'
      '<span style="background:%s;color:#FFF;padding:8px 16px;border-radius:3px;font-size:11px;letter-spacing:.1em;'
      'text-transform:uppercase;font-weight:700">Place a tile</span></div></div>'
      '<div style="flex-grow:1;display:flex;flex-direction:column;gap:16px;padding:20px 36px 26px;min-height:0">'
      '%s'
      '<div style="flex-grow:1;display:flex;gap:28px;min-height:0">'
      '<div style="flex-shrink:0;display:flex;align-items:center">%s</div>'
      '<div style="flex-grow:1;display:flex;flex-direction:column;gap:14px;min-height:0">%s%s%s</div>'
      '</div></div></div>'
      % (B_BG, B_INK, B_INK, B_BG, B_BG, B_BG, B_ACCENT,
         b_band(),
         b_board_crafted(),
         b_story(), b_portfolio(), b_rack()))
    write("Main.dc.html", B_HELMET, body)

# =============================================================== DIRECTION C
C_BG, C_PANEL, C_INK, C_MUTED, C_RULE, C_ACC = "#0D1114", "#151B1F", "#E7ECEA", "#7E8D92", "#232E33", "#E5B93C"
C_POS, C_NEG = "#5FCB8B", "#E06A5A"
C_HELMET = """  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans:wght@400;500;600&display=swap">
  <style>
    body { margin: 0; }
    a { color: #E5B93C; } a:hover { color: #F2CE64; }
    .m { font-family: 'IBM Plex Mono', ui-monospace, monospace; font-variant-numeric: tabular-nums; }
    .lbl { font-size: 10px; letter-spacing: .16em; text-transform: uppercase; color: #7E8D92; }
  </style>"""

def next_step(size, tier, edition="classic"):
    cur = price(size, tier, edition)
    if cur is None: return None
    for s in range(size + 1, 60):
        p = price(s, tier, edition)
        if p != cur: return (s, p)
    return None

def c_panel(title, inner, extra=""):
    return ('<div style="background:%s;border:1px solid %s;border-radius:2px;display:flex;flex-direction:column;%s">'
            '<div style="display:flex;align-items:center;justify-content:space-between;padding:9px 14px;'
            'border-bottom:1px solid %s"><span class="lbl">%s</span>%s</div>'
            '<div style="padding:8px 14px 10px">%s</div></div>'
            % (C_PANEL, C_RULE, "", C_RULE, title, extra, inner))

def c_market():
    cells = ['<div style="display:grid;grid-template-columns:132px 46px 62px 74px 78px 52px 56px;gap:0;'
             'padding-bottom:7px;border-bottom:1px solid %s" class="lbl">'
             '<div>Corp</div><div>Tier</div><div style="text-align:right">Tiles</div>'
             '<div style="text-align:right">Share</div><div style="text-align:right">Next step</div>'
             '<div style="text-align:right">Bank</div><div style="text-align:right">Safe in</div></div>' % C_RULE]
    for m in market():
        on = m["size"] > 0
        ns = next_step(m["size"], m["tier"])
        nstxt = ('<span class="m" style="color:%s">%d → %s</span>' % (C_POS, ns[0], money(ns[1]))) if ns else '<span style="color:%s">—</span>' % C_MUTED
        safein = "—" if not on else ("safe" if m["safe"] else str(11 - m["size"]))
        cells.append(
          '<div style="display:grid;grid-template-columns:132px 46px 62px 74px 78px 52px 56px;align-items:center;'
          'height:26px;border-bottom:1px solid rgba(35,46,51,.6);%s">'
          '<div style="display:flex;align-items:center;gap:8px">'
          '<span style="width:3px;height:16px;background:%s;border-radius:1px"></span>'
          '<span style="font-size:13px;font-weight:500">%s</span></div>'
          '<div class="m" style="font-size:12px;color:%s">T%d</div>'
          '<div class="m" style="text-align:right;font-size:13px">%s</div>'
          '<div class="m" style="text-align:right;font-size:13px;color:%s">%s</div>'
          '<div class="m" style="text-align:right;font-size:12px">%s</div>'
          '<div class="m" style="text-align:right;font-size:12px;color:%s">%d</div>'
          '<div class="m" style="text-align:right;font-size:12px;color:%s">%s</div></div>'
          % ("" if on else "opacity:.42", m["color"], m["display"], C_MUTED, m["tier"],
             m["size"] or "—", C_ACC if on else C_MUTED, money(m["price"]) if m["price"] else "—",
             nstxt, C_MUTED, m["bank"], C_ACC if (on and not m["safe"]) else C_MUTED, safein))
    return "".join(cells)

def c_holdings():
    head = ('<div style="display:grid;grid-template-columns:132px repeat(4, minmax(0, 1fr)) 62px;gap:0;'
            'padding-bottom:7px;border-bottom:1px solid %s" class="lbl"><div>Corp</div>%s'
            '<div style="text-align:right">Bank</div></div>'
            % (C_RULE, "".join('<div style="text-align:right;%s">%s</div>'
                               % ("color:%s" % C_ACC if i == 0 else "", p[0]) for i, p in enumerate(PLAYERS))))
    rows = []
    for m in market():
        if m["size"] == 0: continue
        counts = [p[2].get(m["key"], 0) for p in PLAYERS]
        top = max(counts)
        cs = "".join('<div class="m" style="text-align:right;font-size:13px;color:%s;font-weight:%d">%s</div>'
                     % (C_INK if v else C_MUTED, 600 if v == top and v else 400, v or "·") for v in counts)
        rows.append('<div style="display:grid;grid-template-columns:132px repeat(4, minmax(0, 1fr)) 62px;'
                    'align-items:center;height:26px;border-bottom:1px solid rgba(35,46,51,.6)">'
                    '<div style="display:flex;align-items:center;gap:8px">'
                    '<span style="width:3px;height:16px;background:%s;border-radius:1px"></span>'
                    '<span style="font-size:13px">%s</span></div>%s'
                    '<div class="m" style="text-align:right;font-size:12px;color:%s">%d</div></div>'
                    % (m["color"], m["display"], cs, C_MUTED, m["bank"]))
    cash = ('<div style="display:grid;grid-template-columns:132px repeat(4, minmax(0, 1fr)) 62px;align-items:center;'
            'height:30px;padding-top:2px"><div class="lbl">Cash</div>%s<div></div></div>'
            % "".join('<div class="m" style="text-align:right;font-size:14px;color:%s">%s</div>'
                      % (C_ACC if i == 0 else C_INK, money(p[1])) for i, p in enumerate(PLAYERS)))
    return head + "".join(rows) + cash

def c_exposure():
    prim, minor = 7000, 3500
    split = (prim + minor) // 2
    lines = [("You", 3, split, "tied primary"), ("Nadia", 3, split, "tied primary"),
             ("June", 1, 0, "no bonus"), ("Ravi", 0, 0, "no position")]
    body = "".join(
      '<div style="display:grid;grid-template-columns:88px 60px 1fr 96px;align-items:center;height:26px;'
      'border-bottom:1px solid rgba(35,46,51,.6)">'
      '<div style="font-size:13px;color:%s">%s</div>'
      '<div class="m" style="font-size:12px;color:%s">%s sh</div>'
      '<div style="font-size:11px;color:%s">%s</div>'
      '<div class="m" style="text-align:right;font-size:14px;color:%s">%s</div></div>'
      % (C_ACC if n == "You" else C_INK, n, C_MUTED, s, C_MUTED, note,
         C_POS if amt else C_MUTED, money(amt) if amt else "—")
      for n, s, amt, note in lines)
    foot = ('<div style="display:flex;justify-content:space-between;padding-top:11px;font-size:11px;color:%s;'
            'line-height:1.5"><span>Tie for primary: (%s + %s) ÷ 2</span>'
            '<span>2015 ruleset → $6,000 / $6,000 / June $3,500</span></div>'
            % (C_MUTED, money(prim), money(minor)))
    disp = ('<div style="display:flex;gap:8px;padding-top:11px">%s</div>'
            % "".join('<div style="flex-grow:1;border:1px solid %s;border-radius:2px;padding:8px 10px">'
                      '<div class="lbl" style="margin-bottom:3px">%s</div>'
                      '<div class="m" style="font-size:13px;color:%s">%s</div></div>' % (C_RULE, t, c, v)
                      for t, v, c in [("Hold", "3 shares", C_INK), ("Sell", "$2,100", C_POS),
                                      ("Trade", "2 → 1 BLA", C_ACC)]))
    return body + foot + disp

def c_rack():
    tiles = []
    for t, kind, note in HAND:
        sel = t == SELECTED
        tiles.append(
          '<div style="display:flex;flex-direction:column;align-items:center;gap:6px;width:74px">'
          '<div class="m" style="width:56px;height:52px;border-radius:2px;display:flex;align-items:center;'
          'justify-content:center;font-size:17px;font-weight:600;%s">%s</div>'
          '<span style="font-size:9px;letter-spacing:.12em;text-transform:uppercase;color:%s">%s</span></div>'
          % ("background:%s;color:#101417" % C_ACC if sel else
             ("background:transparent;color:%s;border:1px dashed %s;text-decoration:line-through" % (C_NEG, C_NEG)
              if kind == "dead" else "background:#1B2328;color:%s;border:1px solid %s" % (C_INK, C_RULE)),
             t, C_ACC if sel else (C_NEG if kind == "dead" else C_MUTED),
             {"found":"found","grow":"grow","merge":"merge","dead":"dead","none":"idle"}[kind]))
    return '<div style="display:flex;gap:8px">%s</div>' % "".join(tiles)

def build_c():
    body = (
      '<div style="width:1440px;height:900px;background:%s;color:%s;font-family:\'IBM Plex Sans\',Helvetica,Arial,sans-serif;'
      'font-size:13px;display:flex;flex-direction:column;overflow:hidden">'
      '<div style="height:56px;flex-shrink:0;border-bottom:1px solid %s;display:flex;align-items:center;'
      'justify-content:space-between;padding:0 32px">'
      '<div style="display:flex;align-items:center;gap:14px">'
      '<span style="font-size:15px;font-weight:600;letter-spacing:.22em">BOOMTOWN</span>'
      '<span style="width:1px;height:16px;background:%s"></span>'
      '<span class="lbl">Classic · 12×9 · safe 11 · end 41</span></div>'
      '<div style="display:flex;align-items:center;gap:18px">'
      '<span class="lbl">Turn <span class="m" style="color:%s;font-size:12px">14</span></span>'
      '<span style="border:1px solid %s;color:%s;border-radius:2px;padding:5px 12px;font-size:11px;'
      'letter-spacing:.14em;text-transform:uppercase">Place a tile</span></div></div>'
      '<div style="flex-grow:1;display:flex;gap:28px;padding:26px 32px 28px">'
      '<div style="width:534px;flex-shrink:0;display:flex;flex-direction:column;gap:20px">%s%s%s</div>'
      '<div style="flex-grow:1;display:flex;flex-direction:column;gap:18px">%s%s%s</div>'
      '</div></div>'
      % (C_BG, C_INK, C_RULE, C_RULE, C_INK, C_ACC, C_ACC,
         board(cell=40, gap=3, hdr=18, empty_bg="#151B1F", empty_ink="#4A585D", grid_ink=C_RULE,
               uninc_bg="#3D4A50", accent=C_ACC, radius=2, label_size=10, header_ink=C_MUTED,
               ring="#3F5057", font_w=500),
         c_panel("Your tiles", c_rack()),
         c_panel("Legend",
                 '<div style="display:flex;flex-wrap:wrap;gap:14px 20px;font-size:11px;color:%s">%s</div>'
                 % (C_MUTED, "".join(
                     '<span style="display:inline-flex;align-items:center;gap:7px">%s%s</span>' % (sw, tx)
                     for sw, tx in [
                       ('<span style="width:13px;height:13px;background:%s;border-radius:2px"></span>' % C_ACC, "selected — 9F"),
                       ('<span style="width:13px;height:13px;border:2px solid #3F5057;border-radius:2px"></span>', "other playable tiles"),
                       ('<span style="width:13px;height:13px;border:2px solid %s;border-radius:2px"></span>' % C_ACC, "dead tile — 3F"),
                       ('<span style="width:13px;height:13px;background:#3D4A50;border-radius:2px"></span>', "unincorporated"),
                     ]))),
         c_panel("Market", c_market()),
         c_panel("Holdings", c_holdings(),
                 '<span class="lbl">visible-stock game</span>'),
         c_panel("Merger exposure — 9F", c_exposure(),
                 '<span class="lbl" style="color:%s">Enrun defunct at 6 · $700</span>' % C_ACC)))
    write("TradingFloor.dc.html", C_HELMET, body)

# =============================================================== RULES MODEL
R_BG, R_PANEL, R_INK, R_MUTED, R_RULE, R_ACC = "#F6F4EF", "#FFFFFF", "#1E1C19", "#77706A", "#DFD9CF", "#A5361F"
R_HELMET = """  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap">
  <style>
    body { margin: 0; }
    a { color: #A5361F; } a:hover { color: #7A2413; }
    .m { font-family: 'IBM Plex Mono', ui-monospace, monospace; font-variant-numeric: tabular-nums; }
    .lbl { font-size: 10px; letter-spacing: .16em; text-transform: uppercase; color: #77706A; }
    .h2 { font-size: 19px; font-weight: 600; letter-spacing: -.01em; }
  </style>"""

def r_section(title, kicker, inner):
    return ('<div style="display:flex;flex-direction:column;gap:16px">'
            '<div style="display:flex;align-items:baseline;gap:14px;border-bottom:2px solid %s;padding-bottom:9px">'
            '<span class="h2">%s</span><span style="font-size:12px;color:%s">%s</span></div>%s</div>'
            % (R_INK, title, R_MUTED, kicker, inner))

def r_box(label, lines, accent=False, w=None):
    return ('<div style="%sbackground:%s;border:1px solid %s;%sborder-radius:3px;padding:12px 14px;'
            'display:flex;flex-direction:column;gap:5px">'
            '<div style="font-size:13px;font-weight:600">%s</div>'
            '<div style="font-size:11.5px;line-height:1.5;color:%s">%s</div></div>'
            % ("width:%dpx;flex-shrink:0;" % w if w else "flex-grow:1;", R_PANEL, R_RULE,
               "border-left:3px solid %s;" % R_ACC if accent else "", label, R_MUTED, lines))

def r_flow():
    steps = [("1 · Place a tile", "Mandatory if any tile is playable. Exactly one outcome fires."),
             ("2 · Buy stock", "Up to 3 shares total, any mix of <em>active</em> corporations. Optional. Bank stock and cash both cap it."),
             ("3 · Draw", "Draw back to six tiles."),
             ("4 · Dead-tile sweep", "Discard permanently unplayable tiles face-up, draw replacements. <strong>2015 only.</strong>"),
             ("5 · End check", "Player <em>may</em> announce the end if a condition holds. Never forced.")]
    row = []
    for i, (t, d) in enumerate(steps):
        if i: row.append('<div style="display:flex;align-items:center;padding:0 2px">%s</div>' % chevron(R_MUTED, 18))
        row.append(r_box(t, d, accent=(i == 0)))
    outcomes = [("Nothing", "No orthogonally adjacent tile. Tile simply sits unincorporated."),
                ("Found", "Adjacent to one or more unincorporated tiles and no corporation. Founder picks any free headquarters, places it on any tile of the new group, and takes 1 free share — <em>if the bank still has one</em>. Blocked while all 7 headquarters are in play; the tile stays in hand and is <strong>not</strong> dead."),
                ("Grow", "Adjacent to exactly one corporation. That corporation absorbs the tile and any unincorporated tiles it touches."),
                ("Merge", "Adjacent to two or more corporations. Largest survives; mergemaker breaks size ties. Illegal if it would dissolve a safe corporation — two safe corporations can never merge.")]
    return ('<div style="display:flex;flex-direction:column;gap:18px">'
            '<div style="display:flex;align-items:stretch">%s</div>'
            '<div style="display:flex;gap:12px;padding-left:0">'
            '<div style="width:96px;flex-shrink:0;display:flex;flex-direction:column;justify-content:center">'
            '<span class="lbl">Placement<br>outcomes</span></div>%s</div></div>'
            % ("".join(row), "".join(r_box(t, d) for t, d in outcomes)))

def r_merger():
    steps = [
      ("a", "Count sizes <em>before</em> the merging tile", "The placed tile never counts toward either corporation when sizes, prices or bonuses are determined. It joins the survivor afterwards."),
      ("b", "Rank the corporations", "Largest survives. On a tie the mergemaker chooses the survivor. With three or more, every smaller corporation goes defunct at once."),
      ("c", "Resolve defunct corporations one at a time, largest first", "The mergemaker breaks ties in ordering. Each is fully resolved before the next begins."),
      ("d", "Pay stockholder bonuses", "Priced by the defunct corporation's size before the merger. Ties resolved per the table below. Nothing is paid on the surviving corporation."),
      ("e", "Dispose of defunct stock — mergemaker first, then clockwise", "Each holder may split their shares across <strong>hold</strong>, <strong>sell</strong> (at the defunct price) and <strong>trade</strong> (2 defunct → 1 survivor). Trading is capped by the survivor's remaining bank stock."),
      ("f", "Return the headquarters", "The marker goes back to the tray and can found a new corporation of that name later. Held shares of that name become live again if it is refounded."),
    ]
    return '<div style="display:flex;flex-direction:column;gap:8px">%s</div>' % "".join(
      '<div style="display:flex;gap:14px;background:%s;border:1px solid %s;border-radius:3px;padding:12px 15px">'
      '<span class="m" style="width:18px;flex-shrink:0;color:%s;font-size:13px">%s</span>'
      '<div style="flex-grow:1"><div style="font-size:13px;font-weight:600;margin-bottom:3px">%s</div>'
      '<div style="font-size:11.5px;line-height:1.5;color:%s">%s</div></div></div>'
      % (R_PANEL, R_RULE, R_ACC, k, t, R_MUTED, d) for k, t, d in steps)

def r_config():
    rows = [("Board", "100 tiles, dimensions not stated in the rulebook", "12 × 9 = 108 tiles, 1A – 12I", "boardCols / boardRows"),
            ("Safe size", "10 or more tiles", "11 or more tiles", "safeSize"),
            ("End trigger", "one corporation at 38+", "one chain at 41+", "endChainSize"),
            ("Bonus tiers", "primary · secondary · tertiary", "majority · minority", "bonusTiers"),
            ("Price bands", "2, 3, 4, 5, 6–7, 8–17, 18–27, 28–37, 38+", "2, 3, 4, 5, 6–10, 11–20, 21–30, 31–40, 41+", "priceBands"),
            ("Sole shareholder", "takes primary <em>and</em> tertiary", "takes both bonuses", "soleHolderPolicy"),
            ("Dead tiles", "discarded face-up and replaced at end of turn", "not addressed — tile stays in hand", "deadTilePolicy"),
            ("Two-player rule", "the bank is a shareholder; its holding is drawn from the tile pile each merger", "not addressed", "phantomShareholder")]
    head = ('<div style="display:grid;grid-template-columns:150px 1fr 1fr 168px;gap:0;padding:0 14px 9px;'
            'border-bottom:1px solid %s" class="lbl"><div>Rule</div><div>2015 Avalon Hill</div>'
            '<div>Classic</div><div>Config key</div></div>' % R_RULE)
    body = "".join(
      '<div style="display:grid;grid-template-columns:150px 1fr 1fr 168px;gap:0;padding:11px 14px;'
      'border-bottom:1px solid rgba(223,217,207,.7);font-size:12px;line-height:1.45">'
      '<div style="font-weight:600">%s</div><div style="color:%s">%s</div><div style="color:%s">%s</div>'
      '<div class="m" style="font-size:11px;color:%s">%s</div></div>'
      % (r, R_MUTED, a, R_MUTED, b, R_ACC, k) for r, a, b, k in rows)
    return '<div style="background:%s;border:1px solid %s;border-radius:3px;padding:14px 0 0">%s%s</div>' % (R_PANEL, R_RULE, head, body)

def r_table():
    t1 = BANDS_CLASSIC + ["—", "—"]
    t2 = ["—"] + BANDS_CLASSIC + ["—"]
    t3 = ["—", "—"] + BANDS_CLASSIC
    n1 = BANDS_2015 + ["—", "—"]
    n2 = ["—"] + BANDS_2015 + ["—"]
    n3 = ["—", "—"] + BANDS_2015
    cols = "88px 88px 88px 18px 88px 88px 88px 30px 84px 92px 100px 92px"
    head = ('<div style="display:grid;grid-template-columns:%s;gap:0;padding:0 14px 9px;border-bottom:1px solid %s" class="lbl">'
            '<div>Cl · T1</div><div>Cl · T2</div><div>Cl · T3</div><div></div>'
            '<div>15 · T1</div><div>15 · T2</div><div>15 · T3</div><div></div>'
            '<div style="text-align:right">Share</div><div style="text-align:right">Primary</div>'
            '<div style="text-align:right;color:%s">Secondary</div>'
            '<div style="text-align:right">Tertiary</div></div>' % (cols, R_RULE, R_ACC))
    rows = []
    for i in range(11):
        rows.append(
          '<div style="display:grid;grid-template-columns:%s;gap:0;align-items:center;height:31px;padding:0 14px;'
          'border-bottom:1px solid rgba(223,217,207,.7)" class="m">'
          '<div style="font-size:12px;color:%s">%s</div><div style="font-size:12px;color:%s">%s</div>'
          '<div style="font-size:12px;color:%s">%s</div><div></div>'
          '<div style="font-size:12px;color:%s">%s</div><div style="font-size:12px;color:%s">%s</div>'
          '<div style="font-size:12px;color:%s">%s</div><div></div>'
          '<div style="text-align:right;font-size:13px;font-weight:500">%s</div>'
          '<div style="text-align:right;font-size:12px">%s</div>'
          '<div style="text-align:right;font-size:12px;color:%s">%s</div>'
          '<div style="text-align:right;font-size:12px">%s</div></div>'
          % (cols,
             R_INK if t1[i] != "—" else R_MUTED, t1[i], R_INK if t2[i] != "—" else R_MUTED, t2[i],
             R_INK if t3[i] != "—" else R_MUTED, t3[i],
             R_INK if n1[i] != "—" else R_MUTED, n1[i], R_INK if n2[i] != "—" else R_MUTED, n2[i],
             R_INK if n3[i] != "—" else R_MUTED, n3[i],
             money(PRICE_ROWS[i]), money(PRIMARY[i]), R_ACC, money(SECOND2015[i]), money(TERTIARY[i])))
    note = ('<div style="padding:12px 14px;font-size:11.5px;line-height:1.55;color:%s">'
            'Tier 1 = Chapter 11, Radio Hut · Tier 2 = Pan-Atlas, Enrun, Blackcurrant · Tier 3 = Megahit Video, Toys Я Were. '
            'Primary is always 10× the share price and tertiary (classic: minority) is always 5×. '
            '<strong style="color:%s">The 2015 secondary column is not a multiple of anything</strong> — it is a printed lookup and must ship as data. '
            'Verified against the rulebook\'s own example: a five-tile tier-3 corporation pays 7,000 / 5,000 / 3,500.</div>'
            % (R_MUTED, R_ACC))
    return '<div style="background:%s;border:1px solid %s;border-radius:3px;padding:14px 0 0">%s%s%s</div>' % (R_PANEL, R_RULE, head, "".join(rows), note)

def r_example():
    def col(title, lines, accent=False):
        return ('<div style="flex-grow:1;background:%s;border:1px solid %s;%sborder-radius:3px;padding:14px 16px;'
                'display:flex;flex-direction:column;gap:9px">'
                '<div class="lbl"%s>%s</div>%s</div>'
                % (R_PANEL, R_RULE, "border-left:3px solid %s;" % R_ACC if accent else "",
                   ' style="color:%s"' % R_ACC if accent else "", title,
                   "".join('<div style="display:flex;justify-content:space-between;font-size:12.5px;'
                           'padding:4px 0;border-bottom:1px solid rgba(223,217,207,.6)">'
                           '<span style="color:%s">%s</span><span class="m" style="color:%s">%s</span></div>'
                           % (R_MUTED, a, R_INK, b) for a, b in lines)))
    setup = col("The position", [("Enrun goes defunct at", "6 tiles"), ("Share price", "$700"),
                                ("You", "3 shares"), ("Nadia", "3 shares"),
                                ("June", "1 share"), ("Ravi", "0 shares")])
    classic = col("Classic — 2 bonuses", [("Primary", "$7,000"), ("Minority", "$3,500"),
                                          ("Tie for primary", "(7,000 + 3,500) ÷ 2"),
                                          ("You / Nadia", "$5,250 each"), ("June", "nothing"),
                                          ("Ravi", "nothing")])
    new = col("2015 — 3 bonuses", [("Primary", "$7,000"), ("Secondary", "$5,000"), ("Tertiary", "$3,500"),
                                   ("Tie for primary", "(7,000 + 5,000) ÷ 2"),
                                   ("You / Nadia", "$6,000 each"), ("June, now secondary", "$3,500")], accent=True)
    tie = ('<div style="display:flex;flex-direction:column;gap:8px">%s</div>' % "".join(
      '<div style="display:flex;gap:12px;font-size:12px;line-height:1.5;background:%s;border:1px solid %s;'
      'border-radius:3px;padding:11px 14px"><span class="lbl" style="width:118px;flex-shrink:0;padding-top:2px">%s</span>'
      '<span style="flex-grow:1;color:%s">%s</span></div>' % (R_PANEL, R_RULE, t, R_MUTED, d)
      for t, d in [
        ("Tie · primary", "Combine primary and secondary, halve, round up to the nearest 100. The next holder down becomes secondary and receives the tertiary bonus; the tertiary bonus is then spent. <em>Classic: combine primary and minority.</em>"),
        ("Tie · secondary", "Combine secondary and tertiary, halve, round up. The third-most holder receives nothing. <em>Classic: split the minority bonus.</em>"),
        ("Tie · tertiary", "Split the tertiary bonus, round up. 2015 only."),
        ("Sole shareholder", "One holder takes the primary and the tertiary bonus — <strong>not</strong> the secondary. <em>Classic: takes both bonuses.</em>"),
      ]))
    return ('<div style="display:flex;flex-direction:column;gap:16px">'
            '<div style="display:flex;gap:12px">%s%s%s</div>%s</div>' % (setup, classic, new, tie))

def r_invariants():
    items = [
      ("Stock is finite", "25 shares per corporation, 7 corporations, 175 total. An empty bank blocks buying, the founder's bonus and 2:1 trades alike — the founder simply gets nothing."),
      ("Active stock never sells", "Shares can only be turned into cash by a merger disposal or the final settlement. No loans, no player-to-player trading."),
      ("Broke is playable", "A player with no cash still places and draws; they just cannot buy. There is no elimination."),
      ("Purchases cap at three", "Per turn, across all corporations, and only in corporations already on the board."),
      ("Safe is permanent", "Once a corporation reaches the safe size it can never go defunct, though it can still absorb others and keep growing."),
      ("Two kinds of unplayable", "<strong>Permanently dead</strong> — would merge two safe corporations; discarded and replaced (2015). <strong>Temporarily blocked</strong> — would found an eighth corporation; stays in hand and may become playable later."),
      ("Ending is a choice", "A player may announce the end when a condition holds, or keep playing. They finish the turn after announcing."),
      ("Final settlement", "Pay bonuses for every active corporation as if it were merging, then the bank buys back all stock at the current price. Stock in a corporation not on the board is worth nothing."),
      ("Hidden information", "Tiles in hand and the face-down pile are always hidden. Cash and holdings are hidden or open by agreement — a per-table setting, not a rule."),
      ("A corporation has two names", "The base name belongs to the headquarters marker and never changes; the display name blends on every acquisition. Held defunct stock, refounding and the tile badge all key off the base name."),
      ("Tile draw is a bag", "Tiles are drawn from a shared face-down pile, not dealt. Running out of tiles is possible and ends nobody's turn early."),
    ]
    return ('<div style="display:grid;grid-template-columns:repeat(2, minmax(0, 1fr));gap:12px">%s</div>'
            % "".join(r_box(t, d) for t, d in items))

def r_open():
    items = [
      ("How big is the 2015 board?", "The rulebook lists 100 building tiles but never states the grid, and the only coordinates it prints are 1A, 2B and 9F. The classic 12 × 9 = 108 is unambiguous, so the engine should take dimensions as config and default to it."),
      ("Names have not been cleared", "The seven corporations, the city and the title are original. The published rules and mechanics are not protectable, but the original game's name and its corporation names are - and nothing here has been trademark-searched. That should happen before launch. Names, colours and tiers are pure data either way."),
      ("Round-up on split bonuses", "The 2015 rules say round up to the nearest 100; the classic rules say divide equally and are silent on rounding. Worth one config flag rather than two code paths."),
    ]
    return '<div style="display:flex;flex-direction:column;gap:10px">%s</div>' % "".join(
      '<div style="display:flex;gap:14px;background:%s;border:1px solid %s;border-left:3px solid %s;'
      'border-radius:3px;padding:13px 16px"><div style="flex-grow:1">'
      '<div style="font-size:13px;font-weight:600;margin-bottom:4px">%s</div>'
      '<div style="font-size:11.5px;line-height:1.55;color:%s">%s</div></div></div>'
      % (R_PANEL, R_RULE, R_ACC, t, R_MUTED, d) for t, d in items)

def build_rules():
    body = (
      '<div style="width:1440px;min-height:4400px;background:%s;color:%s;font-family:\'IBM Plex Sans\',Helvetica,Arial,sans-serif;'
      'font-size:13px;padding:44px 52px 56px;display:flex;flex-direction:column;gap:38px">'
      '<div style="display:flex;align-items:flex-end;justify-content:space-between;gap:40px">'
      '<div style="display:flex;flex-direction:column;gap:9px">'
      '<span class="lbl">Boomtown · web version</span>'
      '<span style="font-size:34px;font-weight:600;letter-spacing:-.02em">Rules model</span>'
      '<span style="font-size:13.5px;line-height:1.5;color:%s;max-width:720px">Reconciled from the 2015 Avalon Hill '
      'rulebook and the classic rules. Where the two disagree the difference is configuration, not a fork — '
      'the column on the right of each divergence is the key the engine reads.</span></div>'
      '<div style="display:flex;gap:10px">%s</div></div>'
      '%s%s%s%s%s%s%s</div>'
      % (R_BG, R_INK, R_MUTED,
         "".join('<div style="border:1px solid %s;border-radius:3px;padding:9px 13px;text-align:right">'
                 '<div class="lbl" style="margin-bottom:3px">%s</div>'
                 '<div class="m" style="font-size:14px">%s</div></div>' % (R_RULE, a, b)
                 for a, b in [("Players", "2 – 6"), ("Corporations", "7"), ("Shares each", "25"), ("Start cash", "$6,000")]),
         r_section("Turn", "one placement, an optional purchase, a draw", r_flow()),
         r_section("Merger resolution", "the only part of the game with real sequencing", r_merger()),
         r_section("Edition configuration", "every divergence between the two rule sets", r_config()),
         r_section("Price and bonus table", "the numbers, exactly as printed", r_table()),
         r_section("Bonus ties, worked", "the position on the board opposite, settled under both rule sets", r_example()),
         r_section("Invariants", "things the engine must never allow to drift", r_invariants()),
         r_section("Open questions", "decisions still to make", r_open())))
    write("RulesModel.dc.html", R_HELMET, body)


# =============================================================== MERGED NAMES
GAME = [("video", "air"), ("tech", "energy"), ("video", "electronics"),
        ("video", "books"), ("video", "@tech")]

def game_lineage():
    """Replays one plausible game. The name takes a single fragment from whatever
    it swallowed; the flavour text takes everything that was in there."""
    st = {k: {"names": [], "flavors": [CORP[k]["flavor"]]} for k in ORDER}
    def disp(k):
        return display_name(CORP[k]["name"], st[k]["names"]) if st[k]["names"] else CORP[k]["name"]
    out = []
    for surv, acq in GAME:
        ak = acq[1:] if acq.startswith("@") else acq
        aname = disp(ak) if acq.startswith("@") else CORP[ak]["name"]
        before = disp(surv)
        st[surv]["names"] = st[surv]["names"] + [aname]
        st[surv]["flavors"] = st[surv]["flavors"] + st[ak]["flavors"]
        out.append((surv, before, aname, disp(surv), len(st[surv]["flavors"]), list(st[surv]["flavors"])))
    return out

LINEAGE = game_lineage()

def n_tiles(word, keep, keep_color, drop_color, ink="#FFFFFF", size=27):
    ls = _letters(word)
    return '<div style="display:flex;gap:3px">%s</div>' % "".join(
      '<div style="width:%dpx;height:32px;border-radius:2px;display:flex;align-items:center;'
      'justify-content:center;font-size:15px;font-weight:600;%s">%s</div>'
      % (size, "background:%s;color:%s" % (keep_color, ink) if i in keep else
         "background:transparent;color:%s;border:1px dashed %s;text-decoration:line-through" % (drop_color, drop_color),
         ch.upper()) for i, ch in enumerate(ls))

def n_rule():
    base, sc = CORP["video"]["name"], CORP["video"]["color"]
    ls = _letters(base); nh = int(round(0.75 * len(ls)))
    frags = [("air", 0), ("electronics", 0), ("books", 0), ("tech", 0)]
    chips = "".join(
      '<div style="display:flex;align-items:center;gap:10px;background:%s;border:1px solid %s;border-radius:3px;'
      'padding:8px 12px"><span style="font-size:12px;color:%s">%s</span><span style="color:%s">→</span>'
      '<span class="m" style="font-size:15px;font-weight:500;color:%s">%s</span></div>'
      % (R_BG, R_RULE, R_MUTED, CORP[k]["name"], R_MUTED, CORP[k]["color"], fragment(CORP[k]["name"]))
      for k, _ in frags)
    return ('<div style="background:%s;border:1px solid %s;border-radius:3px;padding:22px 24px;'
            'display:flex;flex-direction:column;gap:20px">'
            '<div style="display:flex;align-items:center;gap:18px">'
            '<div style="width:210px;flex-shrink:0"><div style="font-size:13px;font-weight:600">The stem, once</div>'
            '<div style="font-size:11px;color:%s;margin-top:2px">75%% of the base name, taken at founding and '
            'never shortened again</div></div>%s</div>'
            '<div style="display:flex;align-items:flex-start;gap:18px;border-top:1px solid %s;padding-top:20px">'
            '<div style="width:210px;flex-shrink:0"><div style="font-size:13px;font-weight:600">A fragment, each time</div>'
            '<div style="font-size:11px;color:%s;margin-top:2px">the last syllable of the last real word, three to '
            'six letters</div></div><div style="display:flex;flex-wrap:wrap;gap:10px">%s</div></div>'
            '<div style="display:flex;align-items:center;gap:18px;border-top:1px solid %s;padding-top:20px">'
            '<div style="width:210px;flex-shrink:0"><div style="font-size:13px;font-weight:600">Nothing is discarded</div>'
            '<div style="font-size:11px;color:%s;margin-top:2px">every meal stays on the name</div></div>'
            '<div style="display:flex;align-items:baseline;gap:2px;flex-wrap:wrap">%s</div></div></div>'
            % (R_PANEL, R_RULE, R_MUTED, n_tiles(base, set(range(nh)), sc, R_MUTED),
               R_RULE, R_MUTED, chips, R_RULE, R_MUTED,
               ('<span style="font-size:27px;font-weight:600;color:%s">%s</span>' % (sc, stem(base))) +
               "".join('<span style="font-size:27px;font-weight:600;color:%s">%s</span>'
                       % (CORP[k]["color"], fragment(CORP[k]["name"])) for k, _ in frags)))

def n_lineage():
    head = ('<div style="display:grid;grid-template-columns:36px 1fr 1fr 250px 62px 54px;gap:0;padding:0 16px 9px;'
            'border-bottom:1px solid %s" class="lbl"><div>#</div><div>Survivor</div><div>Swallows</div>'
            '<div style="color:%s">Becomes</div><div style="text-align:right">Letters</div>'
            '<div style="text-align:right">Slots</div></div>' % (R_RULE, R_ACC))
    rows = "".join(
      '<div style="display:grid;grid-template-columns:36px 1fr 1fr 250px 62px 54px;align-items:center;height:38px;'
      'padding:0 16px;border-bottom:1px solid rgba(223,217,207,.7);%s">'
      '<div class="m" style="font-size:12px;color:%s">%d</div>'
      '<div style="font-size:13px;color:%s">%s</div><div style="font-size:13px;color:%s">%s</div>'
      '<div class="m" style="font-size:15px;font-weight:500;color:%s">%s</div>'
      '<div class="m" style="text-align:right;font-size:12px;color:%s">%d</div>'
      '<div class="m" style="text-align:right;font-size:12px;color:%s">%d</div></div>'
      % ("background:rgba(165,54,31,.05)" if i == 1 else "", R_MUTED, i + 1,
         R_INK, before, R_MUTED, acq, CORP[key]["color"], after, R_MUTED, len(after), R_MUTED, slots)
      for i, (key, before, acq, after, slots, _f) in enumerate(LINEAGE))
    note = ('<div style="padding:13px 16px;font-size:11.5px;line-height:1.55;color:%s">'
            'Merger one already happened — it is why Megahit is sitting on a two-slot card. By the end one '
            'corporation is carrying '
            '<strong style="color:%s">%d letters</strong> and six companies\' worth of history. Nothing truncates: '
            'the card grows instead.</div>' % (R_MUTED, R_ACC, len(LINEAGE[-1][3])))
    return '<div style="background:%s;border:1px solid %s;border-radius:3px;padding:16px 0 0">%s%s%s</div>' % (R_PANEL, R_RULE, head, rows, note)

def n_stage(label, turn, cards, tray):
    cs = "".join(
      '<div style="flex-grow:%d;flex-basis:0;min-width:0;background:%s;border:1px solid %s;border-top:3px solid %s;'
      'border-radius:3px;padding:9px 11px;display:flex;flex-direction:column;gap:4px">'
      '<div class="m" style="font-size:13px;font-weight:500;color:%s;overflow:hidden;text-overflow:ellipsis;'
      'white-space:nowrap">%s</div>'
      '<div style="font-size:10px;color:%s;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">%s</div></div>'
      % (slots, R_PANEL, R_RULE, CORP[k]["color"], R_INK, nm, R_MUTED,
         ("%d slot" % slots) if slots == 1 else ("%d slots" % slots))
      for k, nm, slots in cards)
    tr = ('<div style="width:96px;flex-shrink:0;border:1px dashed %s;border-radius:3px;padding:9px 11px;'
          'display:flex;flex-direction:column;justify-content:center;gap:3px">'
          '<div class="m" style="font-size:14px;color:%s">%d</div>'
          '<div style="font-size:10px;color:%s;line-height:1.3">in the tray</div></div>'
          % (R_RULE, R_MUTED, tray, R_MUTED)) if tray else ""
    return ('<div style="display:flex;flex-direction:column;gap:8px">'
            '<div style="display:flex;align-items:baseline;gap:10px">'
            '<span style="font-size:12px;font-weight:600">%s</span><span class="lbl">%s</span></div>'
            '<div style="display:flex;gap:8px;align-items:stretch">%s%s</div></div>' % (label, turn, cs, tr))

def n_endcard():
    key, _, _, name, slots, flavors = LINEAGE[-1]
    c = CORP[key]
    marks = "".join(b_mark(k, CORP[k]["color"], 16) for k in ["air", "electronics", "books", "tech", "energy"])
    return ('<div style="background:%s;border:1px solid %s;border-top:3px solid %s;border-radius:3px;'
            'padding:18px 22px;display:flex;flex-direction:column;gap:11px">'
            '<div style="display:flex;align-items:flex-start;justify-content:space-between">%s'
            '<span style="display:inline-flex;align-items:center;gap:4px;font-size:10px;letter-spacing:.1em;'
            'text-transform:uppercase;color:%s">%s safe</span></div>'
            '<div class="m" style="font-size:30px;font-weight:500;color:%s">%s</div>'
            '<div style="font-size:12.5px;line-height:1.5;color:%s">%s</div>'
            '<div style="display:flex;align-items:center;gap:14px;border-top:1px solid %s;padding-top:12px">'
            '<span class="lbl">contains</span><span style="display:inline-flex;gap:7px">%s</span>'
            '<span class="m" style="font-size:12px;color:%s;margin-left:auto">%d slots · %d letters</span></div></div>'
            % (R_PANEL, R_RULE, c["color"], b_mark(key, c["color"], 28), c["color"], icon("safe", c["color"], 12),
               c["color"], name, R_MUTED, " · ".join(flavors), R_RULE, marks, R_MUTED, slots, len(name)))

def n_consolidation():
    L = LINEAGE
    stages = [
      ("Everyone is founded", "turn 6", [(k, CORP[k]["name"], 1) for k in ORDER], 0),
      ("Megahit has eaten one", "turn 14 — the table",
       [("books", CORP["books"]["name"], 1), ("electronics", CORP["electronics"]["name"], 1),
        ("energy", CORP["energy"]["name"], 1), ("tech", CORP["tech"]["name"], 1),
        ("video", L[0][3], 2)], 2),
      ("Two left standing", "turn 34", [("tech", L[1][3], 2), ("video", L[3][3], 4)], 5),
      ("One buyer, one holdout", "endgame",
       [("video", L[4][3], 6), ("toys", CORP["toys"]["name"], 1)], 5),
    ]
    return ('<div style="display:flex;flex-direction:column;gap:20px">%s'
            '<div style="font-size:11.5px;line-height:1.6;color:%s;background:%s;border:1px solid %s;'
            'border-left:3px solid %s;border-radius:3px;padding:14px 16px">A card is one slot wide per corporation '
            'it contains, so the band is always the same total width and a corporation has exactly as much room as '
            'it has earned. The long-name problem solves itself — and so does the long-flavour problem, because the '
            'promises pile up at the same rate the name does.</div></div>'
            % ("".join(n_stage(*st) for st in stages), R_MUTED, R_PANEL, R_RULE, R_ACC))

def n_properties():
    items = [
      ("Derived, never stored", "A corporation is a base name plus an ordered list of what it has eaten. The display name is computed from those two, so it can never drift out of sync, and changing the rule re-renders history rather than corrupting it."),
      ("Two names, always", "The base name belongs to the headquarters marker. Held defunct stock, refounding and the tile badge all key off it. Only the display name accretes."),
      ("Refounding resets", "A returned headquarters comes back under its own name. A player holding Enrun stock from four mergers ago is holding Enrun stock, not a fragment of somebody else's."),
      ("The badge never moves", "The stem is taken from the front, so the initial on the headquarters tile is fixed for the whole game. Colour is fixed for the same reason — neither is derived from the display name."),
      ("Multi-mergers append twice", "A tile joining three corporations resolves defunct chains largest-first and appends one fragment per defunct, in that order. One placement can add two fragments."),
      ("A blocklist is not optional", "Concatenating fragments of seven brands will eventually produce something unshippable. Check the assembled result and fall back to the next syllable boundary, not to the unblended name."),
    ]
    return ('<div style="display:grid;grid-template-columns:repeat(2, minmax(0, 1fr));gap:12px">%s</div>'
            % "".join(r_box(t, d) for t, d in items))

def n_config():
    lines = [("mergeNaming.enabled", "true", "off entirely, and survivors keep their own names"),
             ("mergeNaming.stem", "0.75", "share of the base name kept, from the front, computed once"),
             ("mergeNaming.fragment", "lastSyllable", "or a flat character count, if syllables feel too clever"),
             ("mergeNaming.minFragment", "3", "letters, so a one-syllable name still contributes something"),
             ("mergeNaming.maxFragment", "6", "letters, so a long word cannot swamp the stem"),
             ("mergeNaming.flavour", "concat", "the survivor inherits every flavour line it swallowed"),
             ("pool.onePerIndustry", "true", "seven drawn per game, one from each industry"),
             ("mergeNaming.collapseSeam", "true", "drop a doubled letter where a fragment joins"),
             ("mergeNaming.blocklist", "[\u2026]", "checked against the assembled name, not the fragments")]
    return ('<div style="background:%s;border:1px solid %s;border-radius:3px;padding:16px 0">%s</div>'
            % (R_PANEL, R_RULE, "".join(
      '<div style="display:grid;grid-template-columns:250px 132px 1fr;align-items:center;height:34px;padding:0 16px;'
      'border-bottom:1px solid rgba(223,217,207,.6)">'
      '<div class="m" style="font-size:12px;color:%s">%s</div>'
      '<div class="m" style="font-size:12px;color:%s">%s</div>'
      '<div style="font-size:11.5px;color:%s">%s</div></div>' % (R_ACC, k, R_INK, v, R_MUTED, d)
      for k, v, d in lines)))

def build_names():
    body = (
      '<div style="width:1440px;min-height:2560px;background:%s;color:%s;font-family:\'IBM Plex Sans\',Helvetica,Arial,sans-serif;'
      'font-size:13px;padding:44px 52px 56px;display:flex;flex-direction:column;gap:38px">'
      '<div style="display:flex;flex-direction:column;gap:9px">'
      '<span class="lbl">Boomtown · web version</span>'
      '<span style="font-size:34px;font-weight:600;letter-spacing:-.02em">Merged names</span>'
      '<span style="font-size:13.5px;line-height:1.5;color:%s;max-width:780px">A corporation keeps three quarters '
      'of its own name forever, and adds a piece of everything it swallows. The name never resets and never '
      'truncates, so by the endgame the market leader is wearing its whole history — and is unpronounceable.</span></div>'
      '%s%s%s%s%s%s</div>'
      % (R_BG, R_INK, R_MUTED,
         r_section("The rule", "a stem, then one fragment per acquisition", n_rule()),
         r_section("Five mergers deep", "one game, played out", n_lineage()),
         r_section("What the last card looks like", "name and flavour, both at full length", n_endcard()),
         r_section("The cards consolidate too", "which is what keeps long names readable", n_consolidation()),
         r_section("What the rule has to respect", "the parts that touch the rest of the engine", n_properties()),
         r_section("Configuration", "all of it, one object", n_config())))
    write("Names.dc.html", R_HELMET, body)


# =============================================================== THE POOL
INDUSTRY_LABEL = {"books": "Books & retail", "electronics": "Electronics", "air": "Air travel",
                  "energy": "Energy", "tech": "Devices & web", "video": "Video & film", "toys": "Toys"}

def p_group(key):
    tier, col, ink, cands = POOL[key]
    rows = "".join(
      '<div style="display:grid;grid-template-columns:168px 1fr 148px;align-items:center;height:31px;'
      'padding:0 14px;border-bottom:1px solid rgba(223,217,207,.7);%s">'
      '<div style="display:flex;align-items:center;gap:8px">'
      '<span style="width:5px;height:5px;border-radius:50%%;background:%s"></span>'
      '<span style="font-size:13px;font-weight:%d">%s</span></div>'
      '<div style="font-size:11.5px;color:%s">%s</div>'
      '<div style="font-size:11px;color:%s;text-align:right">%s</div></div>'
      % ("background:rgba(165,54,31,.05)" if i == DRAW[key] else "",
         col if i == DRAW[key] else "transparent", 600 if i == DRAW[key] else 400,
         nm, R_MUTED, fl, R_MUTED, riff)
      for i, (nm, fl, riff) in enumerate(cands))
    return ('<div style="background:%s;border:1px solid %s;border-top:3px solid %s;border-radius:3px;'
            'display:flex;flex-direction:column">'
            '<div style="display:flex;align-items:center;gap:10px;padding:11px 14px;border-bottom:1px solid %s">'
            '%s<span style="font-size:13px;font-weight:600">%s</span>'
            '<span class="lbl" style="margin-left:auto">Tier %d</span></div>%s</div>'
            % (R_PANEL, R_RULE, col, R_RULE, b_mark(key, col, 19), INDUSTRY_LABEL[key], tier, rows))

def build_pool():
    total = 1
    for k in ORDER:
        total *= len(POOL[k][3])
    body = (
      '<div style="width:1440px;min-height:1180px;background:%s;color:%s;font-family:\'IBM Plex Sans\',Helvetica,Arial,sans-serif;'
      'font-size:13px;padding:44px 52px 56px;display:flex;flex-direction:column;gap:32px">'
      '<div style="display:flex;align-items:flex-end;justify-content:space-between;gap:40px">'
      '<div style="display:flex;flex-direction:column;gap:9px">'
      '<span class="lbl">Boomtown · web version</span>'
      '<span style="font-size:34px;font-weight:600;letter-spacing:-.02em">The pool</span>'
      '<span style="font-size:13.5px;line-height:1.5;color:%s;max-width:760px">Every company here was once the '
      'biggest thing in its category, and then it was eaten — which is the only thing that happens on this board. '
      'A game draws one from each industry, so there are always seven, always one of each, and the marks on the '
      'board stay unique. The highlighted row is the draw the table is showing.</span></div>'
      '<div style="display:flex;gap:10px">%s</div></div>'
      '<div style="display:grid;grid-template-columns:repeat(2, minmax(0, 1fr));gap:16px">%s</div>'
      '<div style="font-size:11.5px;line-height:1.6;color:%s;background:%s;border:1px solid %s;'
      'border-left:3px solid %s;border-radius:3px;padding:14px 16px">The right-hand column is a design note, not a '
      'shipping string — it is here so the list can be reviewed, and it should not appear anywhere in the product. '
      'Tier and colour belong to the industry rather than the company, so swapping a name in or out changes nothing '
      'about balance. Adding a name means adding a row.</div></div>'
      % (R_BG, R_INK, R_MUTED,
         "".join('<div style="border:1px solid %s;border-radius:3px;padding:9px 13px;text-align:right">'
                 '<div class="lbl" style="margin-bottom:3px">%s</div>'
                 '<div class="m" style="font-size:14px">%s</div></div>' % (R_RULE, a, b)
                 for a, b in [("Industries", "7"), ("Candidates", str(sum(len(POOL[k][3]) for k in ORDER))),
                              ("Line-ups", format(total, ",d"))]),
         "".join(p_group(k) for k in ORDER), R_MUTED, R_PANEL, R_RULE, R_ACC))
    write("Pool.dc.html", R_HELMET, body)


# =============================================================== REFERENCE CHART
def ladder(tier, edition="classic"):
    """Every band a corporation of this tier can occupy, cheapest first."""
    bands = BANDS_CLASSIC if edition == "classic" else BANDS_2015
    out = []
    for b, label in enumerate(bands):
        r = b + (tier - 1)
        out.append((label, PRICE_ROWS[r], PRIMARY[r], SECOND2015[r], TERTIARY[r], r))
    return out

def here_at(row, tier):
    """Which corporations currently sit on this row of this tier's column."""
    return [m for m in market() if m["tier"] == tier and m["size"] > 0
            and row_index(m["size"], tier) == row]

def r_chip(m, size=11):
    return ('<span style="display:inline-flex;align-items:center;gap:5px;background:%s;color:#FFF;'
            'border-radius:2px;padding:2px 7px;font-size:%dpx;font-weight:500;white-space:nowrap">'
            '%s<span class="num" style="opacity:.75">%d</span></span>'
            % (m["color"], size, m["display"], m["size"]))

def ref_chart():
    tiers = [(1, [m for m in market() if m["tier"] == 1]),
             (2, [m for m in market() if m["tier"] == 2]),
             (3, [m for m in market() if m["tier"] == 3])]
    cols = "196px 196px 196px 104px 116px 116px"
    head = ('<div style="display:grid;grid-template-columns:%s;border-bottom:2px solid %s">%s'
            '<div style="padding:9px 12px;text-align:right;font-size:10px;letter-spacing:.12em;'
            'text-transform:uppercase;color:%s;align-self:end">Share</div>'
            '<div style="grid-column:span 2;padding:9px 12px;text-align:center;font-size:10px;'
            'letter-spacing:.12em;text-transform:uppercase;color:%s;align-self:end;'
            'border-left:1px solid %s">Shareholder bonus</div></div>'
            % (cols, B_INK,
               "".join('<div style="padding:9px 12px;border-right:1px solid %s;display:flex;'
                       'flex-direction:column;gap:5px">'
                       '<span style="font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:%s">'
                       'Tier %d</span><div style="display:flex;flex-wrap:wrap;gap:4px">%s</div></div>'
                       % (B_RULE, B_MUTED, t,
                          "".join('<span style="font-size:11.5px;color:%s;%s">%s</span>'
                                  % (m["color"] if m["size"] else B_MUTED,
                                     "" if m["size"] else "opacity:.6",
                                     m["display"] + ("," if i < len(ms) - 1 else ""))
                                  for i, m in enumerate(ms)))
                       for t, ms in tiers),
               B_MUTED, B_MUTED, B_RULE))
    rows = []
    for r in range(11):
        cells = []
        for t in (1, 2, 3):
            band = None
            for label, price, maj, sec, mino, rr in ladder(t):
                if rr == r:
                    band = label
            sitting = here_at(r, t) if band else []
            cells.append(
              '<div style="padding:0 12px;border-right:1px solid %s;display:flex;align-items:center;'
              'gap:8px;min-height:40px;%s">'
              '<span class="num" style="font-size:13px;color:%s;width:44px">%s</span>%s</div>'
              % (B_RULE, "background:rgba(179,70,47,.045)" if sitting else "",
                 B_INK if band else B_MUTED, band or "—",
                 "".join(r_chip(m) for m in sitting)))
        rows.append(
          '<div style="display:grid;grid-template-columns:%s;border-bottom:1px solid %s">%s'
          '<div style="padding:0 12px;display:flex;align-items:center;justify-content:flex-end;'
          'font-size:14px;font-weight:700" class="num">%s</div>'
          '<div style="padding:0 12px;display:flex;align-items:center;justify-content:flex-end;'
          'font-size:13px;border-left:1px solid %s" class="num">%s</div>'
          '<div style="padding:0 12px;display:flex;align-items:center;justify-content:flex-end;'
          'font-size:13px;color:%s" class="num">%s</div></div>'
          % (cols, "rgba(231,222,210,.7)", "".join(cells),
             money(PRICE_ROWS[r]), B_RULE, money(PRIMARY[r]), B_MUTED, money(TERTIARY[r])))
    return ('<div style="border:1px solid %s;border-radius:3px;overflow:hidden">%s%s</div>'
            % (B_RULE, head, "".join(rows)))

def ref_modal():
    return (
      '<div style="width:1000px;background:%s;border-radius:5px;box-shadow:0 24px 60px rgba(28,25,23,.35);'
      'overflow:hidden">'
      '<div style="display:flex;align-items:center;justify-content:space-between;padding:20px 24px 16px;'
      'border-bottom:1px solid %s">'
      '<div><div class="ser" style="font-size:24px">Stock reference</div>'
      '<div style="font-size:11.5px;color:%s;margin-top:3px">Classic ruleset · price and bonuses by '
      'corporation size · highlighted rows are where the market stands now</div></div>'
      '<div style="display:flex;align-items:center;gap:14px">'
      '<span style="font-size:11px;color:%s">safe at 11 tiles</span>'
      '<div style="width:30px;height:30px;border:1px solid %s;border-radius:3px;display:flex;'
      'align-items:center;justify-content:center;color:%s">'
      '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" '
      'stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg></div></div></div>'
      '<div style="padding:20px 24px 22px">%s</div>'
      '<div style="display:flex;gap:26px;padding:14px 24px 18px;border-top:1px solid %s;background:%s">'
      '<div style="font-size:11px;line-height:1.5;color:%s;flex-grow:1">Majority is always ten times the '
      'share price and minority five times. A merged corporation prices on the <strong>survivor\'s</strong> '
      'tier — Megahitvilas is tier 3 whatever it swallows.</div>'
      '<div style="font-size:11px;line-height:1.5;color:%s;width:300px">The whole table is generated from the '
      'ruleset. The 2015 preset renders different bands and a third bonus column, from the same component.</div>'
      '</div></div>'
      % (B_PANEL, B_RULE, B_MUTED, B_MUTED, B_RULE, B_MUTED, ref_chart(), B_RULE, B_BG, B_MUTED, B_MUTED))

def ref_company():
    m = [x for x in market() if x["key"] == "video"][0]
    cur = row_index(m["size"], m["tier"])
    ns = next_step(m["size"], m["tier"])
    holders = sorted(((p[0], p[2].get("video", 0)) for p in PLAYERS), key=lambda x: -x[1])
    bonus = [money(PRIMARY[cur]), money(TERTIARY[cur])]
    lad = "".join(
      '<div style="display:grid;grid-template-columns:1fr 84px 96px 96px;align-items:center;height:31px;'
      'padding:0 14px;border-bottom:1px solid rgba(231,222,210,.7);%s">'
      '<div class="num" style="font-size:12.5px;color:%s">%s tiles</div>'
      '<div class="num" style="text-align:right;font-size:13px;font-weight:%d">%s</div>'
      '<div class="num" style="text-align:right;font-size:12px;color:%s">%s</div>'
      '<div class="num" style="text-align:right;font-size:12px;color:%s">%s</div></div>'
      % ("background:rgba(179,70,47,.07)" if rr == cur else "", B_INK if rr == cur else B_MUTED, label,
         700 if rr == cur else 400, money(price), B_MUTED, money(maj), B_MUTED, money(mino))
      for label, price, maj, sec, mino, rr in ladder(m["tier"]))
    who = "".join(
      '<div style="display:flex;align-items:center;justify-content:space-between;height:26px;font-size:12px">'
      '<span style="color:%s">%s%s</span><span class="num" style="color:%s">%s</span></div>'
      % (B_INK if n == "You" else B_MUTED, n,
         " · primary" if i == 0 else (" · secondary" if i == 1 else ""),
         B_INK if i < 2 else B_MUTED,
         ("%d sh — %s" % (v, money(PRIMARY[cur] if i == 0 else TERTIARY[cur]))) if i < 2 and v else "%d sh" % v)
      for i, (n, v) in enumerate(holders))
    return (
      '<div style="width:620px;background:%s;border-radius:5px;box-shadow:0 24px 60px rgba(28,25,23,.35);'
      'overflow:hidden">'
      '<div style="padding:20px 22px 16px;border-bottom:1px solid %s;display:flex;align-items:flex-start;gap:14px">'
      '%s<div style="flex-grow:1"><div class="ser" style="font-size:23px;color:%s">%s</div>'
      '<div style="font-size:11px;color:%s;margin-top:3px">%s</div></div>'
      '<span style="display:inline-flex;align-items:center;gap:4px;font-size:10px;letter-spacing:.1em;'
      'text-transform:uppercase;color:%s">%s safe</span></div>'
      '<div style="display:flex;border-bottom:1px solid %s">%s</div>'
      '<div style="padding:14px 22px 6px;display:flex;align-items:baseline;justify-content:space-between">'
      '<span style="font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:%s">Tier 3 ladder</span>'
      '<span style="font-size:11px;color:%s">next step at <span class="num" style="color:%s">%d tiles</span> '
      '→ <span class="num" style="color:%s">%s</span></span></div>'
      '<div style="margin:8px 8px 0">%s</div>'
      '<div style="padding:14px 22px 18px;border-top:1px solid %s;background:%s">'
      '<div style="font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:%s;margin-bottom:7px">'
      'If it paid out today</div>%s</div></div>'
      % (B_PANEL, B_RULE, b_mark("video", m["color"], 30), m["color"], m["display"], B_MUTED, m["flavor"],
         m["color"], icon("safe", m["color"], 12), B_RULE,
         "".join('<div style="flex-grow:1;padding:13px 22px;%s">'
                 '<div style="font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:%s">%s</div>'
                 '<div class="ser num" style="font-size:22px;margin-top:3px;color:%s">%s</div></div>'
                 % ("border-right:1px solid %s" % B_RULE if i < 2 else "", B_MUTED, a, c, b)
                 for i, (a, b, c) in enumerate([("Size", "%d tiles" % m["size"], B_INK),
                                                ("Share price", money(m["price"]), B_INK),
                                                ("You hold", "%d — %s" % (m["mine"], money(m["mine"] * m["price"])), m["color"])])),
         B_MUTED, B_MUTED, B_INK, ns[0] if ns else 0, m["color"], money(ns[1]) if ns else "—",
         lad, B_RULE, B_BG, B_MUTED, who))

def build_reference():
    def screen(caption, note, modal):
        return ('<div style="display:flex;flex-direction:column;gap:12px">'
                '<div style="display:flex;align-items:baseline;gap:12px">'
                '<span style="font-size:13px;font-weight:600">%s</span>'
                '<span style="font-size:11.5px;color:%s">%s</span></div>'
                '<div style="width:1440px;height:860px;position:relative;overflow:hidden;background:%s;'
                'border:1px solid %s;border-radius:3px">'
                '<div style="position:absolute;inset:0;padding:22px 36px;display:flex;flex-direction:column;gap:22px">'
                '%s<div style="display:flex;gap:28px"><div style="flex-shrink:0">%s</div></div></div>'
                '<div style="position:absolute;inset:0;background:rgba(28,25,23,.52)"></div>'
                '<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center">'
                '%s</div></div></div>'
                % (caption, B_MUTED, note, B_BG, B_RULE, b_band(), b_board_crafted(), modal))
    body = (
      '<div style="width:1440px;min-height:2100px;background:%s;color:%s;font-family:\'DM Sans\',Helvetica,Arial,sans-serif;'
      'font-size:13px;padding:40px 0 48px;display:flex;flex-direction:column;gap:30px;align-items:center">'
      '<div style="width:1440px;padding:0 36px;display:flex;flex-direction:column;gap:9px">'
      '<span style="font-size:10px;letter-spacing:.16em;text-transform:uppercase;color:%s">Boomtown · web version</span>'
      '<span class="ser" style="font-size:32px">Stock reference</span>'
      '<span style="font-size:13px;line-height:1.5;color:%s;max-width:820px">The paper game ships a printed '
      'reference card. The digital one can do the thing cardboard cannot: show where every corporation actually '
      'stands right now, under the current names. Opens from the <strong>Reference</strong> button in the header, '
      'from any price in the market, or with <strong>?</strong>; a single corporation card opens by clicking its '
      'card in the band.</span></div>'
      '%s%s</div>'
      % (B_BG, B_INK, B_MUTED, B_MUTED,
         screen("The full chart", "every tier, every band, with the market's live positions marked", ref_modal()),
         screen("One corporation", "opened from its card in the band — its own ladder, and what it would pay today",
                ref_company())))
    write("Reference.dc.html", B_HELMET, body)

# =============================================================== BEATS (U3)
# Five still-frame artboards — the peak visual of each beat R6/R7 need that
# isn't already covered by Main (the everyday/F3 baseline) or Reference. Launch
# is the Main-menu treatment (U9); first-tile is a note on the board, not its
# own frame (per U3's approach). Each frame is captioned with its motion/sound
# spec so it stands alone as an implementer's target, the way a storyboard
# panel would — the still image is what U11 animates into and out of.

def beat_frame(caption, spec, inner, dark=True):
    bg = "#17140F" if dark else B_BG
    ink = B_BG if dark else B_INK
    return (
      '<div style="display:flex;flex-direction:column;gap:10px">'
      '<div style="display:flex;align-items:baseline;gap:12px">'
      '<span style="font-size:13px;font-weight:600">%s</span>'
      '<span class="mono" style="font-size:11px;color:%s">%s</span></div>'
      '<div style="width:1440px;height:760px;position:relative;overflow:hidden;background:%s;color:%s;'
      'border-radius:5px;display:flex;align-items:center;justify-content:center">%s</div></div>'
      % (caption, B_MUTED, spec, bg, ink, inner)
    )

def beat_kicker(text, color="#D98A4E"):
    return '<span class="mono" style="font-size:10.5px;letter-spacing:.24em;text-transform:uppercase;color:%s">%s</span>' % (color, text)

def build_beats():
    m = market()
    survivor = [x for x in m if x["key"] == "tech"][0]
    defunct = [x for x in m if x["key"] == "energy"][0]
    accreted = display_name(CORP["tech"]["name"], [CORP["energy"]["name"]])
    founding_ind = "video"
    founding = CORP[founding_ind]

    # 1. Founding — the plinth takeover (F2-adjacent; the model U11 animates as
    # entrance/hold/exit). Peak = the panel fully arrived, plinth lit.
    founding_frame = beat_frame(
      "Founding — peak frame", "3.0s hold, skippable · sound: founding.wav · curtain-drop entrance, ink exit",
      '<div style="display:flex;align-items:center;gap:56px">'
      '<div style="width:150px;height:216px;border-radius:3px;overflow:hidden;display:flex;align-items:center;'
      'justify-content:center;background:linear-gradient(165deg, color-mix(in srgb, %s 84%%, #fff), %s 55%%, '
      'color-mix(in srgb, %s 48%%, #1C1917));box-shadow:0 40px 70px -20px rgba(0,0,0,.7),inset 0 2px 0 rgba(255,255,255,.3)">%s</div>'
      '<div style="width:470px">%s'
      '<div style="height:1px;width:60px;margin:10px 0 2px;background:#46403A"></div>'
      '<div class="ser" style="font-size:60px;line-height:1.1;margin-top:12px">%s</div>'
      '<div style="font-size:14px;color:#B8AC9F;margin-top:10px;max-width:34ch">%s</div>'
      '<div style="display:flex;gap:38px;margin-top:26px;padding-top:18px;border-top:1px solid #46403A">%s</div></div></div>'
      % (founding["color"], founding["color"], founding["color"], b_mark(founding_ind, "#FAF6F0", 52),
         beat_kicker("a corporation is founded"), founding["name"], founding["flavor"],
         "".join('<span style="display:flex;flex-direction:column;gap:3px">'
                 '<span class="mono" style="font-size:9.5px;letter-spacing:.16em;text-transform:uppercase;color:#9C9086">%s</span>'
                 '<span class="ser" style="font-size:21px">%s</span></span>' % (lab, val)
                 for lab, val in [("headquarters", HQ.get(founding_ind, "7D")), ("opening price", money(400)), ("founder", "+1 share")]))
    )

    # 2. Buy-stock — the lightest beat: an in-place flourish on the holdings
    # row, not a screen takeover. Peak = the purchased shares just landed.
    buy_row = (
      '<div style="width:520px;background:%s;%sborder-radius:4px;box-shadow:%s;padding:22px 26px;'
      'display:flex;flex-direction:column;gap:14px">'
      '<div class="ser" style="font-size:17px;color:%s">Shareholders</div>'
      '<div style="display:flex;align-items:center;justify-content:space-between;padding:10px 12px;'
      'border-radius:4px;background:color-mix(in srgb, %s 12%%, transparent);box-shadow:0 0 0 1.5px color-mix(in srgb, %s 45%%, transparent)">'
      '<span style="font-size:14px;font-weight:700;color:%s">You ·</span>'
      '<span style="display:inline-flex;align-items:center;gap:8px">%s'
      '<span class="ser mono" style="font-size:15px;color:%s">+2</span></span>'
      '<span class="ser mono" style="font-size:19px">$3,650</span></div>'
      '<div style="font-size:11px;color:%s">Bought 2 %s at $500 — 3 of 9 now yours.</div></div>'
      % (B_PANEL, L_TOP_RULE, L_ELEV[1], B_INK, survivor["color"], survivor["color"], B_INK,
         b_mark("tech", survivor["ink"], 16), survivor["color"], B_MUTED, survivor["name"])
    )
    buy_frame = beat_frame(
      "Buy stock — peak frame", "0.9s flourish, not skippable-hold · sound: buy.wav · a coin arcs into the row, the row glows and settles",
      buy_row, dark=False
    )

    # 3. Merger — the name-reveal peak (F1's load-bearing moment): the accreted
    # name at scale, cream on ink, industry glow behind it.
    merger_frame = beat_frame(
      "Merger — name-reveal peak frame", "6-stage sequence ~9.1s total, skippable · sound: merger.wav · collide → blend → name → mass → bonus → settle",
      '<div style="position:absolute;left:50%%;top:50%%;width:900px;height:620px;margin:-310px 0 0 -450px;'
      'pointer-events:none;background:radial-gradient(50%% 50%% at 50%% 50%%, color-mix(in srgb, %s 30%%, transparent) 0%%, transparent 72%%)"></div>'
      '<div style="position:relative;width:860px;display:flex;flex-direction:column;align-items:center;text-align:center">'
      '%s<div style="width:60px;height:1px;margin:12px 0 0;background:#46403A"></div>'
      '<div class="ser" style="font-size:112px;line-height:1.02;letter-spacing:-.035em;margin-top:18px;'
      'text-shadow:0 0 60px color-mix(in srgb, %s 45%%, transparent)">%s</div>'
      '<div style="max-width:46ch;font-size:13px;line-height:1.55;color:#9C9086;margin-top:14px">Its name grows '
      'with a piece of every company it takes over. Your shares in it stay yours.</div>'
      '<div style="display:flex;gap:76px;margin-top:46px">%s</div></div>'
      % (survivor["color"], beat_kicker("merger at %s" % "4E"), survivor["color"], accreted,
         "".join('<div style="text-align:left"><span class="mono" style="font-size:10px;letter-spacing:.18em;'
                 'text-transform:uppercase;color:#9C9086">%s</span><span class="ser mono" style="display:block;'
                 'font-size:56px;line-height:1.05;margin-top:6px;letter-spacing:-.03em">%s</span></div>'
                 % (who, money(amt)) for who, amt in [("Mara · majority", 4000), ("Otto · minority", 2000)]))
    )

    # 4. Endgame trigger — a table-level beat (fires for every seat): the
    # threshold is announced before the final round plays out.
    endgame_frame = beat_frame(
      "Endgame trigger — peak frame", "2.4s hold, skippable · sound: endgame.wav · ink curtain drops, rule underlines, lifts on dismiss",
      '<div style="display:flex;flex-direction:column;align-items:center;text-align:center;gap:14px">%s'
      '<div class="ser" style="font-size:64px;margin-top:6px">The endgame is triggered</div>'
      '<div style="font-size:14px;color:#B8AC9F;max-width:52ch;line-height:1.55">%s is safe at %d tiles. '
      'Any player may announce the end from here — once called, this is the final round.</div>'
      '<div style="display:flex;gap:12px;margin-top:10px">%s</div></div>'
      % (beat_kicker("final round approaching"), survivor["display"], survivor["size"],
         "".join('<span style="display:inline-flex;align-items:center;gap:7px;border:1px solid #46403A;'
                 'border-radius:20px;padding:8px 16px;font-size:12px;color:#D8CFC3">%s<span class="ser">%s</span></span>'
                 % (b_mark(x["key"], x["color"], 16), x["display"]) for x in m if x["size"] > 0))
    )

    # 5. Victory — final settlement. The tagline callback ties it back to the
    # launch beat's "seven start-ups, one skyline" line.
    standings = sorted(((p[0], p[1] + sum(v * m2["price"] for k, v in p[2].items()
                        for m2 in [next(x for x in m if x["key"] == k)])) for p in PLAYERS), key=lambda x: -x[1])
    victory_frame = beat_frame(
      "Victory — peak frame", "4.0s hold before standings become interactive · sound: victory.wav · slow ink-curtain lift, names rise in sequence",
      '<div style="display:flex;flex-direction:column;align-items:center;text-align:center;gap:16px">%s'
      '<div class="ser" style="font-size:76px">%s wins</div>'
      '<div style="display:flex;flex-direction:column;gap:2px;margin-top:10px;width:420px">%s</div>'
      '<div class="mono" style="font-size:10px;letter-spacing:.2em;text-transform:uppercase;color:#6F665D;margin-top:18px">seven start-ups, one skyline</div></div>'
      % (beat_kicker("game over"), standings[0][0],
         "".join('<div style="display:flex;justify-content:space-between;padding:9px 4px;'
                 'border-bottom:1px solid #2B2621;%s"><span class="ser" style="font-size:16px">%d. %s</span>'
                 '<span class="mono num" style="font-size:16px">%s</span></div>'
                 % ("color:#D98A4E" if i == 0 else "color:#B8AC9F", i + 1, n, money(total))
                 for i, (n, total) in enumerate(standings)))
    )

    body = (
      '<div style="width:1440px;min-height:4300px;background:%s;color:%s;font-family:\'DM Sans\',Helvetica,Arial,sans-serif;'
      'font-size:13px;padding:40px 0 48px;display:flex;flex-direction:column;gap:34px;align-items:center">'
      '<div style="width:1440px;padding:0 36px;display:flex;flex-direction:column;gap:9px">'
      '<span class="mono" style="font-size:10px;letter-spacing:.16em;text-transform:uppercase;color:%s">Boomtown · beat still-frames (U3)</span>'
      '<span class="ser" style="font-size:32px">The five beats without their own screen</span>'
      '<span style="font-size:13px;line-height:1.5;color:%s;max-width:900px">Launch is the Main-menu treatment (U9); '
      'first-tile is a note on the board, not its own frame. Each frame below is the beat\'s peak visual — what U11 '
      'animates into (entrance) and out of (exit); the caption line under each title is that beat\'s timing/sound spec.</span></div>'
      '%s%s%s%s%s</div>'
      % (B_BG, B_INK, B_MUTED, B_MUTED,
         founding_frame, buy_frame, merger_frame, endgame_frame, victory_frame)
    )
    write("Beats.dc.html", B_HELMET, body)

# ---------------------------------------------------------------- canvas
def build_canvas():
    doc = {
      "pages": [{"id": "page-1", "name": "Boomtown"},
                {"id": "page-2", "name": "Rules model"},
                {"id": "page-3", "name": "Earlier directions"}],
      "artboards": [
        {"file": "Main.dc.html",  "x": 0, "y": 0, "w": 1440, "h": 900,  "title": "Table", "page": "page-1"},
        {"file": "Language.dc.html", "x": 1560, "y": 940, "w": 1440, "h": 1900, "title": "Visual language", "print": "flow", "page": "page-1"},
        {"file": "Beats.dc.html", "x": 3120, "y": 940, "w": 1440, "h": 4300, "title": "Beat still-frames", "print": "flow", "page": "page-1"},
        {"file": "Names.dc.html", "x": 1560, "y": 0, "w": 1440, "h": 2680, "title": "Merged names", "print": "flow", "page": "page-1"},
        {"file": "Pool.dc.html",  "x": 3120, "y": 0, "w": 1440, "h": 1300, "title": "The pool", "print": "flow", "page": "page-1"},
        {"file": "Reference.dc.html", "x": 4680, "y": 0, "w": 1440, "h": 2210, "title": "Stock reference", "print": "flow", "page": "page-1"},
        {"file": "RulesModel.dc.html",   "x": 0, "y": 0, "w": 1440, "h": 4520, "title": "Rules model",
         "print": "flow", "page": "page-2"},
        {"file": "BoardRoom.dc.html",    "x": 0,    "y": 0, "w": 1440, "h": 900, "title": "A - Board Room", "page": "page-3"},
        {"file": "TradingFloor.dc.html", "x": 1560, "y": 0, "w": 1440, "h": 900, "title": "C - Trading Floor", "page": "page-3"},
      ],
      "annotations": [
        {"id": "note-table", "x": 0, "y": -210, "w": 700, "page": "page-1",
         "text": "Turn 14. Tile 9F is selected and Blackcurrant is about to swallow Enrun - and be renamed Blackcurrun for it.\nThe board state is rule-checked: Chapter 11 at 11 tiles and Megahit Video at 12 are both safe, which is what makes 3F a permanently dead tile. 6A and 12H each found a corporation, and two headquarters are still free."},
        {"id": "note-names", "x": 760, "y": -210, "w": 660, "page": "page-1",
         "text": "Seven companies that were once unassailable and then got eaten - which is what happens to every corporation on this board. Parodies of defunct brands, not live ones. Nothing here has been trademark-searched, and the backwards R is trade dress rather than wordplay: swap it first if anyone gets nervous."},
        {"id": "note-rules", "x": 0, "y": -150, "w": 700, "page": "page-2",
         "text": "The sheet to argue with before any code exists. Every disagreement between the two rulebooks is listed as a config key rather than a fork."},
        {"id": "note-earlier", "x": 0, "y": -170, "w": 700, "page": "page-3",
         "text": "The two directions not taken, kept for reference. Board Room makes the board the subject; Trading Floor makes the money the subject. Both show the same position as the Boomtown table."},
      ],
      "launch": {"view": "canvas", "page": "page-1"},
    }
    with io.open(os.path.join(OUT, "canvas.json"), "w", encoding="utf-8") as f:
        f.write(json.dumps(doc, indent=2, ensure_ascii=False))
    print("wrote canvas.json")

if __name__ == "__main__":
    build_a(); build_b(); build_c(); build_rules(); build_names(); build_pool(); build_reference()
    build_language(); build_beats()
    build_canvas()
