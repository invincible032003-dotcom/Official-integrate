#!/usr/bin/env python3
"""Build the ISS dashboard with the integrated Official Statistics hub.

Inputs
  src/base/ISS-Stats-Paper2-Standalone.html   original offline dashboard (never edited)
  src/official/content/book/*.txt              MCQ sets from the book, pp. 1-329
  src/official/content/notes/*.txt             MCQ sets from topic notes 1-19
  src/official/content/fullforms.tsv           abbreviations (PDF list + supplementary)
  src/official/content/pointers/*.md           bullet exam pointers
  src/official/os-module.css / os-module.js    the Official Statistics hub UI

Output
  index.html                                   single self-contained offline file

Usage
  python3 build/build_official.py            build + validate
  python3 build/build_official.py --check    validate only (no write)
"""
import glob
import hashlib
import json
import os
import random
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "src")
CONTENT = os.path.join(SRC, "official", "content")
BASE = os.path.join(SRC, "base", "ISS-Stats-Paper2-Standalone.html")
OUT = os.path.join(ROOT, "index.html")

NOTE_TOPICS = [
    (1, "MoSPI", 10), (2, "NSO", 21), (3, "NSC (National Statistical Commission)", 6),
    (4, "FOD (Field Operations Division)", 2), (5, "NSS Rounds", 11), (6, "Use of ICT in NSO", 3),
    (7, "Agricultural Statistics", 14), (8, "CPI & WPI", 6), (9, "Industrial Statistics", 7),
    (10, "Labour Statistics", 9), (11, "National Accounts", 9), (12, "SRS (Sample Registration System)", 5),
    (13, "Socio-Economic / Vital Statistics", 9), (14, "NFHS", 3), (15, "Trade Statistics", 3),
    (16, "PLFS", 5), (17, "SDGs & Principles of Official Statistics", 5),
    (18, "CoS Act & Rules (Excerpts)", 5), (19, "Misc. Statistics", 5),
]

errors = []
warnings = []


def err(msg):
    errors.append(msg)


# --------------------------------------------------------------------------
# MCQ set files
# --------------------------------------------------------------------------
KEY_RE = re.compile(r"^(ANS|T|D|P|EXP|SC|TIP|N):\s?(.*)$")
OPT_RE = re.compile(r"^([A-D])\)\s?(.*)$")
TYPES = {"Factual", "Statement", "Match", "Assertion-Reason", "Chronology", "Conceptual", "Numerical", "Odd-one-out"}
DIFFS = {"Easy", "Medium", "Hard"}


def parse_set_file(path, kind):
    meta = {"kind": kind, "file": os.path.relpath(path, ROOT)}
    questions = []
    topic = None
    note_no = None
    cur = None
    mode = None  # "q" while collecting multi-line question text

    def finish():
        nonlocal cur
        if cur is not None:
            questions.append(cur)
        cur = None

    with open(path, encoding="utf-8") as fh:
        lines = fh.read().split("\n")
    for ln_no, raw in enumerate(lines, 1):
        line = raw.rstrip()
        where = "%s:%d" % (meta["file"], ln_no)
        if line.startswith("@"):
            finish()
            mode = None
            k, _, v = line[1:].partition(" ")
            v = v.strip()
            if k == "topic":
                topic = v
            elif k == "note":
                note_no = int(v)
            elif k in ("set", "title", "pages", "desc", "notes"):
                meta[k] = v
            else:
                err("%s unknown directive @%s" % (where, k))
            continue
        if line.startswith("Q:"):
            finish()
            cur = {"q": [line[2:].strip()], "opts": {}, "topic": topic, "note": note_no,
                   "tips": [], "where": where}
            mode = "q"
            continue
        if cur is None:
            if line.strip() and not line.startswith("#"):
                err("%s text outside a question: %r" % (where, line[:60]))
            continue
        m = OPT_RE.match(line)
        if m and (mode in ("q", "o")):
            cur["opts"][m.group(1)] = m.group(2).strip()
            mode = "o"
            continue
        m = KEY_RE.match(line)
        if m:
            key, val = m.group(1), m.group(2).strip()
            mode = "k"
            if key == "TIP":
                cur["tips"].append(val)
            else:
                cur[key] = val
            continue
        if mode == "q":
            cur["q"].append(line)
            continue
        if not line.strip():
            continue
        err("%s unparsed line: %r" % (where, line[:70]))
    finish()
    return meta, questions


