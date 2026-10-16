// Tests for logic.js. Runs in the browser (tests.html) and in Node (node tests.js).
// runTests(L, courses, programs, print) -> { passed, failed } and prints PASS/FAIL lines.

function runTests(L, courses, programs, print) {
  let passed = 0;
  let failed = 0;

  // check(name, actual, expected): compares values by JSON text
  function check(name, actual, expected) {
    const ok = JSON.stringify(actual) === JSON.stringify(expected);
    if (ok) passed++; else failed++;
    print((ok ? "PASS " : "FAIL ") + name +
      (ok ? "" : "  (got " + JSON.stringify(actual) + ", wanted " + JSON.stringify(expected) + ")"));
  }

  const byCode = (code) => courses.find((c) => c.code === code);
  const set = (...codes) => new Set(codes);

  // ---- isEligible: AND of OR-groups ----
  const c2000 = byCode("COSC 2000");
  check("2000 not eligible with nothing passed", L.isEligible(c2000, set()), false);
  check("2000 not eligible with only COSC 1000", L.isEligible(c2000, set("COSC 1000")), false);
  check("2000 eligible with 1000 + MATH 1001", L.isEligible(c2000, set("COSC 1000", "MATH 1001")), true);
  check("2000 eligible with 1000 + MATH 1000", L.isEligible(c2000, set("COSC 1000", "MATH 1000")), true);
  check("course with no prereqs is always eligible", L.isEligible(byCode("COSC 1000"), set()), true);

  // ---- missingPrereqs ----
  check("missing group for 2000 after COSC 1000",
    L.missingPrereqs(c2000, set("COSC 1000")), [["MATH 1000", "MATH 1001"]]);
  check("nothing missing when eligible",
    L.missingPrereqs(c2000, set("COSC 1000", "MATH 1000")), []);

  // ---- overlaps ----
  const m = (day, start, end) => ({ day, start, end });
  check("overlap: partial overlap same day", L.overlaps(m("Mon", "10:00", "11:30"), m("Mon", "11:00", "12:00")), true);
  check("overlap: back-to-back is not a clash", L.overlaps(m("Mon", "10:00", "11:30"), m("Mon", "11:30", "13:00")), false);
  check("overlap: different days", L.overlaps(m("Mon", "10:00", "11:30"), m("Tue", "10:00", "11:30")), false);

  // ---- buildSchedules ----
  // Describe a schedule as "COSC 1000A+MATH 1000B" so results are easy to compare.
  const name = (sched) => sched.map((p) => p.course.code + p.section.id).join("+");
  const names = (list) => list.map(name).sort();

  const two = L.buildSchedules([byCode("COSC 1000"), byCode("MATH 1000")]);
  check("1000 + MATH 1000: 3 valid combos, A+A clashes out",
    names(two), ["COSC 1000A+MATH 1000B", "COSC 1000B+MATH 1000A", "COSC 1000B+MATH 1000B"]);

  const back2back = L.buildSchedules([byCode("COSC 2000"), byCode("COSC 2100")]);
  check("back-to-back sections are allowed",
    names(back2back), ["COSC 2000A+COSC 2100A", "COSC 2000B+COSC 2100A"]);

  check("limit caps the number of results",
    L.buildSchedules([byCode("COSC 1000"), byCode("MATH 1000")], 1).length, 1);

  // A forced clash: two single-section courses at the same time.
  const x = { code: "X 1", sections: [{ id: "A", meetings: [m("Mon", "09:00", "10:00")] }] };
  const y = { code: "Y 1", sections: [{ id: "A", meetings: [m("Mon", "09:30", "10:30")] }] };
  check("unavoidable clash gives no schedules", L.buildSchedules([x, y]), []);
  check("findClashes names the clashing pair", L.findClashes([x, y]), ["X 1 vs Y 1"]);
  check("findClashes is empty when a combo exists", L.findClashes([byCode("COSC 1000"), byCode("MATH 1000")]), []);

  // ---- filterSchedules ----
  const none = { noBefore: null, fridaysOff: false };
  check("no filters keeps everything", L.filterSchedules(two, none).length, 3);
  check("noBefore 10:00 drops COSC 1000A (starts 09:00)",
    names(L.filterSchedules(two, { noBefore: "10:00", fridaysOff: false })),
    ["COSC 1000B+MATH 1000A", "COSC 1000B+MATH 1000B"]);
  const withFri = L.buildSchedules([byCode("MATH 1000"), byCode("MATH 1001")]);
  check("fridaysOff drops schedules with a Friday class",
    L.filterSchedules(withFri, { noBefore: null, fridaysOff: true }), []);

  // ---- degrees (programs.json) ----
  const prog = (id) => programs.find((p) => p.id === id);
  const p3 = prog("example-3yr");
  const p4 = prog("example-4yr");
  const c3000 = byCode("COSC 3000");

  check("yearOf reads the first digit", L.yearOf(c3000), 3);
  check("same course is elective in the 3-year degree", L.countsAs(c3000, p3), "elective");
  check("same course is required in the 4-year degree", L.countsAs(c3000, p4), "required");
  check("course not in a degree's lists doesn't count", L.countsAs(byCode("ART 1000"), p3), "none");
  check("without a degree, falls back to counts_as", L.countsAs(c2000, null), "required");
  check("3-year degree hides year 4 courses",
    L.coursesForProgram(courses, p3).map((c) => c.code).includes("COSC 4000"), false);
  check("3-year degree keeps year 3 courses",
    L.coursesForProgram(courses, p3).map((c) => c.code).includes("COSC 3000"), true);
  check("4-year degree includes year 4 courses",
    L.coursesForProgram(courses, p4).map((c) => c.code).includes("COSC 4000"), true);
  check("requiredCodes lists the degree's required courses that exist",
    L.requiredCodes(courses, p3), ["COSC 1000", "MATH 1000", "COSC 2000"]);

  // ---- questions for the advisor (typed by the student, printed on the sheet) ----
  check("one question per line", L.parseQuestions("Can I take COSC 3106 early?\nIs MATH 2056 required?"), ["Can I take COSC 3106 early?", "Is MATH 2056 required?"]);
  check("blank lines and extra spaces are dropped", L.parseQuestions("  First  \n\n   \nSecond\n"), ["First", "Second"]);
  check("typed bullets and numbers are removed (the sheet adds its own numbering)", L.parseQuestions("1. One\n2) Two\n- Three\n* Four\n• Five"), ["One", "Two", "Three", "Four", "Five"]);
  check("empty or missing text gives no questions", [L.parseQuestions(""), L.parseQuestions(null), L.parseQuestions(undefined)], [[], [], []]);
  check("at most 8 questions are kept", L.parseQuestions(Array.from({ length: 12 }, (_, i) => "Q" + i).join("\n")).length, 8);
  check("a very long question is cut to 200 characters", L.parseQuestions("x".repeat(500))[0].length, 200);
  check("angle brackets stay as plain characters (they are shown as text, never as HTML)", L.parseQuestions("<b>hi</b>"), ["<b>hi</b>"]);

  // ---- daysOff filter (any set of weekdays) ----
  const off = (days) => L.filterSchedules(two, { noBefore: null, noAfter: null, fridaysOff: false, daysOff: days });
  check("daysOff Monday keeps only the all-Tue/Thu schedule", names(off(["Mon"])), ["COSC 1000B+MATH 1000B"]);
  check("daysOff Mon and Wed gives the same single schedule", names(off(["Mon", "Wed"])), ["COSC 1000B+MATH 1000B"]);
  check("daysOff Tuesday leaves nothing (every schedule meets Tuesday)", off(["Tue"]).length, 0);
  check("daysOff Friday keeps everything (no Friday classes)", off(["Fri"]).length, 3);
  check("empty or missing daysOff keeps everything", [off([]).length, L.filterSchedules(two, { noBefore: null, fridaysOff: false }).length], [3, 3]);

  // ---- noAfter filter ("evenings off") ----
  const late = { code: "L 1", sections: [{ id: "A", meetings: [m("Mon", "16:00", "17:30")] }, { id: "B", meetings: [m("Mon", "13:00", "14:30")] }] };
  const lateSchedules = L.buildSchedules([late]);
  check("noAfter 17:00 drops a class that ends after 5 PM",
    names(L.filterSchedules(lateSchedules, { noBefore: null, noAfter: "17:00", fridaysOff: false })).length, 1);
  check("noAfter keeps a class that ends exactly at the limit",
    L.filterSchedules(lateSchedules, { noBefore: null, noAfter: "17:30", fridaysOff: false }).length, 2);
  check("missing noAfter filter keeps everything",
    L.filterSchedules(lateSchedules, { noBefore: null, fridaysOff: false }).length, 2);

  // ---- degree-specific course lists and credits ----
  const sample = [
    { code: "AAAA 1000", title: "A", credits: 3, prereqs: [], sections: [] },
    { code: "BBBB 1000", title: "B", credits: 6, prereqs: [], sections: [] },
    { code: "AAAA 4000", title: "C", prereqs: [], sections: [] },
  ];
  const own = { years: 3, courses: ["AAAA 1000", "AAAA 4000"], required: [], electives: [] };
  check("program.courses limits the list to that degree (and its years)",
    L.coursesForProgram(sample, own).map((c) => c.code), ["AAAA 1000"]);
  check("creditsPassed adds credits (missing credits count as 3)",
    L.creditsPassed(sample, new Set(["AAAA 1000", "BBBB 1000", "AAAA 4000"])), 12);
  check("creditsPassed ignores courses not passed", L.creditsPassed(sample, new Set(["BBBB 1000"])), 6);

  return { passed, failed };
}

// Node runner
if (typeof module !== "undefined" && require.main === module) {
  const fs = require("fs");
  const L = require("./logic.js");
  const courses = JSON.parse(fs.readFileSync(__dirname + "/data/test-fixtures/courses.json", "utf8"));
  const programs = JSON.parse(fs.readFileSync(__dirname + "/data/test-fixtures/programs.json", "utf8"));
  const result = runTests(L, courses, programs, console.log);
  console.log(`\n${result.passed} passed, ${result.failed} failed`);
  process.exit(result.failed ? 1 : 0);
}
