"""Builds data/courses.json and data/programs.json for the app.

REAL (parsed from Algoma's 2026-2027 academic calendar by parse-calendar.py):
  course codes, titles, credits, prerequisites, and each degree's named required courses.
INVENTED for demonstration: the DAYS and START TIMES of every section (the public site has no timetable;
  sections only exist in the login-only Self-Service). The weekly hours per course (lecture, lab, tutorial)
  are real, from the calendar, and the generator checks them.
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

# ---------- section times ----------
# The weekly HOURS of every course are real (parsed from the calendar: "LEC 3, LAB 1.5").
# Only the days and start times are invented, because the public site has no timetable.
# A course meets either as one 3-hour block or as two 1.5-hour sessions (the same shape for every
# section of that course); labs and tutorials are separate sessions; nothing runs past 17:30.
DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri"]
PAIRS = [("Mon", "Wed"), ("Tue", "Thu")]
STARTS_90 = ["08:30", "10:00", "11:30", "13:00", "14:30", "16:00"]   # 1.5-hour sessions end by 17:30
STARTS_180 = ["08:30", "10:00", "11:30", "13:00", "14:30"]           # 3-hour blocks end by 17:30


def to_min(t):
    h, m = map(int, t.split(":"))
    return h * 60 + m


def to_str(m):
    return f"{m // 60:02d}:{m % 60:02d}"


def starts_for(minutes):
    """Start times that let a session of this length finish by 17:30."""
    return [t for t in STARTS_90 if to_min(t) + minutes <= 17 * 60 + 30]


def meeting(day, start, minutes):
    return {"day": day, "start": start, "end": to_str(to_min(start) + minutes)}


def clashes(m, others):
    return any(o["day"] == m["day"] and to_min(m["start"]) < to_min(o["end"]) and to_min(o["start"]) < to_min(m["end"]) for o in others)


def place(minutes, taken, i, n, sessions):
    """A lab or tutorial: one session, or two 1.5-hour sessions, placed so it never clashes with the course's own lecture."""
    for shift in range(40):
        options = starts_for(minutes)
        start = options[(i + 2 * n + shift) % len(options)]
        days = PAIRS[(i + n + shift) % 2] if sessions == 2 else (DAYS[(i + n + 1 + shift) % 5],)
        candidate = [meeting(d, start, minutes) for d in days]
        if not any(clashes(c, taken) for c in candidate):
            return candidate
    raise RuntimeError("could not place a session")


def sections_for(i, hours, credits):
    lec = min(hours.get("LEC") or min(credits, 3) or 3, 3)
    lab, tut = hours.get("LAB", 0), hours.get("TUT", 0)
    one_block = lec == 3 and i % 2 == 0          # per course: one 3-hour block, or two 1.5-hour sessions
    count = 1 if i % 7 == 6 else (2 if i % 3 == 0 else 3)
    out = []
    for n in range(count):
        if lec == 3 and one_block:
            meetings = [meeting(DAYS[(i + 2 * n) % 5], STARTS_180[(i + n) % len(STARTS_180)], 180)]
        elif lec == 3:
            d1, d2 = PAIRS[(i + n) % 2]
            start = STARTS_90[(i + 2 * n) % len(STARTS_90)]
            meetings = [meeting(d1, start, 90), meeting(d2, start, 90)]
        else:                                     # 1- or 2-hour courses meet once a week
            options = starts_for(int(lec * 60))
            meetings = [meeting(DAYS[(i + n) % 5], options[(i + 2 * n) % len(options)], int(lec * 60))]
        if lab:
            meetings += place(90 if lab == 3 else int(lab * 60), meetings, i, n, 2 if lab == 3 else 1)
        if tut:
            meetings += place(90 if tut == 3 else int(tut * 60), meetings, i, n + 3, 2 if tut == 3 else 1)
        meetings.sort(key=lambda m: (DAYS.index(m["day"]), m["start"]))
        out.append({"id": "ABC"[n], "meetings": meetings})
    return out


def check_sections(code, sections, hours, credits):
    """Fail loudly if the demo timetable stops matching the calendar's weekly hours."""
    lec = min(hours.get("LEC") or min(credits, 3) or 3, 3)
    expected = int((lec + hours.get("LAB", 0) + hours.get("TUT", 0)) * 60)
    for sec in sections:
        ms = sec["meetings"]
        assert sum(to_min(m["end"]) - to_min(m["start"]) for m in ms) == expected, f"{code} {sec['id']}: weekly minutes differ from the calendar"
        assert all(to_min(m["start"]) % 30 == 0 and to_min(m["start"]) >= 8 * 60 + 30 and to_min(m["end"]) <= 17 * 60 + 30 for m in ms), f"{code}: time outside 08:30-17:30 or off the half hour"
        assert not any(clashes(m, [o for o in ms if o is not m]) for m in ms), f"{code} {sec['id']}: its own sessions overlap"
        assert all(to_min(m["end"]) - to_min(m["start"]) in (60, 90, 120, 180) for m in ms), f"{code}: unusual session length"


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
        "sections": sections_for(i, c.get("hours") or {}, c["credits"] or 3),
    }
    check_sections(code, course["sections"], c.get("hours") or {}, c["credits"] or 3)
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