def clean_text(s):
    return s.replace("\\n", "\n").strip()


FIXED_TYPES = {"Statement", "Assertion-Reason"}  # Match / Chronology codes read fine in any order
FIXED_WORDS = re.compile(r"\b(above|both|neither|all of|none of|only)\b", re.I)
NUMERIC = re.compile(r"^[\s~<>≈₹]*[-+]?[\d.,]+")


def shuffle_ok(q):
    if q["questionType"] in FIXED_TYPES:
        return False
    if any(FIXED_WORDS.search(o) for o in q["options"]):
        return False
    if q.get("_sorted"):
        return False  # numeric ladder already shown in ascending order
    return True


def rebalance(qs, dist):
    """Spread correct-answer positions evenly across A-D (deterministic).

    Only questions whose options are order-independent are moved; statement,
    match, chronology, 'both/neither' and numeric-ladder options keep the
    author's order. The explanation never refers to option letters."""
    for k in dist:
        dist[k] = 0
    movable = []
    for q in qs:
        if (q["questionType"] not in FIXED_TYPES and all(NUMERIC.match(o) for o in q["options"])
                and not any(FIXED_WORDS.search(o) for o in q["options"])):
            # Numeric ladders are shown in ascending order (UPSC convention).
            def lead(o):
                m = re.search(r"[-+]?\d[\d,]*\.?\d*", o)
                return float(m.group(0).replace(",", "")) if m else 0.0
            vals = [lead(o) for o in q["options"]]
            if len(set(vals)) == 4:
                correct = q["options"][q["correctAnswer"]]
                q["options"] = sorted(q["options"], key=lead)
                q["correctAnswer"] = q["options"].index(correct)
                q["_sorted"] = True
        if shuffle_ok(q):
            movable.append(q)
        else:
            dist["ABCD"[q["correctAnswer"]]] += 1
    for q in qs:
        q.pop("_sorted", None)
    for q in movable:
        h = int(hashlib.md5(q["id"].encode("utf-8")).hexdigest(), 16)
        low = min(dist.values())
        choices = [k for k in "ABCD" if dist[k] == low]
        target = "ABCD".index(choices[h % len(choices)])
        opts = q["options"]
        correct = opts[q["correctAnswer"]]
        others = [o for i, o in enumerate(opts) if i != q["correctAnswer"]]
        others.insert(target, correct)
        q["options"] = others
        q["correctAnswer"] = target
        dist["ABCD"[target]] += 1


