# -*- coding: utf-8 -*-
"""Generates the Boomtown design-canvas artboards from one shared game state."""
import json, os, io
import re as _re
import base64

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
def _load_pool():
    """The pool of record is packages/engine/src/pool.ts; read it rather than keep a copy.
    A copy drifted once and put companies on the canvas that were not in the game. The
    "riffing on" note never ships, so it comes from docs/naming.md, as does which
    candidate the canvas draws (the row marked "<- drawn")."""
    here = os.path.dirname(os.path.abspath(__file__))
    src = open(os.path.join(here, "..", "packages", "engine", "src", "pool.ts"), encoding="utf-8").read()
    doc = open(os.path.join(here, "..", "docs", "naming.md"), encoding="utf-8").read()
    info = {k: (int(t), c, i) for k, t, c, i in _re.findall(
        r"(\w+): \{ tier: (\d), color: '(#[0-9A-Fa-f]{6})', ink: '(#[0-9A-Fa-f]{6})' \}", src)}
    body = src[src.index("export const POOL"):]
    pool, drawn, riff = {}, {}, {}
    for row in _re.findall(r"^\| ([^|]+?) \| [^|]+ \| `[^`]*` \| `[^`]*` \| ([^|]+?) \|$", doc, _re.M):
        name, note = row
        if "drawn" in name:
            name = name.split(" **")[0]
            drawn[name] = True
        riff[name] = note.replace("**", "")
    q = r"""(?:'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)")"""
    for key in info:
        block = _re.search(r"\n  %s: \[(.*?)\n  \]," % key, body, _re.S).group(1)
        cands = [(n1 or n2, f1 or f2, riff.get(n1 or n2, ""))
                 for n1, n2, f1, f2 in _re.findall(r"baseName: %s, flavour: %s" % (q, q), block)]
        assert len(cands) == 4, (key, cands)
        pool[key] = info[key] + (cands,)
    draw = {k: next((i for i, c in enumerate(pool[k][3]) if c[0] in drawn), 0) for k in pool}
    return pool, draw

POOL, _DRAWN = _load_pool()
ORDER = ["books", "electronics", "air", "energy", "tech", "video", "toys"]
DRAW = _DRAWN                          # which candidate this game drew (naming.md's "<- drawn")
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

# The industry marks, drawn — the pool and names artboards use them.
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
    """The divergence table.

    Two of the three columns are reconstructions of published editions and
    differ only in numbers; Boomtown is the project's own variant, so its
    column is mostly "as classic" plus two keys the other two have no row for
    at all. Stating that in the table is the honest version — three peers
    would not be.
    """
    rows = [("Board", "100 tiles, dimensions not stated in the rulebook", "12 × 9 = 108 tiles, 1A – 12I", "as classic", "boardCols / boardRows"),
            ("Safe size", "10 or more tiles", "11 or more tiles", "as classic", "safeSize"),
            ("End trigger", "one corporation at 38+", "one chain at 41+", "one chain at 41+ <em>or</em> a carried motion", "endChainSize"),
            ("Bonus tiers", "primary · secondary · tertiary", "majority · minority", "as classic", "bonusTiers"),
            ("Price bands", "2, 3, 4, 5, 6–7, 8–17, 18–27, 28–37, 38+", "2, 3, 4, 5, 6–10, 11–20, 21–30, 31–40, 41+", "as classic", "priceBands"),
            ("Sole shareholder", "takes primary <em>and</em> tertiary", "takes both bonuses", "as classic", "soleHolderPolicy"),
            ("Dead tiles", "discarded face-up and replaced at end of turn", "not addressed — tile stays in hand", "as classic", "deadTilePolicy"),
            ("Two-player rule", "the bank is a shareholder; its holding is drawn from the tile pile each merger", "not addressed", "as classic — but no vote below 3 seats", "phantomShareholder"),
            ("Cash and holdings", "a table setting, not a rule", "a table setting, not a rule", "<strong>always hidden</strong> — the ruleset fixes it", "forcedVisibility"),
            ("Vote to end", "—", "—", "see <em>Going public</em> below", "endVote")]
    cols = "142px 1fr 1fr 1fr 150px"
    head = ('<div style="display:grid;grid-template-columns:%s;gap:0;padding:0 14px 9px;'
            'border-bottom:1px solid %s" class="lbl"><div>Rule</div><div>2015 Avalon Hill</div>'
            '<div>Classic</div><div style="color:%s">Boomtown — ours</div><div>Config key</div></div>'
            % (cols, R_RULE, R_ACC))
    body = "".join(
      '<div style="display:grid;grid-template-columns:%s;gap:0;padding:11px 14px;'
      'border-bottom:1px solid rgba(223,217,207,.7);font-size:12px;line-height:1.45">'
      '<div style="font-weight:600">%s</div><div style="color:%s">%s</div><div style="color:%s">%s</div>'
      '<div style="color:%s">%s</div>'
      '<div class="m" style="font-size:11px;color:%s">%s</div></div>'
      % (cols, r, R_MUTED, a, R_MUTED, b, R_INK, c, R_ACC, k) for r, a, b, c, k in rows)
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
    tiers = tuple(", ".join(CORP[k]["name"] for k in ORDER if CORP[k]["tier"] == t) for t in (1, 2, 3))
    note = ('<div style="padding:12px 14px;font-size:11.5px;line-height:1.55;color:%s">'
            'Tier 1 = %s · Tier 2 = %s · Tier 3 = %s. '
            'Primary is always 10× the share price and tertiary (classic: minority) is always 5×. '
            '<strong style="color:%s">The 2015 secondary column is not a multiple of anything</strong> — it is a printed lookup and must ship as data. '
            'Verified against the rulebook\'s own example: a five-tile tier-3 corporation pays 7,000 / 5,000 / 3,500.</div>'
            % ((R_MUTED,) + tiers + (R_ACC,)))
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

