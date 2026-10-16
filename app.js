// Course Planner 2.0 - screens, state and navigation.
// The rules (eligibility, clashes, schedules) live in logic.js.

const L = window.CourseLogic;
const SCREENS = ["passed", "options", "schedules"];
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri"];
const MAX_PICKS = 5;
const V1_WAIT = "2-3 business days (Algoma support page: emailing an advisor)";

// Everything the app remembers lives here.
const state = {
  courses: [],
  passed: new Set(),     // codes the student has passed
  picked: [],            // codes the student wants this term
  filters: { noBefore: null, fridaysOff: false },
  scheduleIndex: 0,      // which schedule is showing on screen 3
  startTime: null,       // when the student first interacted (for the demo timer)
  elapsed: null,         // seconds from start to first schedule
};

// ---------- small helpers ----------

// Build an element: el("button", {class: "x", onclick: fn}, "text or child")
function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (key.startsWith("on")) node.addEventListener(key.slice(2), value);
    else if (value === true) node.setAttribute(key, "");
    else if (value !== false && value != null) node.setAttribute(key, value);
  }
  for (const child of children.flat()) {
    node.append(child instanceof Node ? child : document.createTextNode(child));
  }
  return node;
}

// Tell screen readers something (also visible at the top of the page).
function announce(message) {
  document.getElementById("status").textContent = message;
}

const byCode = (code) => state.courses.find((c) => c.code === code);

const TAGS = {
  required: "Required",
  elective: "Elective",
  none: "Doesn't count toward degree",
};

function tagFor(course) {
  return el("span", { class: "tag tag-" + course.counts_as }, TAGS[course.counts_as]);
}

// "COSC 1000" -> year 1 (first digit of the course number)
function yearOf(course) {
  const digit = course.code.match(/\d/);
  return digit ? Number(digit[0]) : 0;
}

function describeSection(section) {
  return section.meetings.map((m) => `${m.day} ${m.start}-${m.end}`).join(", ");
}

// Turn a missing prereq group into words: ["MATH 1000","MATH 1001"] -> "one of MATH 1000 / MATH 1001"
function describeGroup(group) {
  return group.length === 1 ? group[0] : "one of " + group.join(" / ");
}

function formatElapsed(seconds) {
  const m = Math.floor(seconds / 60);
  const s = String(Math.round(seconds % 60)).padStart(2, "0");
  return `${m}:${s}`;
}

// ---------- state <-> URL (this is the shareable link) ----------

function saveToHash(screen) {
  const params = new URLSearchParams();
  params.set("p", [...state.passed].join(","));
  params.set("k", state.picked.join(","));
  const hash = "#" + screen + "?" + params.toString();
  history.replaceState(null, "", hash);
}

