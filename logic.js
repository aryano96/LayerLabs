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

if (typeof module !== "undefined") module.exports = CourseLogic;
else window.CourseLogic = CourseLogic;