def r_going_public():
    """Boomtown's second ending. Reads as a sequence because it is one — the
    order of the five beats is the whole design, and the price lands last on
    purpose."""
    steps = [
      ("1", "The window opens", "Once <strong>two corporations are safe</strong>, and only while no ordinary end condition is met. Once the game can simply be announced, asking is strictly worse than announcing — so the two endings never overlap."),
      ("2", "A player moves to liquidate", "At the end-check step of their own turn, <strong>once each per game</strong>. Raising <em>is</em> voting for it: nobody proposes an ending and then votes it down."),
      ("3", "The register is published", "One vote per share held in a <strong>safe</strong> corporation — the only companies certain to still exist at settlement. Published on the first motion of the game and never un-published. It can only grow, so the electorate cannot be attacked."),
      ("4", "Everyone votes, mover first, then clockwise", "It carries on <strong>two thirds of the register</strong> — half at five or six seats, where coordinating a supermajority gets harder and responsibility diffuses — with <strong>at least two backers</strong>. The game ends there and then."),
      ("5", "If it fails, the backers open their books", "Cash and holdings visible to the table for the rest of the game. Voting against costs nothing, so the expected price of a yes is <em>P(fail) × your privacy</em> — which taxes speculative and spiteful votes precisely and leaves sincere ones nearly free."),
    ]
    flow = '<div style="display:flex;flex-direction:column;gap:8px">%s</div>' % "".join(
      '<div style="display:flex;gap:14px;background:%s;border:1px solid %s;border-radius:3px;padding:12px 15px">'
      '<span class="m" style="width:18px;flex-shrink:0;color:%s;font-size:13px">%s</span>'
      '<div style="flex-grow:1"><div style="font-size:13px;font-weight:600;margin-bottom:3px">%s</div>'
      '<div style="font-size:11.5px;line-height:1.5;color:%s">%s</div></div></div>'
      % (R_PANEL, R_RULE, R_ACC, k, t, R_MUTED, d) for k, t, d in steps)

    dials = [("quorumSafeCorps", "2", "a motion in 53–72% of games, against 7–17% at three"),
             ("quota", "2/3", "carries 63% of the time at three seats"),
             ("quotaBySeats", "1/2 at 5 – 6", "2/3 carries only 6% at six seats"),
             ("quotaBase", "register", "only a fixed denominator can settle before every seat has spoken"),
             ("minBackers", "2", "the earliest legal register can be two-thirds held by one player"),
             ("motionsPerPlayer", "1", "scarcity is what makes the timing a decision"),
             ("minPlayers", "3", "two players have no table to convince")]
    table = ('<div style="background:%s;border:1px solid %s;border-radius:3px;padding:14px 0 0;margin-top:4px">'
             '<div style="display:grid;grid-template-columns:190px 128px 1fr;gap:0;padding:0 14px 9px;'
             'border-bottom:1px solid %s" class="lbl"><div>Key</div><div>Ships as</div>'
             '<div>Why, from the simulation</div></div>%s'
             '<div style="padding:12px 14px;font-size:11.5px;line-height:1.55;color:%s">'
             'Every number above came out of <strong style="color:%s">roughly 200 headless games per '
             'configuration</strong> rather than out of taste. The failure mode the sweep was built to '
             'catch is not imbalance — it is a mechanic nobody ever uses.</div></div>'
             % (R_PANEL, R_RULE, R_RULE,
                "".join('<div style="display:grid;grid-template-columns:190px 128px 1fr;gap:0;padding:10px 14px;'
                        'border-bottom:1px solid rgba(223,217,207,.7);font-size:12px;line-height:1.45">'
                        '<div class="m" style="color:%s">%s</div><div class="m">%s</div>'
                        '<div style="color:%s">%s</div></div>' % (R_ACC, k, v, R_MUTED, w)
                        for k, v, w in dials),
                R_MUTED, R_ACC))
    return flow + table

