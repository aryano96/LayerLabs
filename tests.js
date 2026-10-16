// Tests for logic.js. Runs in the browser (tests.html) and in Node (node tests.js).
// runTests(L, courses) -> { passed, failed } and prints PASS/FAIL lines.

function runTests(L, courses, print) {
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

  return { passed, failed };
}

// Node runner
if (typeof module !== "undefined" && require.main === module) {
  const fs = require("fs");
  const L = require("./logic.js");
  const courses = JSON.parse(fs.readFileSync(__dirname + "/data/courses.json", "utf8"));
  const result = runTests(L, courses, console.log);
  console.log(`\n${result.passed} passed, ${result.failed} failed`);
  process.exit(result.failed ? 1 : 0);
}