def build_sets():
    sets, allq = [], []
    for kind, sub in (("book", "book"), ("notes", "notes"), ("extra", "extra")):
        for path in sorted(glob.glob(os.path.join(CONTENT, sub, "*.txt"))):
            meta, qs = parse_set_file(path, kind)
            sid = meta.get("set")
            if not sid:
                err("%s missing @set" % meta["file"])
                continue
            if any(s["id"] == sid for s in sets):
                err("%s duplicate set id %s" % (meta["file"], sid))
            topics, dist, notes_in = [], {"A": 0, "B": 0, "C": 0, "D": 0}, []
            out = []
            for i, q in enumerate(qs, 1):
                w = q["where"]
                text = clean_text("\n".join(q["q"]).strip("\n"))
                if not text:
                    err("%s empty question" % w)
                if sorted(q["opts"].keys()) != ["A", "B", "C", "D"]:
                    err("%s needs options A-D, got %s" % (w, "".join(sorted(q["opts"]))))
                    continue
                opts = [clean_text(q["opts"][k]) for k in "ABCD"]
                if len(set(o.lower() for o in opts)) != 4:
                    err("%s duplicate options" % w)
                ans = q.get("ANS", "")
                if ans not in ("A", "B", "C", "D"):
                    err("%s bad ANS %r" % (w, ans))
                    continue
                if not q.get("EXP"):
                    err("%s missing EXP" % w)
                if not q.get("SC"):
                    err("%s missing SC" % w)
                qtype = q.get("T", "Factual")
                if qtype not in TYPES:
                    err("%s unknown type %r" % (w, qtype))
                diff = q.get("D", "Medium")
                if diff not in DIFFS:
                    err("%s unknown difficulty %r" % (w, diff))
                blob = text + "".join(opts) + q.get("EXP", "") + q.get("SC", "")
                if "$" in blob:
                    err("%s contains '$' (reserved for math rendering)" % w)
                if not q["topic"]:
                    err("%s question before any @topic" % w)
                if kind == "notes" and not q["note"]:
                    err("%s notes question without @note" % w)
                dist[ans] += 1
                if q["topic"] not in topics:
                    topics.append(q["topic"])
                if q["note"] and q["note"] not in notes_in:
                    notes_in.append(q["note"])
                src_ref = q.get("P", "")
                if kind == "book":
                    source = "Book p. %s" % src_ref if src_ref else "Book pp. %s" % meta.get("pages", "")
                elif kind == "extra":
                    source = "UPSC ISS syllabus (beyond book & notes)" + ((" · " + src_ref) if src_ref else "")
                else:
                    source = "Notes %02d%s" % (q["note"], (", p. %s" % src_ref) if src_ref else "")
                out.append({
                    "id": "OS-%s-%03d" % (sid, i),
                    "setId": sid,
                    "kind": kind,
                    "unit": "Official Statistics",
                    "topic": q["topic"],
                    "subtopic": q["topic"],
                    "noteNo": q["note"],
                    "question": text,
                    "options": opts,
                    "correctAnswer": "ABCD".index(ans),
                    "questionType": qtype,
                    "difficulty": diff,
                    "explanation": clean_text(q.get("EXP", "")),
                    "examShortcut": clean_text(q.get("SC", "")),
                    "tipsTricks": [clean_text(t) for t in q["tips"]],
                    "source": source,
                })
            rebalance(out, dist)
            n = len(out)
            if n and not (40 <= n <= 50):
                warnings.append("set %s has %d questions (target 40-50)" % (sid, n))
            if n >= 20 and max(dist.values()) > 0.45 * n:
                warnings.append("set %s answer key skewed %s" % (sid, dist))
            sets.append({
                "id": sid, "kind": kind, "title": meta.get("title", sid),
                "pages": meta.get("pages", ""), "desc": meta.get("desc", ""),
                "topics": topics, "notes": sorted(notes_in), "count": n, "answerDist": dist,
            })
            allq.extend(out)
    order = {"book": 0, "notes": 1, "extra": 2}
    sets.sort(key=lambda s: (order[s["kind"]], s["id"]))
    return sets, allq


