# -*- coding: utf-8 -*-
"""Renders the design canvas artboards to a single reference PDF.

Each artboard becomes one page at its own natural size (96 css px per inch),
so nothing is scaled or cropped. Requires Google Chrome and pypdf.

    python3 make_pdf.py
"""
import json, os, re, subprocess, sys, tempfile, shutil

OUT = os.path.dirname(os.path.abspath(__file__))
CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
ARTIFACT = "https://claude.ai/code/artifact/f1b58905-2da0-4cd0-9c2e-8d65624260a3"

CAPTIONS = {
  "Main.dc.html":         ("The table", "Turn 14, mid-merger — the screen players spend the game on"),
  "Reference.dc.html":    ("Stock reference", "The price and bonus chart, and one corporation's ladder"),
  "Names.dc.html":        ("Merged names", "How an acquiring corporation's name and flavour accrete"),
  "Pool.dc.html":         ("The pool", "28 companies across seven industries, four drawn per game"),
  "RulesModel.dc.html":   ("Rules model", "Turn, merger sequencing, edition config, invariants"),
  "BoardRoom.dc.html":    ("Direction A — Board Room", "Not taken: the board as the subject"),
  "TradingFloor.dc.html": ("Direction C — Trading Floor", "Not taken: the money as the subject"),
}
ORDERED = ["Main.dc.html", "Reference.dc.html", "Names.dc.html", "Pool.dc.html",
           "RulesModel.dc.html", "BoardRoom.dc.html", "TradingFloor.dc.html"]

PRINT_CSS = """
  *, *::before, *::after { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
  html, body { margin: 0; padding: 0; background: #FFFFFF; }
"""

def parts(path):
    """Pull the helmet contents and the artboard markup out of a .dc.html file."""
    src = open(path, encoding="utf-8").read()
    helmet = re.search(r"<helmet>(.*?)</helmet>", src, re.S)
    body = re.search(r"</helmet>(.*?)</x-dc>", src, re.S)
    return (helmet.group(1) if helmet else ""), (body.group(1) if body else "")

def page_html(helmet, body, w, h):
    return ("<!doctype html><html><head><meta charset='utf-8'>%s<style>@page { size: %dpx %dpx; margin: 0; }"
            "%s</style></head><body>%s</body></html>" % (helmet, w, h, PRINT_CSS, body))

def cover(sizes):
    rows = "".join(
      "<div style='display:flex;align-items:baseline;gap:16px;padding:13px 0;"
      "border-bottom:1px solid #E7DED2'>"
      "<span style='width:26px;font-size:13px;color:#867A6D'>%d</span>"
      "<span style='width:290px;font-size:17px'>%s</span>"
      "<span style='flex-grow:1;font-size:13px;color:#867A6D'>%s</span></div>"
      % (i + 2, CAPTIONS[f][0], CAPTIONS[f][1]) for i, f in enumerate(ORDERED))
    return ("<div style=\"width:1440px;height:900px;background:#FAF6F0;color:#1C1917;"
            "font-family:'DM Sans',Helvetica,Arial,sans-serif;padding:90px 110px;box-sizing:border-box;"
            "display:flex;flex-direction:column\">"
            "<div style='font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:#867A6D'>"
            "Design reference</div>"
            "<div style=\"font-family:'DM Serif Display',Georgia,serif;font-size:76px;margin-top:14px;"
            "line-height:1\">Boomtown</div>"
            "<div style='font-size:15px;line-height:1.5;color:#867A6D;margin-top:16px;max-width:720px'>"
            "A web implementation of Acquire — mechanics only, renamed and re-themed. Seven companies that "
            "were once the biggest thing in their category, and then got eaten.</div>"
            "<div style='margin-top:44px'>%s</div>"
            "<div style='margin-top:auto;display:flex;justify-content:space-between;font-size:11px;color:#867A6D'>"
            "<span>Every page at its true size — 96 px per inch, nothing scaled.</span>"
            "<span>%s</span></div></div>" % (rows, ARTIFACT))

def measure(helmet, body, chrome_tmp):
    """Ask Chrome how tall the artboard actually renders, padding included."""
    probe = ("<!doctype html><html><head><meta charset='utf-8'>%s"
             "<style>html,body{margin:0;padding:0}</style></head><body>%s"
             "<script>addEventListener('load',()=>{document.title='H'+Math.ceil("
             "document.body.getBoundingClientRect().height)})</script></body></html>" % (helmet, body))
    src = os.path.join(chrome_tmp, "probe.html")
    open(src, "w", encoding="utf-8").write(probe)
    dom = subprocess.run([CHROME, "--headless=new", "--disable-gpu", "--no-sandbox",
                          "--virtual-time-budget=9000", "--dump-dom", src],
                         capture_output=True, text=True).stdout
    hit = re.search(r"<title>H(\d+)</title>", dom)
    return int(hit.group(1)) if hit else None

def main():
    if not os.path.exists(CHROME):
        sys.exit("Google Chrome not found at %s" % CHROME)
    from pypdf import PdfWriter
    layout = {a["file"]: a for a in json.load(open(os.path.join(OUT, "canvas.json")))["artboards"]}
    tmp = tempfile.mkdtemp(prefix="boomtown-pdf-")
    pdfs = []
    jobs = [("Cover", None, 1440, 900)] + [
        (f[:-8], f, layout[f]["w"], layout[f]["h"]) for f in ORDERED if f in layout]
    for name, f, w, h in jobs:
        if f is None:
            helmet = ("<link rel='stylesheet' href='https://fonts.googleapis.com/css2?"
                      "family=DM+Serif+Display&family=DM+Sans:wght@400;500;700&display=swap'>")
            body = cover(None)
        else:
            helmet, body = parts(os.path.join(OUT, f))
            actual = measure(helmet, body, tmp)
            if actual:
                h = actual          # the frame is a hint; what it renders to is the truth
        src = os.path.join(tmp, name + ".html")
        dst = os.path.join(tmp, name + ".pdf")
        open(src, "w", encoding="utf-8").write(page_html(helmet, body, w, h))
        subprocess.run([CHROME, "--headless=new", "--disable-gpu", "--no-sandbox",
                        "--no-pdf-header-footer", "--run-all-compositor-stages-before-draw",
                        "--virtual-time-budget=12000", "--print-to-pdf=" + dst, src],
                       check=True, capture_output=True)
        pdfs.append(dst)
        print("  rendered %-16s %d x %d" % (name, w, h))
    writer = PdfWriter()
    for f in pdfs:
        writer.append(f)
    out = os.path.join(OUT, "boomtown-designs.pdf")
    with open(out, "wb") as fh:
        writer.write(fh)
    shutil.rmtree(tmp, ignore_errors=True)
    print("wrote %s (%d pages, %.1f MB)" % (out, len(pdfs), os.path.getsize(out) / 1e6))

if __name__ == "__main__":
    main()
