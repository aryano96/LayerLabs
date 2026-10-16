"""Reads Algoma's 2026-2027 academic calendar PDFs and writes data/raw/calendar-catalog.json
and data/raw/calendar-degrees.json.

Needs PyMuPDF (pip install pymupdf). The PDFs are not stored in the repo. Get them from the
registrar's academic calendar page (Chapter 3: Degrees and Program Requirements, Chapter 4:
Undergraduate Course List).

Usage: python data/raw/parse-calendar.py <chapter3.pdf> <chapter4.pdf>
"""
import json
import re
import sys

import pymupdf

CODE = re.compile(r"^[A-Z]{4}-\s?\d{4}[A-Z]?$")


def spans_of(pdf_path):
    """Yield (font, text) for every text span, page by page."""
    doc = pymupdf.open(pdf_path)
    for page in doc:
        for block in page.get_text("dict")["blocks"]:
            for line in block.get("lines", []):
                for span in line["spans"]:
                    yield span["font"], span["text"]


# ---------- Chapter 4: course list ----------

def parse_courses(pdf_path):
    entries = []
    cur = None
    for font, text in spans_of(pdf_path):
        t = text.replace("​", "").strip()
        bold = "Bold" in font
        if CODE.match(t) and not bold and "Italic" not in font:
            cur = {"code": re.sub(r"-\s*", " ", t), "title": "", "desc": ""}
            entries.append(cur)
            continue
        if cur is None:
            continue
        if bold and not cur["desc"].strip() and t:
            cur["title"] += (" " if cur["title"] else "") + t
        else:
            cur["desc"] += text.replace("​", "") + ""
    courses = {}
    for e in entries:
        desc = re.sub(r"\s+", " ", e["desc"]).strip()
        title = re.sub(r"\s+", " ", e["title"]).strip()
        if not title or e["code"] in courses:
            continue
        credits = re.search(r"\((\d+(?:\.\d+)?) cr\)", desc)
        contact = re.search(r"\((LEC|EXP|WIL|SEM|LAB|TUT|IND)[^)]*\)", desc)
        prereq_text, groups, review = parse_prereq(desc)
        courses[e["code"]] = {
            "code": e["code"],
            "title": title,
            "credits": float(credits.group(1)) if credits else None,
            "prereqs": groups,
            "has_lab": bool(contact and "LAB" in contact.group(0)),
            "prereq_text": prereq_text,
            "needs_review": review,
        }
    return courses


def parse_prereq(desc):
    """Turn 'Prerequisites: A and B, or C.' into groups [[A],[B,C]] (AND of ORs)."""
    m = re.search(r"Pre-?requisites?\s*:?\s*(.*?)(?=\(\s*(?:LEC|EXP|WIL|SEM|LAB|TUT|IND)|Students may|Corequisite|Co-requisite|$)", desc)
    if not m:
        return "", [], False
    text = m.group(1).strip()
    tokens = re.findall(r"[A-Z]{4}-\d{4}[A-Z]?|\band\b|\bor\b|,|/", text)
    groups = []
    pending_or = False
    for tok in tokens:
        if re.match(r"[A-Z]{4}-", tok):
            code = re.sub(r"-\s*", " ", tok)
            if pending_or and groups:
                groups[-1].append(code)
            else:
                groups.append([code])
            pending_or = False
        elif tok in ("or", "/"):
            pending_or = True
        else:  # 'and' or ','
            pending_or = False
    # Things we cannot express as course groups.
    review = bool(re.search(r"(?i)standing|credits|average|completion|complete|year|approval|permission of the (?!school|department|instructor)", text))
    return text, groups, review


# ---------- Chapter 3: degree tables ----------

def parse_degrees(pdf_path, wanted):
    """For each wanted degree code, split its table into 'required' (named courses) and
    'choose' (courses inside 'N credits from ...' or 'A or B' items)."""
    text = " ".join(t for _, t in spans_of(pdf_path))
    text = re.sub(r"\s+", " ", text.replace("​", ""))
    out = {}
    for code in wanted:
        pat = r"(\d+\.\d+\.\d+) ([A-Z][A-Z ,:()\-/&\.]{6,160}?) \[" + re.escape(code) + r"\] Requirements:"
        ms = list(re.finditer(pat, text))
        if not ms:
            continue
        m = ms[-1]
        rest = text[m.end():]
        nxt = re.search(r" \d+\.\d+\.\d+ [A-Z][A-Z ,:()\-/&\.]{6,160}? \[[A-Z0-9\.]+\] Requirements:", rest)
        region = rest[: nxt.start()] if nxt else rest[:6000]
        head = region[:300]
        credits = re.search(r"(\d+)\s*credits", head)
        required, choose = [], []
        for item in re.split(r"●|•", region):
            codes = re.findall(r"\b([A-Z]{4})\s?(\d{4}[A-Z]?)\b", item)
            codes = [f"{a} {b}" for a, b in codes]
            if not codes:
                continue
            is_choice = bool(re.search(r"(?i)\bcredits?\s+(from|of)\b|\bor\b", item))
            (choose if is_choice else required).extend(codes)
        out[code] = {
            "id": code,
            "name": m.group(2).title().replace(" - ", ", ").strip(),
            "raw_name": m.group(2).strip(),
            "section": m.group(1),
            "total_credits": int(credits.group(1)) if credits else None,
            "required": list(dict.fromkeys(required)),
            "choose": [c for c in dict.fromkeys(choose) if c not in required],
        }
    return out


if __name__ == "__main__":
    ch3, ch4 = sys.argv[1], sys.argv[2]
    courses = parse_courses(ch4)
    json.dump(sorted(courses.values(), key=lambda c: c["code"]),
              open("data/raw/calendar-catalog.json", "w", encoding="utf-8"), indent=0)
    print(len(courses), "courses parsed")
    wanted = ["BCOSC3", "BCOSC4", "BSC3.BIOL", "BSC4.BIOL", "BA3.PSYC", "BA4.PSYC", "BSC4.PSYC",
              "BBA", "BA3.SOCI", "BA4.SOCI", "BSC4.ENVS", "BSW"]
    deg = parse_degrees(ch3, wanted)
    json.dump(deg, open("data/raw/calendar-degrees.json", "w", encoding="utf-8"), indent=1)
    for k, v in deg.items():
        print(k, v["total_credits"], "cr |", len(v["required"]), "required |", len(v["choose"]), "choose-from")
    print("missing:", [w for w in wanted if w not in deg])
