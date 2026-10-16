"""Builds data/courses.json and data/programs.json for the app.

REAL (parsed from Algoma's 2026-2027 academic calendar by parse-calendar.py):
  course codes, titles, credits, prerequisites, and each degree's named required courses.
INVENTED for demonstration: every section time (the public site has no timetable;
  sections only exist in the login-only Self-Service).
SIMPLIFIED: in a degree, courses named in the calendar table are "required"; courses inside
  "N credits from..." or "A or B" items, plus the rest of the degree's home subjects, are
  "electives". The calendar's elective-credit rules are not modelled.

Run from the project folder:  python data/raw/make-demo-data.py
"""
import json
import re

catalog = {c["code"]: c for c in json.load(open("data/raw/calendar-catalog.json", encoding="utf-8"))}
degrees = json.load(open("data/raw/calendar-degrees.json", encoding="utf-8"))

# id -> (display name, area, years, home subjects)
PROGRAMS = [
    ("BCOSC3", "Bachelor of Computer Science (General)", "Computer Science", 3, ["COSC", "MATH"]),
    ("BCOSC4", "Bachelor of Computer Science (Honours)", "Computer Science", 4, ["COSC", "MATH"]),
    ("BSC3.BIOL", "Bachelor of Science (General): Biology", "Biology", 3, ["BIOL", "CHMI"]),
    ("BSC4.BIOL", "Bachelor of Science (Honours): Biology", "Biology", 4, ["BIOL", "CHMI"]),
    ("BA3.PSYC", "Bachelor of Arts (General): Psychology", "Psychology", 3, ["PSYC"]),
    ("BA4.PSYC", "Bachelor of Arts (Honours): Psychology", "Psychology", 4, ["PSYC"]),
    ("BSC4.PSYC", "Bachelor of Science (Honours): Psychology", "Psychology", 4, ["PSYC"]),
    ("BBA", "Bachelor of Business Administration (Honours)", "Business", 4, ["ADMN", "ECON"]),
    ("BA4.SOCI", "Bachelor of Arts (Honours): Sociology", "Sociology", 4, ["SOCI"]),
]

PLAIN = re.compile(r"^[A-Z]{4} \d{4}$")   # skips lab-suffixed codes like COSC 1046L
level = lambda code: int(code.split()[1][0])


def closure(codes):
    """Add every prerequisite (and their prerequisites) so 'passed' can always be ticked."""
    seen, todo = set(), list(codes)
    while todo:
        c = todo.pop()
        if c in seen or c not in catalog:
            continue
        seen.add(c)
        for group in catalog[c]["prereqs"]:
            todo.extend(group)
    return seen


programs, program_codes = [], {}
for pid, name, area, years, subjects in PROGRAMS:
    d = degrees[pid]
    named = [c for c in d["required"] if c in catalog and PLAIN.match(c)]
    choose = [c for c in d["choose"] if c in catalog and PLAIN.match(c) and c not in named]
    home = [c for c, v in catalog.items()
            if PLAIN.match(c) and c.split()[0] in subjects and level(c) <= years
            and c not in named and c not in choose]
    pool = set(named) | set(choose) | set(home)
    pool |= {c for c in closure(pool) if PLAIN.match(c) and level(c) <= years}
    electives = sorted(pool - set(named), key=lambda c: (level(c), c))
    program_codes[pid] = pool
    programs.append({
        "id": pid.lower().replace(".", "-"),
        "code": pid,
        "name": name,
        "area": area,
        "years": years,
        "totalCredits": d["total_credits"] or years * 30,
        "required": named,
        "electives": electives,
    })

all_codes = sorted(set().union(*program_codes.values()), key=lambda c: (c.split()[0], c))

# ---------- invented section times ----------
STARTS = ["08:30", "10:00", "11:30", "13:00", "14:30", "16:00"]
PAIRS = [("Mon", "Wed"), ("Tue", "Thu")]


def end_of(start, minutes=80):
    h, m = map(int, start.split(":"))
    t = h * 60 + m + minutes
    return f"{t // 60:02d}:{t % 60:02d}"


def sections_for(i, has_lab):
    """Deterministic, invented: usually 3 sections, sometimes 2 or 1."""
    count = 1 if i % 7 == 6 else (2 if i % 3 == 0 else 3)
    out = []
    for n in range(count):
        d1, d2 = PAIRS[(i + n) % 2]
        start = STARTS[(i + 2 * n) % 6]
        meetings = [{"day": d, "start": start, "end": end_of(start)} for d in (d1, d2)]
        if has_lab:  # lecture + lab merged into one section
            lab_day = "Fri" if n == 0 else ("Mon" if d1 == "Tue" else "Tue")
            lab = STARTS[i % 4] if n == 0 else "16:00"
            meetings.append({"day": lab_day, "start": lab, "end": end_of(lab, 110)})
        out.append({"id": "ABC"[n], "meetings": meetings})
    return out


courses = []
for i, code in enumerate(all_codes):
    c = catalog[code]
    prereqs = [[p for p in g if p in catalog and PLAIN.match(p)] for g in c["prereqs"]]
    prereqs = [g for g in prereqs if g]
    course = {
        "code": code,
        "title": c["title"],
        "credits": c["credits"] or 3,
        "prereqs": prereqs,
        "counts_as": "elective",
        "sections": sections_for(i, c["has_lab"]),
    }
    if c["needs_review"] and c["prereq_text"]:
        course["note"] = c["prereq_text"][:180]
    courses.append(course)

# Every prerequisite must exist in the data.
known = {c["code"] for c in courses}
for c in courses:
    for g in c["prereqs"]:
        for p in g:
            assert p in known, f"{c['code']} needs {p}, which is missing"

# A course shows up for a degree only if it is in that degree's pool.
for p in programs:
    p["courses"] = sorted(program_codes[p["code"]], key=lambda c: (level(c), c))

json.dump(courses, open("data/courses.json", "w", encoding="utf-8"), separators=(",", ":"))
json.dump(programs, open("data/programs.json", "w", encoding="utf-8"), indent=1)
print(len(courses), "courses,", len(programs), "programs")
for p in programs:
    print(f"  {p['code']:10} {len(p['required']):3} required, {len(p['electives']):3} electives, {len(p['courses']):3} courses")
