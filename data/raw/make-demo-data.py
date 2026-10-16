"""Builds the DEMO data files for the app.

Titles and prerequisites come from data/raw/cosc-catalog-draft.json (typed from Algoma's
catalog). Section times and degree requirement lists are INVENTED for demonstration.
MATH course titles and prerequisites are also invented (they were not in our screenshots).

Run from the project folder:  python data/raw/make-demo-data.py
"""
import json

draft = {c["code"]: c for c in json.load(open("data/raw/cosc-catalog-draft.json", encoding="utf-8"))["courses"]}

# Invented MATH courses (the real catalog entries were not captured).
math = {
    "MATH 1036": ("Mathematics 1036 (demo title)", []),
    "MATH 1056": ("Mathematics 1056 (demo title)", []),
    "MATH 1057": ("Mathematics 1057 (demo title)", [["MATH 1056"]]),
    "MATH 2056": ("Mathematics 2056 (demo title)", [["MATH 1057"]]),
}

# Which courses go into the demo, in display order.
CODES = [
    "COSC 1046", "COSC 1047", "COSC 1056", "COSC 1701", "MATH 1036", "MATH 1056", "MATH 1057",
    "COSC 2006", "COSC 2007", "COSC 2036", "COSC 2307", "COSC 2406", "COSC 2507", "COSC 2596",
    "COSC 2947", "COSC 2956", "MATH 2056",
    "COSC 3106", "COSC 3117", "COSC 3127", "COSC 3216", "COSC 3406", "COSC 3407", "COSC 3506",
    "COSC 3596", "COSC 3796", "COSC 3807",
    "COSC 4086", "COSC 4106", "COSC 4127", "COSC 4206", "COSC 4437",
]

STARTS = ["08:30", "10:00", "11:30", "13:00", "14:30", "16:00"]
PAIRS = [("Mon", "Wed"), ("Tue", "Thu")]


def end_of(start, minutes=80):
    h, m = map(int, start.split(":"))
    t = h * 60 + m + minutes
    return f"{t // 60:02d}:{t % 60:02d}"


def sections_for(i, has_lab):
    """Invented, deterministic section times: usually 3 sections, some courses have 2 or just 1."""
    count = 1 if i % 7 == 6 else (2 if i % 3 == 0 else 3)
    out = []
    for n in range(count):
        d1, d2 = PAIRS[(i + n) % 2]
        start = STARTS[(i + 2 * n) % 6]
        meetings = [{"day": d, "start": start, "end": end_of(start)} for d in (d1, d2)]
        if has_lab:  # lecture + lab merged into one section
            # section A: lab on Friday; others: lab late afternoon on a day with no lecture
            lab_day = "Fri" if n == 0 else ("Mon" if d1 == "Tue" else "Tue")
            lab = STARTS[i % 4] if n == 0 else "16:00"
            meetings.append({"day": lab_day, "start": lab, "end": end_of(lab, 110)})
        out.append({"id": "ABC"[n], "meetings": meetings})
    return out


courses = []
for i, code in enumerate(CODES):
    if code in draft:
        d = draft[code]
        title, prereqs, has_lab = d["title"], d["prereqs"], d.get("has_lab", False)
    else:
        title, prereqs = math[code]
        has_lab = False
    courses.append({"code": code, "title": title, "prereqs": prereqs,
                    "counts_as": "elective", "sections": sections_for(i, has_lab)})

# Every prerequisite must exist in the demo set.
known = {c["code"] for c in courses}
for c in courses:
    for g in c["prereqs"]:
        for p in g:
            assert p in known, f"{c['code']} needs {p} which is not in the demo set"

# Invented degree requirements. Courses in neither list count as "none".
core3 = ["COSC 1046", "COSC 1047", "MATH 1056", "COSC 2006", "COSC 2007", "COSC 2406", "COSC 2307", "MATH 2056"]
req3 = core3 + ["COSC 3106"]
req4 = req3 + ["COSC 3127", "COSC 3407", "COSC 3506", "COSC 4086", "COSC 4106"]
not_counted = {"COSC 1701", "MATH 1036"}

def electives(program_years, required):
    return [c["code"] for c in courses
            if int(c["code"].split()[1][0]) <= program_years
            and c["code"] not in required and c["code"] not in not_counted]

programs = [
    {"id": "cs-3yr-demo", "name": "Computer Science, 3-year (demo requirements)", "years": 3,
     "required": req3, "electives": electives(3, req3)},
    {"id": "cs-4yr-demo", "name": "Computer Science, 4-year honours (demo requirements)", "years": 4,
     "required": req4, "electives": electives(4, req4)},
]

json.dump(courses, open("data/courses.json", "w", encoding="utf-8"), indent=1)
json.dump(programs, open("data/programs.json", "w", encoding="utf-8"), indent=1)
print(len(courses), "courses,", len(programs), "programs")