// Reads "#options?p=A,B&k=C" into { screen, passed, picked }
function parseHash() {
  const raw = location.hash.replace(/^#/, "");
  const [screenPart, query = ""] = raw.split("?");
  const params = new URLSearchParams(query);
  const clean = (text) => (text || "").split(",").filter((code) => byCode(code));
  return {
    screen: SCREENS.includes(screenPart) ? screenPart : "passed",
    passed: clean(params.get("p")),
    picked: clean(params.get("k")),
  };
}

// Move to a screen (adds a history entry so the Back button works).
function go(screen) {
  const params = new URLSearchParams();
  params.set("p", [...state.passed].join(","));
  params.set("k", state.picked.join(","));
  location.hash = screen + "?" + params.toString();
}

// Show the screen named in the URL and draw it.
function route() {
  const parsed = parseHash();
  state.passed = new Set(parsed.passed);
  // Ignore picks the student isn't eligible for (e.g. an edited share link).
  state.picked = parsed.picked.filter((code) => {
    const course = byCode(code);
    return !state.passed.has(code) && L.isEligible(course, state.passed);
  });

  let screen = parsed.screen;
  // A schedules link with nothing picked makes no sense: send them back.
  if (screen === "schedules" && state.picked.length === 0) screen = "options";

  for (const name of SCREENS) {
    document.getElementById("screen-" + name).hidden = name !== screen;
    const step = document.getElementById("step-" + name);
    step.classList.toggle("current", name === screen);
    if (name === screen) step.setAttribute("aria-current", "step");
    else step.removeAttribute("aria-current");
  }
  if (screen === "passed") renderPassed();
  if (screen === "options") renderOptions();
  if (screen === "schedules") renderSchedules();
  document.getElementById("main").focus();
  window.scrollTo(0, 0);
}

// ---------- screen 1: what have you passed? ----------

function renderPassed() {
  const root = document.getElementById("screen-passed");
  root.replaceChildren(
    el("h2", {}, "What have you passed?"),
    el("p", {}, "Tick every course you have already completed. If you haven't taken any yet, just continue.")
  );

  const years = [...new Set(state.courses.map(yearOf))].sort();
  for (const year of years) {
    const group = el("fieldset", {}, el("legend", {}, "Year " + year));
    for (const course of state.courses.filter((c) => yearOf(c) === year)) {
      const id = "passed-" + course.code.replace(/\s/g, "");
      group.append(
        el("div", { class: "check-row" },
          el("input", {
            type: "checkbox", id, checked: state.passed.has(course.code),
            onchange: (e) => {
              if (!state.startTime) state.startTime = Date.now(); // demo timer starts
              if (e.target.checked) state.passed.add(course.code);
              else state.passed.delete(course.code);
              saveToHash("passed");
            },
          }),
          el("label", { for: id }, `${course.code} ${course.title}`))
      );
    }
    root.append(group);
  }

  root.append(el("button", {
    class: "primary",
    onclick: () => { if (!state.startTime) state.startTime = Date.now(); go("options"); },
  }, "Continue: see what I can take"));
}

// ---------- screen 2: what can you take? ----------

function renderOptions() {
  const root = document.getElementById("screen-options");
  const eligible = state.courses.filter((c) => !state.passed.has(c.code) && L.isEligible(c, state.passed));
  const blocked = state.courses.filter((c) => !state.passed.has(c.code) && !L.isEligible(c, state.passed));
  // Drop picks that are no longer eligible (e.g. the passed list changed).
  state.picked = state.picked.filter((code) => eligible.some((c) => c.code === code));

  const required = state.courses.filter((c) => c.counts_as === "required");
  const requiredDone = required.filter((c) => state.passed.has(c.code)).length;

  root.replaceChildren(
    el("h2", {}, "What can you take?"),
    el("div", { class: "progress-box" },
      el("label", { for: "degree-progress" },
        `Degree progress: ${requiredDone} of ${required.length} required courses passed`),
      el("progress", { id: "degree-progress", max: required.length || 1, value: requiredDone },
        `${requiredDone} of ${required.length}`)),
    el("h3", {}, "You can take these (pick 1 to " + MAX_PICKS + ")")
  );

  if (eligible.length === 0) root.append(el("p", {}, "No courses available with your current passed list."));

  const list = el("ul", { class: "course-list" });
  for (const course of eligible) {
    const id = "pick-" + course.code.replace(/\s/g, "");
    const isPicked = state.picked.includes(course.code);
    list.append(el("li", {},
      el("input", {
        type: "checkbox", id, checked: isPicked,
        disabled: !isPicked && state.picked.length >= MAX_PICKS,
        onchange: (e) => {
          if (e.target.checked) state.picked.push(course.code);
          else state.picked = state.picked.filter((c) => c !== course.code);
          saveToHash("options");
          renderOptions();
          document.getElementById(id).focus();
        },
      }),
      el("label", { for: id }, `${course.code} ${course.title} `, tagFor(course))));
  }
  root.append(list);

  const count = state.picked.length;
  const message = count === 0 ? "Pick at least one course to continue."
    : count >= MAX_PICKS ? `You picked ${count}, the maximum.` : `You picked ${count}.`;
  root.append(el("p", { class: "pick-count" }, message));
  announce(message);

  // Why can't I take this? One reason per blocked course.
  if (blocked.length) {
    const reasons = el("ul", { class: "course-list blocked" });
    for (const course of blocked) {
      const missing = L.missingPrereqs(course, state.passed).map(describeGroup).join(" AND ");
      reasons.append(el("li", {}, el("strong", {}, `${course.code} ${course.title} `), tagFor(course),
        el("div", { class: "reason" }, "Needs: " + missing)));
    }
    root.append(el("h3", {}, "Not yet (missing prerequisites)"), reasons);
  }

  root.append(el("div", { class: "button-row" },
    el("button", { onclick: () => go("passed") }, "Back"),
    el("button", { class: "primary", disabled: count === 0, onclick: () => go("schedules") }, "See my schedules")));
}

// ---------- screen 3: schedules ----------

function renderSchedules() {
  const root = document.getElementById("screen-schedules");
  const picked = state.picked.map(byCode);
  const all = L.buildSchedules(picked);
  const shown = L.filterSchedules(all, state.filters);
  if (state.scheduleIndex >= shown.length) state.scheduleIndex = 0;

  // Stop the demo timer the first time results appear.
  if (state.elapsed === null && state.startTime) {
    state.elapsed = (Date.now() - state.startTime) / 1000;
  }

  root.replaceChildren(el("h2", {}, "Your schedules"));

  root.append(el("fieldset", { class: "filters" },
    el("legend", {}, "Filters"),
    filterBox("filter-early", "No classes before 10 AM", state.filters.noBefore === "10:00", (on) => {
      state.filters.noBefore = on ? "10:00" : null;
    }),
    filterBox("filter-fri", "Fridays off", state.filters.fridaysOff, (on) => {
      state.filters.fridaysOff = on;
    })));

  if (shown.length === 0) {
    root.append(emptyMessage(picked, all.length));
  } else {
    const sched = shown[state.scheduleIndex];
    const status = `Schedule ${state.scheduleIndex + 1} of ${shown.length}`;
    announce(status);
    root.append(
      el("div", { class: "button-row" },
        el("button", { disabled: shown.length < 2, onclick: () => stepSchedule(-1, shown.length) }, "Previous"),
        el("strong", {}, status),
        el("button", { disabled: shown.length < 2, onclick: () => stepSchedule(1, shown.length) }, "Next")),
      weeklyGrid(sched),
      scheduleList(sched),
      comparisonPanel(),
      el("div", { class: "button-row" },
        el("button", { onclick: () => go("options") }, "Back"),
        el("button", { class: "primary", onclick: () => printSummary(sched) }, "Bring to advisor (print)"),
        el("button", { onclick: copyLink }, "Copy share link")));
  }
  if (shown.length === 0) {
    root.append(el("div", { class: "button-row" }, el("button", { onclick: () => go("options") }, "Back")));
  }
}

function filterBox(id, label, checked, onChange) {
  return el("div", { class: "check-row" },
    el("input", { type: "checkbox", id, checked, onchange: (e) => { onChange(e.target.checked); state.scheduleIndex = 0; renderSchedules(); document.getElementById(id).focus(); } }),
    el("label", { for: id }, label));
}

function stepSchedule(delta, total) {
  state.scheduleIndex = (state.scheduleIndex + delta + total) % total;
  renderSchedules();
}

// Explain an empty result instead of showing a blank page.
function emptyMessage(picked, totalBeforeFilters) {
  if (totalBeforeFilters > 0) {
    announce("No schedules match your filters.");
    return el("p", { class: "notice" }, "No schedules match your filters. Try turning one off.");
  }
  const clashes = L.findClashes(picked);
  const text = clashes.length
    ? "These courses always clash: " + clashes.join(", ") + ". Go back and swap one."
    : "No conflict-free combination exists for these courses. Go back and swap one.";
  announce(text);
  return el("p", { class: "notice" }, text);
}

// Weekly grid: a column per day, a row per 30 minutes. Hidden from screen readers
// because the list below says the same thing in plain text.
function weeklyGrid(sched) {
  const meetings = sched.flatMap((p) => p.section.meetings);
  const startMin = Math.floor(Math.min(...meetings.map((m) => L.toMinutes(m.start))) / 60) * 60;
  const endMin = Math.ceil(Math.max(...meetings.map((m) => L.toMinutes(m.end))) / 60) * 60;
  const rows = (endMin - startMin) / 30;

  const grid = el("div", { class: "grid", "aria-hidden": "true", style: `grid-template-rows: auto repeat(${rows}, 1.6rem)` });
  DAYS.forEach((d, i) => grid.append(el("div", { class: "grid-head", style: `grid-column:${i + 2};grid-row:1` }, d)));
  for (let r = 0; r < rows; r += 2) {
    const mins = startMin + r * 30;
    const label = String(Math.floor(mins / 60)).padStart(2, "0") + ":00";
    grid.append(el("div", { class: "grid-time", style: `grid-column:1;grid-row:${r + 2}/span 2` }, label));
  }
  sched.forEach((p, idx) => {
    for (const m of p.section.meetings) {
      const row = (L.toMinutes(m.start) - startMin) / 30 + 2;
      const span = (L.toMinutes(m.end) - L.toMinutes(m.start)) / 30;
      const col = DAYS.indexOf(m.day) + 2;
      grid.append(el("div", {
        class: "block color-" + (idx % 5),
        style: `grid-column:${col};grid-row:${row}/span ${span}`,
      }, `${p.course.code} (${p.section.id})`));
    }
  });
  return el("div", { class: "grid-wrap" }, grid);
}

// The same schedule as plain text.
function scheduleList(sched) {
  const list = el("ul", { class: "schedule-list", "aria-label": "Schedule as a list" });
  for (const p of sched) {
    list.append(el("li", {}, el("strong", {}, `${p.course.code} section ${p.section.id}: `), describeSection(p.section)));
  }
  return list;
}

// Before / after, shown with the real timer once results exist.
function comparisonPanel() {
  const after = state.elapsed !== null
    ? `${formatElapsed(state.elapsed)} (from your first click to this plan)`
    : "Your plan is ready now";
  return el("div", { class: "compare" },
    el("div", { class: "compare-col before" }, el("h3", {}, "Version 1.0"), el("p", {}, V1_WAIT)),
    el("div", { class: "compare-col after" }, el("h3", {}, "Version 2.0"), el("p", {}, after)));
}

// ---------- share and print ----------

function copyLink() {
  saveToHash("schedules");
  const url = location.href;
  const done = () => announce("Link copied. Anyone who opens it sees your plan.");
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(url).then(done, () => window.prompt("Copy this link:", url));
  } else {
    window.prompt("Copy this link:", url);
  }
}