# --------------------------------------------------------------------------
# Full forms -> list + generated MCQ sets
# --------------------------------------------------------------------------
def build_fullforms():
    path = os.path.join(CONTENT, "fullforms.tsv")
    items = []
    if not os.path.exists(path):
        return items, [], []
    with open(path, encoding="utf-8") as fh:
        for ln_no, line in enumerate(fh, 1):
            line = line.rstrip("\n")
            if not line.strip() or line.startswith("#"):
                continue
            cols = line.split("\t")
            if len(cols) < 7:
                err("fullforms.tsv:%d expected 7 tab-separated columns, got %d" % (ln_no, len(cols)))
                continue
            src, cat, abbr, full, d1, d2, d3 = [c.strip() for c in cols[:7]]
            note = cols[7].strip() if len(cols) > 7 else ""
            if src not in ("pdf", "extra"):
                err("fullforms.tsv:%d source must be pdf/extra" % ln_no)
            opts = [full, d1, d2, d3]
            if len(set(o.lower() for o in opts)) != 4 or not all(opts):
                err("fullforms.tsv:%d distractors must be 3 distinct non-empty strings" % ln_no)
            if "$" in "".join(cols):
                err("fullforms.tsv:%d contains '$'" % ln_no)
            items.append({"src": src, "cat": cat, "abbr": abbr, "full": full,
                          "distractors": [d1, d2, d3], "note": note})
    seen = set()
    for it in items:
        if it["abbr"].lower() in seen:
            err("fullforms.tsv duplicate abbreviation %s" % it["abbr"])
        seen.add(it["abbr"].lower())

    # Deterministic option order per item (stable across builds).
    def placed(it):
        h = int(hashlib.md5(it["abbr"].encode("utf-8")).hexdigest(), 16)
        rnd = random.Random(h)
        opts = [it["full"]] + it["distractors"]
        order = list(range(4))
        rnd.shuffle(order)
        return [opts[k] for k in order], order.index(0)

    def initials(s):
        words = re.findall(r"[A-Za-z][A-Za-z'\-]*", s)
        skip = {"of", "and", "the", "for", "in", "on", "to", "a", "an"}
        return " · ".join(w[0].upper() + w[1:] for w in words if w.lower() not in skip)

    EXTRA_GROUPS = [("FF3", "Indian Bodies & Schemes", "Full Forms III - Indian statistical bodies & schemes"),
                    ("FF4", "Surveys, Indices & Concepts", "Full Forms IV - Surveys, indices & concepts"),
                    ("FF5", "International Frameworks & Agencies", "Full Forms V - International frameworks & agencies")]
    groups = [("FF1", "pdf", "Full Forms I - Abbreviations list (Sl. 1-50)"),
              ("FF2", "pdf", "Full Forms II - Abbreviations list (Sl. 51-100)")]
    groups += [(sid, "extra", title) for sid, _, title in EXTRA_GROUPS]
    pdf_items = [it for it in items if it["src"] == "pdf"]
    extra_items = [it for it in items if it["src"] == "extra"]
    chunks = {"FF1": pdf_items[:50], "FF2": pdf_items[50:]}
    for sid, cat, _ in EXTRA_GROUPS:
        chunks[sid] = [it for it in extra_items if it["cat"] == cat]
    known = set(c for _, c, _ in EXTRA_GROUPS)
    for it in extra_items:
        if it["cat"] not in known:
            err("fullforms.tsv extra %s has unknown category %r (use one of %s)" % (it["abbr"], it["cat"], sorted(known)))
    sets, qs = [], []
    for sid, src, title in groups:
        chunk = chunks[sid]
        if not chunk:
            continue
        dist = {"A": 0, "B": 0, "C": 0, "D": 0}
        for i, it in enumerate(chunk, 1):
            opts, ci = placed(it)
            dist["ABCD"[ci]] += 1
            exp = "**%s** = %s." % (it["abbr"], it["full"])
            if it["note"]:
                exp += "\n" + it["note"]
            qs.append({
                "id": "OS-%s-%03d" % (sid, i), "setId": sid, "kind": "fullforms",
                "unit": "Official Statistics", "topic": "Full Forms - " + it["cat"],
                "subtopic": it["cat"], "noteNo": None,
                "question": "What is the correct expanded form of **%s**?" % it["abbr"],
                "options": opts, "correctAnswer": ci, "questionType": "Factual",
                "difficulty": "Easy" if it["src"] == "pdf" else "Medium",
                "explanation": exp,
                "examShortcut": "Decode letter by letter: %s → %s. Reject any option whose words do not map one-to-one onto the letters of %s." % (
                    it["abbr"], initials(it["full"]), it["abbr"]),
                "tipsTricks": [],
                "source": "Full-form list" if it["src"] == "pdf" else "Supplementary (book & notes)",
            })
        sets.append({"id": sid, "kind": "fullforms", "title": title, "pages": "",
                     "desc": "%d abbreviations, near-miss distractors" % len(chunk),
                     "topics": sorted(set("Full Forms - " + c["cat"] for c in chunk)),
                     "notes": [], "count": len(chunk), "answerDist": dist})
    public = [{"abbr": it["abbr"], "full": it["full"], "cat": it["cat"], "note": it["note"], "src": it["src"]}
              for it in items]
    return public, sets, qs