def build_rules():
    body = (
      '<div style="width:1440px;min-height:4600px;background:%s;color:%s;font-family:\'IBM Plex Sans\',Helvetica,Arial,sans-serif;'
      'font-size:13px;padding:44px 52px 56px;display:flex;flex-direction:column;gap:38px">'
      '<div style="display:flex;align-items:flex-end;justify-content:space-between;gap:40px">'
      '<div style="display:flex;flex-direction:column;gap:9px">'
      '<span class="lbl">Boomtown · web version</span>'
      '<span style="font-size:34px;font-weight:600;letter-spacing:-.02em">Rules model</span>'
      '<span style="font-size:13.5px;line-height:1.5;color:%s;max-width:760px">Two rule sets are reconstructions, '
      'reconciled from the 2015 Avalon Hill rulebook and the classic rules; where they disagree the difference is '
      'configuration, not a fork, and the column on the right of each divergence is the key the engine reads. '
      'The third, <strong>Boomtown</strong>, is ours rather than anyone\'s rulebook: classic numbers, closed '
      'books, and an ending that can be put to a vote.</span></div>'
      '<div style="display:flex;gap:10px">%s</div></div>'
      '%s%s%s%s%s%s%s%s</div>'
      % (R_BG, R_INK, R_MUTED,
         "".join('<div style="border:1px solid %s;border-radius:3px;padding:9px 13px;text-align:right">'
                 '<div class="lbl" style="margin-bottom:3px">%s</div>'
                 '<div class="m" style="font-size:14px">%s</div></div>' % (R_RULE, a, b)
                 for a, b in [("Players", "2 – 6"), ("Corporations", "7"), ("Shares each", "25"), ("Start cash", "$6,000")]),
         r_section("Turn", "one placement, an optional purchase, a draw", r_flow()),
         r_section("Merger resolution", "the only part of the game with real sequencing", r_merger()),
         r_section("Edition configuration", "every divergence between the three rule sets", r_config()),
         r_section("Going public", "Boomtown's second ending — ours, not anyone's rulebook", r_going_public()),
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
            'Merger one already happened — it is why @VIDEO@ is sitting on a two-slot card. By the end one '
            'corporation is carrying '
            '<strong style="color:%s">%d letters</strong> and six companies\' worth of history. Nothing truncates: '
            'the card grows instead.</div>' % (R_MUTED, R_ACC, len(LINEAGE[-1][3])))
    note = note.replace("@VIDEO@", CORP["video"]["name"])
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
      ("%s has eaten one" % CORP["video"]["name"], "turn 14 — the table",
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


# =============================================================== CAPTURED FROM THE APP
# The screens are no longer drawn here. design/capture.mjs plays the running app
# in day and in night and writes each screen as an SVG with live text; these
# builders only lay those SVGs out as artboards. The hand-drawn versions drifted
# from the app until the canvas showed a game that no longer existed (2026-09-27).
# To change a screen, change the app, then re-run capture.mjs and this script.

CAPTURES = os.path.join(OUT, "captures")
GUTTER, GAP = 48, 56

def _capture(cid, scale=1.0):
    """One captured frame, inline, with its ids made unique so two frames in one
    artboard cannot borrow each other's clip paths or gradients."""
    path = os.path.join(CAPTURES, cid + ".svg")
    if not os.path.exists(path):
        raise SystemExit("missing design/captures/%s.svg — run `node design/capture.mjs` first" % cid)
    svg = open(path, encoding="utf-8").read()
    svg = _re.sub(r"<\?xml[^>]*\?>|<!--.*?-->", "", svg, flags=_re.S)
    # dom-to-svg writes coordinates to a dozen places; two is past what a pixel
    # can show, and it keeps each artboard under the editor's file-size ceiling.
    # dom-to-svg annotates every group with where it came from in the DOM; the
    # canvas has no use for that, and it is a third of the file.
    svg = _re.sub(r' (?:data-[\w-]+|aria-owns|class)="[^"]*"', "", svg)
    prev = None
    while prev != svg:
        prev, svg = svg, _re.sub(r"<g>\s*</g>|<g/>", "", svg)
    svg = _re.sub(r"(?<![\w#;,])(-?\d+\.\d{3,})", lambda m: ("%.2f" % float(m.group(1))).rstrip("0").rstrip("."), svg)
    ids = set(_re.findall(r'\bid="([^"]+)"', svg))
    pre = _re.sub(r"\W", "", cid) + "-"
    if ids:
        pat = "|".join(_re.escape(i) for i in sorted(ids, key=len, reverse=True))
        svg = _re.sub(r'(\bid="|url\(#|href="#)(%s)(?=["\)])' % pat, lambda m: m.group(1) + pre + m.group(2), svg)
    w, h = (float(x) for x in _re.search(r'<svg[^>]*\bwidth="([\d.]+)"[^>]*\bheight="([\d.]+)"', svg).groups())
    svg = _re.sub(r"<svg\b", '<svg style="display:block;width:%dpx;height:%dpx"' % (round(w * scale), round(h * scale)), svg, count=1)
    return svg, round(w * scale), round(h * scale)

def _still(name, scale):
    """A screenshot from design/stills/, for a screen capture.mjs cannot turn into
    SVG: Skyline is WebGL, which dom-to-svg does not see. These are the itch.io
    page's screenshots, 1920x1080, shown at the same 1440 width as the captures."""
    here = os.path.dirname(os.path.abspath(__file__))
    data = open(os.path.join(here, "stills", name), "rb").read()
    w, h = int(round(1440 * scale)), int(round(810 * scale))
    img = ('<img src="data:image/png;base64,%s" width="%d" height="%d" style="display:block" alt="">'
           % (base64.b64encode(data).decode("ascii"), w, h))
    return img, w, h

def _frame(cid, caption, scale=1.0, dark=False, border=True):
    svg, w, h = _still(cid[len("still:"):], scale) if cid.startswith("still:") else _capture(cid, scale)
    return (w, h + 30,
            '<div style="display:flex;flex-direction:column;gap:10px;width:%dpx">'
            '<span class="mono" style="font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:%s">%s</span>'
            '<div style="width:%dpx;height:%dpx;overflow:hidden;border-radius:6px;%s">%s</div></div>'
            % (w, B_MUTED, caption, w, h, "box-shadow:0 0 0 1px %s" % B_RULE if border else "", svg))

def _board(file, title, lede, rows):
    """An artboard: a title, a line on what it shows, then rows of frames. Each
    row is a list of (capture id, caption[, scale]). Returns the artboard's size."""
    body_rows, width, height = [], 0, 210
    for row in rows:
        cells = [_frame(*cell) for cell in row]
        rw = sum(c[0] for c in cells) + GAP * (len(cells) - 1)
        rh = max(c[1] for c in cells)
        width, height = max(width, rw), height + rh + GAP
        body_rows.append('<div style="display:flex;gap:%dpx;align-items:flex-start">%s</div>'
                         % (GAP, "".join(c[2] for c in cells)))
    width += 2 * GUTTER
    body = ('<div style="width:%dpx;box-sizing:border-box;min-height:%dpx;background:%s;color:%s;'
            'font-family:\'DM Sans\',Helvetica,Arial,sans-serif;font-size:13px;padding:40px %dpx 48px;'
            'display:flex;flex-direction:column;gap:%dpx">'
            '<div style="display:flex;flex-direction:column;gap:9px;max-width:960px">'
            '<span class="mono" style="font-size:10px;letter-spacing:.16em;text-transform:uppercase;color:%s">'
            'Boomtown · captured from the app</span>'
            '<span class="ser" style="font-size:32px">%s</span>'
            '<span style="font-size:13px;line-height:1.55;color:%s">%s</span></div>%s</div>'
            % (width, height, B_BG, B_INK, GUTTER, GAP, B_MUTED, title, B_MUTED, lede, "".join(body_rows)))
    write(file, B_HELMET, body)
    return width, height

def _pair(cid, caption, scale=1.0):
    return [(cid + "-day", caption + " · day", scale), (cid + "-night", caption + " · night", scale)]

BOARDS = {}

# ------------------------------------------------- the visual language, from the app
# Read off apps/desktop/src/styles/global.css and industryTheme.ts, so the sheet
# shows the values that ship rather than a spec the app has moved past.

def _css_tokens():
    here = os.path.dirname(os.path.abspath(__file__))
    css = open(os.path.join(here, "..", "apps", "desktop", "src", "styles", "global.css"), encoding="utf-8").read()
    css = _re.sub(r"/\*.*?\*/", "", css, flags=_re.S)
    def block(sel):
        body = _re.search(_re.escape(sel) + r"\s*\{(.*?)\n\}", css, _re.S).group(1)
        return {k: " ".join(v.split()) for k, v in _re.findall(r"(--[\w-]+):\s*([^;]+);", body)}
    day = block(":root")
    night = dict(day, **block(':root[data-lighting="night"]'))
    def resolve(tokens, v, depth=0):
        m = _re.fullmatch(r"var\((--[\w-]+)\)", v)
        return resolve(tokens, tokens[m.group(1)], depth + 1) if m and depth < 8 else v
    return ({k: resolve(day, v) for k, v in day.items()}, {k: resolve(night, v) for k, v in night.items()})

def _type_shades():
    here = os.path.dirname(os.path.abspath(__file__))
    src = open(os.path.join(here, "..", "apps", "desktop", "src", "game", "industryTheme.ts"), encoding="utf-8").read()
    return {k: (p, n) for k, p, n in _re.findall(r"(\w+): \{ onPaper: '(#[0-9A-Fa-f]{6})', onNight: '(#[0-9A-Fa-f]{6})' \}", src)}

LANG_GROUPS = [
    ("Ground", ["--bg", "--surface", "--surface-2", "--ink", "--muted", "--rule", "--accent", "--on-accent", "--input", "--error"]),
    ("Chrome — the top bar and launch screen", ["--chrome-bg", "--chrome-ink", "--chrome-muted", "--chrome-rule"]),
    ("Board", ["--board-bg", "--board-plate-top", "--board-plate-bottom", "--board-base", "--cell-empty", "--cell-empty-ink", "--cell-uninc", "--cell-ring"]),
    ("Beat curtain", ["--beat-bg", "--beat-bg-2", "--beat-ink", "--beat-ink-1", "--beat-ink-2", "--beat-muted", "--beat-hint", "--beat-rule", "--beat-accent", "--beat-edge"]),
    ("Notices and washes", ["--notice-warn-bg", "--notice-warn-ink", "--notice-error-bg", "--notice-error-ink", "--band-empty-wash", "--skyline-ink-body", "--skyline-ink-window"]),
]

def build_language():
    day, night = _css_tokens()
    def column(label, tokens, ground, ink, names):
        rows = "".join(
            '<div style="display:flex;align-items:center;gap:12px;padding:6px 0;border-bottom:1px solid rgba(128,110,90,.22)">'
            '<span style="width:34px;height:20px;border-radius:3px;background:%s;box-shadow:0 0 0 1px rgba(128,110,90,.35);flex-shrink:0"></span>'
            '<span class="mono" style="flex:1;font-size:10.5px">%s</span>'
            '<span class="mono" style="font-size:10.5px;opacity:.75">%s</span></div>'
            % (tokens[n], n, tokens[n].lower()) for n in names)
        return ('<div style="flex:1;min-width:0;background:%s;color:%s;border-radius:6px;padding:14px 18px;box-shadow:0 0 0 1px %s">'
                '<div class="mono" style="font-size:10px;letter-spacing:.14em;text-transform:uppercase;opacity:.7;margin-bottom:6px">%s</div>%s</div>'
                % (ground, ink, B_RULE, label, rows))
    groups = "".join(
        '<div style="display:flex;flex-direction:column;gap:10px"><div class="ser" style="font-size:19px">%s</div>'
        '<div style="display:flex;gap:18px">%s%s</div></div>'
        % (title, column("Day", day, day["--bg"], day["--ink"], names), column("Night", night, night["--bg"], night["--ink"], names))
        for title, names in LANG_GROUPS)

    def elev(tokens, tone):
        return ('<div style="flex:1;background:%s;color:%s;border-radius:6px;padding:26px;display:flex;gap:22px;box-shadow:0 0 0 1px %s">%s</div>'
                % (tokens["--bg"], tokens["--ink"], B_RULE, "".join(
                    '<div style="flex:1;height:84px;border-radius:6px;background:%s;box-shadow:%s;display:flex;align-items:flex-end;'
                    'padding:10px 12px;font-size:12px">%s · elevation %d</div>' % (tokens["--surface"], tokens["--elev-%d" % i], tone, i)
                    for i in (1, 2, 3))))
    elevation = '<div style="display:flex;gap:18px">%s%s</div>' % (elev(day, "day"), elev(night, "night"))

    shades = _type_shades()
    industries = "".join(
        '<div style="display:grid;grid-template-columns:150px 92px 1fr 1fr;align-items:center;gap:14px;padding:8px 0;border-bottom:1px solid %s">'
        '<span style="font-size:13px">%s <span style="color:%s">· tier %d</span></span>'
        '<span style="height:30px;border-radius:4px;background:%s;color:%s;display:flex;align-items:center;justify-content:center;'
        'font-size:10.5px" class="mono">%s</span>'
        '<span style="background:%s;padding:7px 10px;border-radius:4px;color:%s;font-weight:700;font-size:13px">%s <span class="mono" style="font-weight:400;font-size:10.5px">%s on paper</span></span>'
        '<span style="background:%s;padding:7px 10px;border-radius:4px;color:%s;font-weight:700;font-size:13px">%s <span class="mono" style="font-weight:400;font-size:10.5px">%s at night</span></span></div>'
        % (B_RULE, k, B_MUTED, POOL[k][0], POOL[k][1], POOL[k][2], POOL[k][1].lower(),
           day["--surface"], shades[k][0], CORP[k]["name"], shades[k][0].lower(),
           night["--surface"], shades[k][1], CORP[k]["name"], shades[k][1].lower())
        for k in ORDER)

    type_rows = "".join(
        '<div style="display:flex;align-items:baseline;gap:18px;padding:10px 0;border-bottom:1px solid %s">'
        '<span class="mono" style="width:150px;flex-shrink:0;font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:%s">%s</span>'
        '<span style="%s">%s</span></div>' % (B_RULE, B_MUTED, role, style, sample)
        for role, style, sample in [
            ("Display · serif", "font-family:%s;font-size:34px" % day["--serif"].replace('"', "'"), "Blackcurrun takes over Enrun"),
            ("Kicker", "font-size:10.5px;letter-spacing:.2em;text-transform:uppercase;color:%s" % B_MUTED, "a corporation is founded"),
            ("Body · sans", "font-family:%s;font-size:14px;line-height:1.5" % day["--sans"].replace('"', "'"), "Placing 9F hands %s a power company with imaginative books." % CORP["tech"]["name"]),
            ("Numbers", "font-family:%s;font-variant-numeric:tabular-nums;font-size:20px" % day["--sans"].replace('"', "'"), "$5,250 · 7D · 14 tiles"),
        ])

    def section(title, note, inner):
        return ('<div style="display:flex;flex-direction:column;gap:14px">'
                '<div style="border-bottom:1px solid %s;padding-bottom:10px"><div class="ser" style="font-size:24px">%s</div>'
                '<div style="font-size:12.5px;color:%s;margin-top:4px;max-width:900px">%s</div></div>%s</div>'
                % (B_RULE, title, B_MUTED, note, inner))
    body = (
        '<div style="width:1440px;box-sizing:border-box;min-height:%dpx;background:%s;color:%s;font-family:\'DM Sans\',Helvetica,Arial,sans-serif;'
        'font-size:13px;padding:40px 48px 60px;display:flex;flex-direction:column;gap:38px">'
        '<div style="display:flex;flex-direction:column;gap:9px"><span class="mono" style="font-size:10px;letter-spacing:.16em;'
        'text-transform:uppercase;color:%s">Boomtown · read from the app\'s stylesheet</span>'
        '<span class="ser" style="font-size:34px">Visual language</span>'
        '<span style="font-size:13px;line-height:1.55;color:%s;max-width:900px">Every value on this sheet is read from '
        'apps/desktop/src/styles/global.css and industryTheme.ts when the canvas is built, so it is what ships. One switch '
        'in the top bar flips the whole app between the two columns; day is the default (#64).</span></div>'
        '%s%s%s%s</div>'
        % (LANGUAGE_H, B_BG, B_INK, B_MUTED, B_MUTED,
           section("Colour tokens", "The same names in both tones; night redefines them under :root[data-lighting=\"night\"].", '<div style="display:flex;flex-direction:column;gap:26px">%s</div>' % groups),
           section("Elevation", "Three levels and one light source. By night the top-lit highlight all but goes and the shadows turn black.", elevation),
           section("The seven industries", "Board colour with its ink, and the type shade that clears AA on each ground (#19).", industries),
           section("Type", "DM Serif Display for names and moments, DM Sans for everything else.", type_rows)))
    write("Language.dc.html", B_HELMET, body)
    return 1440, LANGUAGE_H

LANGUAGE_H = 3240

def build_captured():
    B = BOARDS
    B["Main.dc.html"] = _board("Main.dc.html", "The table",
        "Seen from a player's chair in a hot-seat game: two humans and a bot. Day is the default; the sun and moon "
        "in the top bar flips the whole app. The hand-off card covers the screen between two human seats.",
        [_pair("table-mid", "mid-game, placing a tile"), _pair("table-early", "turn 3"), _pair("handoff", "hand-off between seats")])
    B["Skyline.dc.html"] = _board("Skyline.dc.html", "Skyline",
        "The same table with the 3D board, which the building in the top bar switches to. The board is WebGL, which "
        "the capture cannot turn into SVG, so these are the itch.io page's screenshots rather than live captures.",
        [[("still:02-skyline-day.png", "a four-seat table · day"), ("still:03-skyline-day-merger.png", "a merger · day")],
         [("still:04-skyline-night-vote.png", "after a failed vote · night")]])
    B["Decisions.dc.html"] = _board("Decisions.dc.html", "Decisions",
        "Every choice the rules hand a player comes up as one of these, over the table. Each names the seat that owns it; "
        "Peek at the board lowers it without answering.",
        [_pair("decision-found", "found a corporation") + _pair("decision-buy", "buy stock"),
         _pair("decision-survivor", "choose the survivor") + _pair("decision-disposal", "dispose of defunct stock"),
         _pair("decision-end", "the game can end here")])
    B["Beats.dc.html"] = _board("Beats.dc.html", "Beats",
        "The moments that take the screen. The curtain takes the table's tone (#64): cream by day, ink by night. "
        "The merger frames are two stages of one sequence: the bonuses paid, then the survivor's new name.",
        [_pair("beat-founding", "founding"), _pair("beat-merger-1", "merger · bonuses"), _pair("beat-merger-2", "merger · the new name"),
         _pair("beat-super-merger-2", "three-way merger · the new name"), _pair("beat-motion", "a motion fails"),
         _pair("beat-endgame", "the endgame is triggered"), _pair("beat-victory", "victory")])
    B["Reference.dc.html"] = _board("Reference.dc.html", "Stock reference",
        "The printed reference card, made live: where every corporation stands right now, under its current name. "
        "Opens from Reference in the top bar.",
        [_pair("reference", "the full chart")])
    B["After.dc.html"] = _board("After.dc.html", "After the game",
        "The carousel behind the victory beat (#68, #69): four frames that turn over on their own, each a tab you can hold.",
        [_pair("after-standings", "standings"), _pair("after-market", "tracking the market"),
         _pair("after-companies", "company by company"), _pair("after-awards", "awards")])
    B["Menus.dc.html"] = _board("Menus.dc.html", "Launch and setup",
        "Everything before the first tile: the launch screen, settings, the three ways to start a table, and the online "
        "room, where having the code gets you a knock, not a seat.",
        [_pair("launch", "launch"), _pair("settings", "settings"), _pair("new-game", "a local game"),
         _pair("online", "play online"), _pair("online-lobby", "the room, with someone knocking"),
         [("online-knocking-day", "the joiner, waiting at the door · day")]])
    phones = [("phone-join", "join"), ("phone-knocking", "knocking"), ("phone-seated", "let in"), ("phone-turn", "your turn"),
              ("phone-found", "found a corporation"), ("phone-buy", "buy stock"), ("phone-disposal", "a merger's stock"),
              ("phone-waiting", "someone else's turn")]
    B["Phone.dc.html"] = _board("Phone.dc.html", "Couch mode",
        "The desktop is the table and each hand is on its own phone (#62). Nothing private reaches the big screen, "
        "so couch play needs no hand-off card. The phone page is drawn by day only.",
        [_pair("couch-setup", "opening a couch table"), _pair("couch-table", "the table, with a phone knocking"),
         _pair("couch-play", "the big screen in play"),
         [(c, t, 0.8) for c, t in phones[:4]], [(c, t, 0.8) for c, t in phones[4:]]])

def build_canvas():
    """Lay the artboards out left to right. The captured boards are as wide as
    their frames, so positions are computed rather than typed in."""
    page1 = [("Main.dc.html", "Table"), ("Skyline.dc.html", "Skyline"), ("Decisions.dc.html", "Decisions"), ("Beats.dc.html", "Beats"),
             ("Reference.dc.html", "Stock reference"), ("After.dc.html", "After the game"),
             ("Menus.dc.html", "Launch and setup"), ("Phone.dc.html", "Couch mode"),
             ("Language.dc.html", "Visual language"), ("Names.dc.html", "Merged names"), ("Pool.dc.html", "The pool")]
    sizes = dict(BOARDS, **{"Names.dc.html": (1440, 2680), "Pool.dc.html": (1440, 1300)})
    artboards, x = [], 0
    for f, title in page1:
        w, h = sizes[f]
        artboards.append({"file": f, "x": x, "y": 0, "w": w, "h": h, "title": title, "print": "flow", "page": "page-1"})
        x += w + 160
    artboards += [
        {"file": "RulesModel.dc.html", "x": 0, "y": 0, "w": 1440, "h": 4720, "title": "Rules model", "print": "flow", "page": "page-2"},
        {"file": "BoardRoom.dc.html", "x": 0, "y": 0, "w": 1440, "h": 900, "title": "A - Board Room", "page": "page-3"},
        {"file": "TradingFloor.dc.html", "x": 1560, "y": 0, "w": 1440, "h": 900, "title": "C - Trading Floor", "page": "page-3"},
    ]
    at = {a["file"]: a["x"] for a in artboards if a["page"] == "page-1"}
    doc = {
      "pages": [{"id": "page-1", "name": "Boomtown"},
                {"id": "page-2", "name": "Rules model"},
                {"id": "page-3", "name": "Earlier directions"}],
      "artboards": artboards,
      "annotations": [
        {"id": "note-table", "x": 0, "y": -210, "w": 760, "page": "page-1",
         "text": "Every screen on this page is captured from the running app, in day and in night: design/capture.mjs plays it in a browser and writes each screen as an SVG with live text, and build.py lays them out. To change a screen, change the app and re-run both. The canvas used to draw the screens by hand, and drifted until it showed a game that no longer existed."},
        {"id": "note-names", "x": at["Names.dc.html"], "y": -210, "w": 660, "page": "page-1",
         "text": "Seven companies that were once unassailable and then got eaten - which is what happens to every corporation on this board. Parodies of defunct brands, not live ones. Nothing here has been trademark-searched, and the backwards R is trade dress rather than wordplay: swap it first if anyone gets nervous."},
        {"id": "note-language", "x": at["Language.dc.html"], "y": -170, "w": 700, "page": "page-1",
         "text": "Read from the app's stylesheet when the canvas is built, so the values are the ones that ship. The pool and names artboards read packages/engine/src/pool.ts the same way."},
        {"id": "note-rules", "x": 0, "y": -150, "w": 700, "page": "page-2",
         "text": "The sheet to argue with before any code exists. Every disagreement between the two rulebooks is listed as a config key rather than a fork."},
        {"id": "note-earlier", "x": 0, "y": -170, "w": 700, "page": "page-3",
         "text": "The two directions not taken, kept for reference. Board Room makes the board the subject; Trading Floor makes the money the subject."},
      ],
      "launch": {"view": "canvas", "page": "page-1"},
    }
    with io.open(os.path.join(OUT, "canvas.json"), "w", encoding="utf-8") as f:
        f.write(json.dumps(doc, indent=2, ensure_ascii=False))
    print("wrote canvas.json")

def reseed():
    """Put the regenerated artboards into boomtown.html, the published canvas page,
    whose editable state is the "files" record in its appifact-doc script block.
    Publishing that one file to the canvas's URL is then the whole republish."""
    page = os.path.join(OUT, "boomtown.html")
    if not os.path.exists(page):
        return
    src = io.open(page, encoding="utf-8").read()
    tag = '<script type="application/json" id="appifact-doc">'
    a = src.index(tag) + len(tag)
    b = src.index("</script>", a)
    doc = json.loads(src[a:b])
    layout = json.load(io.open(os.path.join(OUT, "canvas.json"), encoding="utf-8"))
    files = {x["file"]: io.open(os.path.join(OUT, x["file"]), encoding="utf-8").read() for x in layout["artboards"]}
    files["canvas.json"] = io.open(os.path.join(OUT, "canvas.json"), encoding="utf-8").read()
    doc["content"]["files"] = files
    raw = json.dumps(doc, ensure_ascii=False).replace("</", "<\\/")
    io.open(page, "w", encoding="utf-8").write(src[:a] + raw + src[b:])
    print("re-seeded boomtown.html (%.1f MB)" % ((a + len(raw) + len(src) - b) / 1e6))

if __name__ == "__main__":
    build_a(); build_c(); build_rules(); build_names(); build_pool()
    build_captured()
    BOARDS["Language.dc.html"] = build_language()
    build_canvas()
    reseed()