// Fill the hidden print area, then open the print dialog.
function printSummary(sched) {
  const required = state.courses.filter((c) => c.counts_as === "required");
  const requiredDone = required.filter((c) => state.passed.has(c.code)).length;
  const passedList = [...state.passed].map((code) => el("li", {}, `${code} ${byCode(code).title}`));
  const root = document.getElementById("print-summary");
  root.replaceChildren(
    el("h1", {}, "Course plan: bring to advisor"),
    el("p", {}, `Degree progress: ${requiredDone} of ${required.length} required courses passed.`),
    el("h2", {}, "Courses passed"),
    passedList.length ? el("ul", {}, passedList) : el("p", {}, "None yet."),
    el("h2", {}, "Planned courses this term"),
    el("ul", {}, sched.map((p) => el("li", {},
      `${p.course.code} ${p.course.title} (${TAGS[p.course.counts_as]}), section ${p.section.id}: ${describeSection(p.section)}`))),
    el("p", {}, "Generated by Course Planner 2.0. Please confirm with your academic advisor before registering."));
  window.print();
}

// ---------- start ----------

async function start() {
  try {
    const response = await fetch("data/courses.json");
    if (!response.ok) throw new Error("HTTP " + response.status);
    state.courses = await response.json();
  } catch (error) {
    document.getElementById("loading").textContent =
      "Could not load the course data (" + error.message + "). " +
      "If you opened this file directly, run 'python -m http.server' in the project folder and open http://localhost:8000 instead.";
    return;
  }
  document.getElementById("loading").hidden = true;
  window.addEventListener("hashchange", route);
  route();
}

start();