# --------------------------------------------------------------------------
# Pointers (markdown-lite)
# --------------------------------------------------------------------------
def build_pointers():
    out = []
    for path in sorted(glob.glob(os.path.join(CONTENT, "pointers", "*.md"))):
        rel = os.path.relpath(path, ROOT)
        block = {"id": os.path.splitext(os.path.basename(path))[0], "title": "", "source": "",
                 "group": "", "sections": []}
        sec = None
        with open(path, encoding="utf-8") as fh:
            for ln_no, line in enumerate(fh, 1):
                line = line.rstrip()
                if not line.strip():
                    continue
                if line.startswith("# "):
                    block["title"] = line[2:].strip()
                elif line.startswith("@source "):
                    block["source"] = line[8:].strip()
                elif line.startswith("@group "):
                    block["group"] = line[7:].strip()
                elif line.startswith("## "):
                    sec = {"h": line[3:].strip(), "items": []}
                    block["sections"].append(sec)
                elif line.startswith("- ") or line.startswith("! "):
                    if sec is None:
                        sec = {"h": "", "items": []}
                        block["sections"].append(sec)
                    if "$" in line:
                        err("%s:%d contains '$'" % (rel, ln_no))
                    sec["items"].append({"t": line[2:].strip(), "hy": line.startswith("! ")})
                elif line.startswith("  ") and sec and sec["items"]:
                    sec["items"][-1]["t"] += " " + line.strip()
                else:
                    err("%s:%d unparsed pointer line %r" % (rel, ln_no, line[:60]))
        if not block["title"]:
            err("%s missing '# title'" % rel)
        if block["group"] not in ("book", "notes", "extra", "fullforms", "strategy"):
            err("%s @group must be book/notes/extra/fullforms/strategy" % rel)
        out.append(block)
    order = {"strategy": 0, "notes": 1, "book": 2, "extra": 3, "fullforms": 4}
    out.sort(key=lambda blk: (order.get(blk["group"], 9), blk["id"]))
    return out


# --------------------------------------------------------------------------
# Injection into the base dashboard
# --------------------------------------------------------------------------
def must_replace(html, old, new, label, count=1):
    n = html.count(old)
    if n != count:
        err("patch '%s': expected %d occurrence(s) of marker, found %d" % (label, count, n))
        return html
    return html.replace(old, new)


def inject(data):
    with open(BASE, encoding="utf-8") as fh:
        html = fh.read()
    with open(os.path.join(SRC, "official", "os-module.css"), encoding="utf-8") as fh:
        css = fh.read()
    with open(os.path.join(SRC, "official", "os-module.js"), encoding="utf-8") as fh:
        js = fh.read()

    html = must_replace(
        html,
        '<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">',
        '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n'
        '<meta name="theme-color" content="#1a4d8f" media="(prefers-color-scheme: light)">\n'
        '<meta name="theme-color" content="#0f1218" media="(prefers-color-scheme: dark)">\n'
        '<meta name="mobile-web-app-capable" content="yes">\n'
        '<meta name="apple-mobile-web-app-capable" content="yes">\n'
        '<meta name="format-detection" content="telephone=no">',
        "viewport")
    html = must_replace(html, "<title>Offline Mock Exam Platform</title>",
                        "<title>ISS Paper II · Official Statistics Hub</title>", "title")
    html = must_replace(html, "</head>", "<style id=\"os-module-css\">\n" + css + "\n</style>\n</head>", "css")

    payload = json.dumps(data, ensure_ascii=False, separators=(",", ":"))
    payload = payload.replace("</", "<\\/")
    data_script = ("<script>\n// AUTO-GENERATED by build/build_official.py - do not edit by hand.\n"
                   "// Official Statistics hub: book pp. 1-329, topic notes 1-19, full forms, bullet pointers.\n"
                   "window.officialStatsData = " + payload + ";\n</script>\n")
    html = must_replace(html, "<script>\n(function(){\n\"use strict\";",
                        data_script + "<script>\n(function(){\n\"use strict\";", "data")

    boot = ("/* =========================================================================\n"
            "   12. BOOT")
    html = must_replace(html, boot, js + "\n\n" + boot, "module")

    # Keep PYQ analytics authentic: bank questions are tracked in the OS hub instead.
    html = must_replace(html, "if(!q || q.isForecast || q.isPrestorm) return;",
                        "if(!q || q.isForecast || q.isPrestorm || q.isOS) return;", "analytics")
    # Exam + review badges / banner for bank questions.
    html = must_replace(html, "  var metaBadges = q.isForecast\n",
                        "  var metaBadges = q.isOS ? osMetaBadges(q, false)\n    : q.isForecast\n", "exam badges")
    html = must_replace(html, "  var forecastBanner = q.isForecast ?",
                        "  var forecastBanner = q.isOS ? osBanner(q) : q.isForecast ?", "exam banner")
    html = must_replace(html, "  var reviewMetaBadges = q.isForecast\n",
                        "  var reviewMetaBadges = q.isOS ? osMetaBadges(q, true) + status\n    : q.isForecast\n",
                        "review badges")
    html = must_replace(html, "  var reviewForecastBanner = q.isForecast ?",
                        "  var reviewForecastBanner = q.isOS ? osBanner(q) : q.isForecast ?", "review banner")
    # Explanation block (bank questions carry `explanation` instead of step lists).
    html = must_replace(html,
                        "    if(hasSolution){\n      feedbackHtml += '<div class=\"reveal-block\"><h4>Step-by-Step Solution</h4>",
                        "    if(q.isOS) feedbackHtml += osExplainBlock(q);\n"
                        "    if(hasSolution){\n      feedbackHtml += '<div class=\"reveal-block\"><h4>Step-by-Step Solution</h4>",
                        "exam explanation")
    html = must_replace(html,
                        "    + '<div class=\"feedback-panel\">'\n    +   '<div class=\"reveal-block\"><h4>Exam Shortcut",
                        "    + '<div class=\"feedback-panel\">'\n    +   (q.isOS ? osExplainBlock(q) : '')\n"
                        "    +   '<div class=\"reveal-block\"><h4>Exam Shortcut",
                        "review explanation")
    html = must_replace(html,
                        "return '<div class=\"history-row\"><div><div class=\"h-title\">'+q.year+' Q'+q.questionNumber+' - '+escapeHtmlPlain(q.subtopic)+'</div><div class=\"h-meta\">'+unitShort(q.unit)+'</div></div>",
                        "return '<div class=\"history-row\"><div>'+(q.isOS ? osBookmarkLabel(q) : '<div class=\"h-title\">'+q.year+' Q'+q.questionNumber+' - '+escapeHtmlPlain(q.subtopic)+'</div><div class=\"h-meta\">'+unitShort(q.unit)+'</div>')+'</div>",
                        "bookmarks")
    return html


