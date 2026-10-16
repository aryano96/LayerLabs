// logic.js - the rules of the planner. No page code in here, so it is easy to test.
// Exposed as window.CourseLogic in the browser and module.exports in Node.

const CourseLogic = {};

// "10:30" -> 630 (minutes since midnight), so times can be compared as numbers.
CourseLogic.toMinutes = function (hhmm) {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};

// Which prerequisite groups still have no passed course? (empty list = eligible)
CourseLogic.missingPrereqs = function (course, passed) {
  return course.prereqs.filter((group) => !group.some((code) => passed.has(code)));
};

// Eligible when every prerequisite group has at least one passed course.
CourseLogic.isEligible = function (course, passed) {
  return CourseLogic.missingPrereqs(course, passed).length === 0;
};

// Two meetings clash if they are on the same day and their times overlap.
// Back-to-back (one ends exactly when the next starts) is NOT a clash.
CourseLogic.overlaps = function (a, b) {
  if (a.day !== b.day) return false;
  const aStart = CourseLogic.toMinutes(a.start);
  const aEnd = CourseLogic.toMinutes(a.end);
  const bStart = CourseLogic.toMinutes(b.start);
  const bEnd = CourseLogic.toMinutes(b.end);
  return aStart < bEnd && bStart < aEnd;
};

// Do two sections have any meeting that clashes?
CourseLogic.sectionsClash = function (s1, s2) {
  return s1.meetings.some((a) => s2.meetings.some((b) => CourseLogic.overlaps(a, b)));
};

// Build every conflict-free timetable for the chosen courses (backtracking):
// pick a section for course 1, then course 2, ... and back up whenever a pick
// clashes with something already chosen. Stops after `limit` results.
// A schedule is a list of { course, section }.
CourseLogic.buildSchedules = function (courses, limit = 50) {
  const results = [];
  const chosen = [];

  function pick(i) {
    if (results.length >= limit) return;
    if (i === courses.length) {
      results.push(chosen.slice());
      return;
    }
    for (const section of courses[i].sections) {
      const clashes = chosen.some((p) => CourseLogic.sectionsClash(p.section, section));
      if (clashes) continue;
      chosen.push({ course: courses[i], section });
      pick(i + 1);
      chosen.pop();
    }
  }

  pick(0);
  return results;
};

// Which pairs of courses can never be taken together (every section combo clashes)?
// Used to explain an empty result, e.g. ["COSC 1000 vs MATH 1000"].
CourseLogic.findClashes = function (courses) {
  const pairs = [];
  for (let i = 0; i < courses.length; i++) {
    for (let j = i + 1; j < courses.length; j++) {
      const always = courses[i].sections.every((s1) =>
        courses[j].sections.every((s2) => CourseLogic.sectionsClash(s1, s2)));
      if (always) pairs.push(courses[i].code + " vs " + courses[j].code);
    }
  }
  return pairs;
};

// Keep only schedules that satisfy the filters:
// noBefore ("10:00" or null) and fridaysOff (true/false).
CourseLogic.filterSchedules = function (schedules, filters) {
  const meetingsOf = (sched) => sched.flatMap((p) => p.section.meetings);
  return schedules.filter((sched) => {
    const meetings = meetingsOf(sched);
    if (filters.noBefore) {
      const limit = CourseLogic.toMinutes(filters.noBefore);
      if (meetings.some((mt) => CourseLogic.toMinutes(mt.start) < limit)) return false;
    }
    if (filters.fridaysOff && meetings.some((mt) => mt.day === "Fri")) return false;
    return true;
  });
};

// ---- degrees ----
// A program looks like { id, name, years, required: [codes], electives: [codes] }.

// "COSC 3000" -> 3 (the first digit of the course number is the year level)
CourseLogic.yearOf = function (course) {
  const digit = course.code.match(/\d/);
  return digit ? Number(digit[0]) : 0;
};

// How does this course count for this degree? "required", "elective" or "none".
// With no degree chosen we fall back to the course's own counts_as.
CourseLogic.countsAs = function (course, program) {
  if (!program) return course.counts_as;
  if (program.required.includes(course.code)) return "required";
  if (program.electives.includes(course.code)) return "elective";
  return "none";
};

// Only the courses a student in this degree could take (a 3-year degree has no year 4).
CourseLogic.coursesForProgram = function (courses, program) {
  return courses.filter((c) => CourseLogic.yearOf(c) <= program.years);
};

// Codes of the degree's required courses that exist in our data.
CourseLogic.requiredCodes = function (courses, program) {
  return CourseLogic.coursesForProgram(courses, program)
    .filter((c) => program.required.includes(c.code))
    .map((c) => c.code);
};

if (typeof module !== "undefined") module.exports = CourseLogic;
else window.CourseLogic = CourseLogic;
