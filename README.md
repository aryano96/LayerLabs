# Course Planner 2.0 (ThunderHacks 2026)

A prerequisite- and degree-aware course planner for Algoma University CS students.
Work in progress. Placeholder course data only until the team enters real data.

Run locally: `python -m http.server` then open http://localhost:8000

## Tests
Logic: open `tests.html` through the local server, or run `node tests.js`.

## Data
`data/courses.json` and `data/programs.json` are generated: real course and degree information from Algoma's 2026-2027 academic calendar, with invented section times (the public site has no timetable). See `data/raw/parse-calendar.py` and `data/raw/make-demo-data.py`. To use real sections, replace the `sections` entries in `courses.json`.

## Security
The page ships with a strict Content-Security-Policy, uses no inline scripts, and validates the URL, saved data and data files before use. Nothing is sent to a server; plans live in the share link and in this browser's storage.