def main():
    check_only = "--check" in sys.argv
    sets, qs = build_sets()
    ff, ff_sets, ff_qs = build_fullforms()
    pointers = build_pointers()
    all_sets = sets + ff_sets
    all_q = qs + ff_qs
    ids = [q["id"] for q in all_q]
    if len(ids) != len(set(ids)):
        err("duplicate question ids")
    # Near-duplicate question stems across the bank.
    seen = {}
    for q in all_q:
        key = re.sub(r"\W+", " ", q["question"].lower()).strip()
        if key in seen and q["kind"] != "fullforms":
            warnings.append("duplicate stem %s ~ %s" % (seen[key], q["id"]))
        seen[key] = q["id"]
    data = {
        "builtAt": "static",
        "noteTopics": [{"no": n, "title": t, "pages": p} for n, t, p in NOTE_TOPICS],
        "sets": all_sets,
        "questions": all_q,
        "fullForms": ff,
        "pointers": pointers,
    }
    html = inject(data)

    by_kind = {}
    for s in all_sets:
        by_kind.setdefault(s["kind"], [0, 0])
        by_kind[s["kind"]][0] += 1
        by_kind[s["kind"]][1] += s["count"]
    total_dist = {"A": 0, "B": 0, "C": 0, "D": 0}
    for q in all_q:
        total_dist["ABCD"[q["correctAnswer"]]] += 1
    print("sets:", {k: "%d sets / %d Qs" % tuple(v) for k, v in by_kind.items()})
    print("questions:", len(all_q), "answer key:", total_dist)
    print("full forms:", len(ff), "pointer blocks:", len(pointers),
          "bullets:", sum(len(s["items"]) for p in pointers for s in p["sections"]))
    for w in warnings:
        print("WARN", w)
    if errors:
        for e in errors:
            print("ERROR", e)
        sys.exit(1)
    if not check_only:
        with open(OUT, "w", encoding="utf-8") as fh:
            fh.write(html)
        print("wrote", os.path.relpath(OUT, ROOT), "(%.2f MB)" % (len(html.encode("utf-8")) / 1e6))


if __name__ == "__main__":
    main()
