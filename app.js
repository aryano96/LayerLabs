"use strict";
// Course Planner 2.0 - screens, state and navigation.
// The rules (eligibility, clashes, schedules, credits) live in logic.js.
// Safety notes: we never use innerHTML (all text goes through textContent), the URL and saved data
// are checked against our own course list before use, and the page's Content-Security-Policy
// blocks inline scripts and third-party code.

const L = window.CourseLogic;
const VERSION = "14";
const SCREENS = ["degree", "passed", "options", "schedules"];
const PAGES = [...SCREENS, "why"];   // "why" is the Before & after page, outside the step rail
const SUPPORT_URL = "https://algomauniversity.freshservice.com/support/solutions/articles/17000006724-for-course-registration-issue";
const CALENDAR_URL = "https://algomau.ca/academics/home-of-the-registrar/academic-calendar-2026-2027/";
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri"];
const MAX_PICKS = 5;
const GRID_STEP = 5; // minutes per timetable row
const KEY_SESSION = "cp2.session";
const KEY_THEME = "cp2.theme";
const KEY_NOTE = "cp2.noteHidden";
const TAGS = { required: "Required", elective: "Elective", none: "Doesn't count toward degree" };
const STEPS = [
  { id: "degree", title: "Degree" },
  { id: "passed", title: "Passed" },
  { id: "options", title: "Choose" },
  { id: "schedules", title: "Schedule" },
];

// Everything the app remembers lives here.
const state = {
  courses: [],
  byCode: new Map(),
  programs: [],
  programId: null,
  passed: new Set(),       // codes the student has passed
  picked: [],              // codes the student wants this term
  filters: { noBefore: null, noAfter: null, daysOff: [] },
  daysOpen: false,         // is the Days off dropdown open?
  scheduleIndex: 0,
  startTime: null,         // set at the first choice, drives the plan clock
  elapsed: null,           // seconds until the first timetable appeared
  queries: { degree: "", passed: "", options: "" },
  questions: "",           // typed questions for the advisor (printed on the sheet)
  tag: "all",
  openYears: new Set([1, 2]),
  pickOpen: null,          // which year groups are open on the Choose screen (null = all)
  screen: "degree",
  cameFrom: null,          // screen to return to from the Before & after page
  evidence: [],            // real student interviews, from data/evidence.json
};

// ---------- small helpers ----------

const store = {
  get(key) { try { return localStorage.getItem(key); } catch { return null; } },
  set(key, value) { try { localStorage.setItem(key, value); } catch { /* storage blocked: fine */ } },
  remove(key) { try { localStorage.removeItem(key); } catch { /* ignore */ } },
};

// Build an element: el("button", {class: "x", onclick: fn}, "text or child")
function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value == null || value === false) continue;
    if (key.startsWith("on")) node.addEventListener(key.slice(2), value);
    else if (key === "style") Object.assign(node.style, value); // CSSOM: allowed by our CSP
    else if (key === "class") node.className = value;
    else if (value === true) node.setAttribute(key, "");
    else node.setAttribute(key, String(value));
  }
  for (const child of children.flat()) {
    if (child == null || child === false) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

const $ = (id) => document.getElementById(id);

// Inline SVG icons (no emoji, no icon font).
const SVG_NS = "http://www.w3.org/2000/svg";
const ICONS = {
  check: ["M20 6 9 17l-5-5"],
  search: [["circle", { cx: 11, cy: 11, r: 8 }], "m21 21-4.3-4.3"],
  printer: ["M6 9V2h12v7", "M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2", "M6 14h12v8H6z"],
  link: ["M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71", "M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"],
  restart: ["M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8", "M3 3v5h5"],
  sun: [["circle", { cx: 12, cy: 12, r: 4 }], "M12 2v2", "M12 20v2", "m4.93 4.93 1.41 1.41", "m17.66 17.66 1.41 1.41", "M2 12h2", "M20 12h2", "m6.34 17.66-1.41 1.41", "m19.07 4.93-1.41 1.41"],
  moon: ["M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"],
  info: [["circle", { cx: 12, cy: 12, r: 10 }], "M12 16v-4", "M12 8h.01"],
  alert: ["m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3", "M12 9v4", "M12 17h.01"],
  x: ["M18 6 6 18", "m6 6 12 12"],
  right: ["m9 18 6-6-6-6"],
  left: ["m15 18-6-6 6-6"],
  copy: [["rect", { x: 9, y: 9, width: 13, height: 13, rx: 2 }], "M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"],
  compare: ["M8 3 4 7l4 4", "M4 7h16", "m16 21 4-4-4-4", "M20 17H4"],
  lock: [["rect", { x: 3, y: 11, width: 18, height: 11, rx: 2 }], "M7 11V7a5 5 0 0 1 10 0v4"],
};

function icon(name, cls = "") {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "2");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.setAttribute("class", "icon " + cls);
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  for (const part of ICONS[name]) {
    const isPath = typeof part === "string";
    const node = document.createElementNS(SVG_NS, isPath ? "path" : part[0]);
    if (isPath) node.setAttribute("d", part);
    else for (const [k, v] of Object.entries(part[1])) node.setAttribute(k, v);
    svg.append(node);
  }
  return svg;
}

// Spoken update for screen readers.
function announce(message) { $("status").textContent = message; }

// Short visible confirmation. Optional action button, e.g. { label: "Undo", run: fn }.
function toast(message, action) {
  const box = $("toasts");
  const node = el("div", { class: "toast" }, el("span", {}, message));
  const close = () => {
    node.classList.add("out");
    setTimeout(() => node.remove(), 220);
  };
  if (action) node.append(el("button", { type: "button", onclick: () => { close(); action.run(); } }, action.label));
  box.append(node);
  setTimeout(close, action ? 7000 : 3200);
}

const byCode = (code) => state.byCode.get(code);
const currentProgram = () => state.programs.find((p) => p.id === state.programId);
let visibleCache = { id: null, list: [] };
function visibleCourses() {
  const program = currentProgram();
  if (!program) return state.courses;
  if (visibleCache.id !== program.id) visibleCache = { id: program.id, list: L.coursesForProgram(state.courses, program) };
  return visibleCache.list;
}
const countsFor = (course) => L.countsAs(course, currentProgram());
const tagFor = (course) => { const k = countsFor(course); return el("span", { class: "tag tag-" + k }, TAGS[k]); };
// Required first, then Elective, then anything that doesn't count; ties by course code.
const TAG_ORDER = { required: 0, elective: 1, none: 2 };
const sortByTag = (a, b) => TAG_ORDER[countsFor(a)] - TAG_ORDER[countsFor(b)] || a.code.localeCompare(b.code);
const GROUP_TITLES = { required: "Required for your degree", elective: "Electives", none: "Doesn't count toward your degree" };

// Turn sorted courses into list items, with a small heading each time the group changes.
function rowsWithLabels(courses, makeRow) {
  const out = [];
  let last = null;
  for (const course of courses) {
    const kind = countsFor(course);
    if (kind !== last) {
      const n = courses.filter((c) => countsFor(c) === kind).length;
      out.push(el("li", { class: "group-label group-" + kind }, `${GROUP_TITLES[kind]} (${n})`));
      last = kind;
    }
    out.push(makeRow(course));
  }
  return out;
}

const requiredList = () => { const p = currentProgram(); return p ? L.requiredCodes(state.courses, p) : []; };
const creditsOf = (course) => course.credits ?? 3;

function describeGroup(group) { return group.length === 1 ? group[0] : "one of " + group.join(" or "); }
function matches(course, query) {
  const hay = (course.code + " " + course.title).toLowerCase();
  return query.toLowerCase().split(/\s+/).filter(Boolean).every((word) => hay.includes(word));
}
function plural(n, one, many) { return `${n} ${n === 1 ? one : many}`; }

function formatMeetings(meetings) {
  // Group days that share the same time: "Mon, Wed 10:00-11:20; Fri 13:00-14:50"
  const groups = new Map();
  for (const m of meetings) {
    const key = `${m.start}–${m.end}`;
    groups.set(key, (groups.get(key) || []).concat(m.day));
  }
  return [...groups].map(([time, days]) => `${days.join(", ")} ${time}`).join("; ");
}

// ---------- data checks (never trust a file blindly) ----------

function dataIsValid(courses, programs) {
  const timeOk = (t) => typeof t === "string" && /^\d{2}:\d{2}$/.test(t);
  if (!Array.isArray(courses) || !Array.isArray(programs) || courses.length === 0 || programs.length === 0) return false;
  const coursesOk = courses.every((c) =>
    c && typeof c.code === "string" && /^[A-Z]{4} \d{4}[A-Z]?$/.test(c.code) && typeof c.title === "string" &&
    Array.isArray(c.prereqs) && c.prereqs.every((g) => Array.isArray(g) && g.every((x) => typeof x === "string")) &&
    Array.isArray(c.sections) && c.sections.every((s) => typeof s.id === "string" && Array.isArray(s.meetings) &&
      s.meetings.every((m) => DAYS.includes(m.day) && timeOk(m.start) && timeOk(m.end))));
  const programsOk = programs.every((p) =>
    p && typeof p.id === "string" && /^[a-z0-9-]+$/.test(p.id) && typeof p.name === "string" &&
    Number.isInteger(p.years) && p.years >= 1 && p.years <= 6 &&
    Array.isArray(p.required) && Array.isArray(p.electives) && (p.courses === undefined || Array.isArray(p.courses)));
  return coursesOk && programsOk;
}

// ---------- state <-> URL (this is the shareable link) and saved session ----------

function hashParams() {
  const params = new URLSearchParams();
  params.set("d", state.programId || "");
  params.set("p", [...state.passed].join(","));
  params.set("k", state.picked.join(","));
  return params;
}

function saveSession() {
  store.set(KEY_SESSION, JSON.stringify({ d: state.programId, p: [...state.passed], k: state.picked, q: state.questions }));
}

// Update the address bar (no new history entry) and remember the session on this device.
function syncHash(screen) {
  history.replaceState(null, "", "#" + screen + "?" + hashParams().toString());
  saveSession();
  renderChrome();
}

// Reads "#options?d=id&p=A,B&k=C". Anything that is not one of our own courses is ignored.
function parseHash(raw = location.hash) {
  const [screenPart, query = ""] = raw.replace(/^#/, "").split("?");
  const params = new URLSearchParams(query);
  const clean = (text) => (text || "").split(",").filter((code) => state.byCode.has(code));
  return {
    screen: PAGES.includes(screenPart) ? screenPart : "degree",
    program: state.programs.some((p) => p.id === params.get("d")) ? params.get("d") : null,
    passed: clean(params.get("p")),
    picked: clean(params.get("k")),
  };
}

// Move to a screen (adds a history entry so the Back button works).
function go(screen) { location.hash = screen + "?" + hashParams().toString(); }

function startClock() { if (!state.startTime) state.startTime = Date.now(); }

// Drop picks that are no longer allowed (passed list changed, degree changed).
function prunePicks() {
  state.picked = state.picked.filter((code) => {
    const course = byCode(code);
    return course && !state.passed.has(code) && L.isEligible(course, state.passed);
  }).slice(0, MAX_PICKS);
}

// Show the screen named in the URL and draw it.
function route(initial = false) {
  const parsed = parseHash();
  state.programId = parsed.program;
  const inDegree = new Set(visibleCourses().map((c) => c.code));
  state.passed = new Set(parsed.passed.filter((code) => inDegree.has(code)));
  state.picked = parsed.picked.filter((code) => inDegree.has(code));
  prunePicks();

  let screen = parsed.screen;
  if (screen !== "degree" && screen !== "why" && !state.programId) screen = "degree";
  if (screen === "schedules" && state.picked.length === 0) screen = "options";
  if (screen === "why" && state.screen !== "why") state.cameFrom = state.screen;
  state.screen = screen;
  state.daysOpen = false;

  for (const name of PAGES) {
    const section = $("screen-" + name);
    const show = name === screen;
    if (show && section.hidden) {
      section.hidden = false;
      section.style.animation = "none"; void section.offsetWidth; section.style.animation = "";
    } else if (!show) {
      section.hidden = true;
    }
  }
  if (screen === "degree") renderDegree();
  if (screen === "passed") renderPassed();
  if (screen === "options") renderOptions();
  if (screen === "schedules") renderSchedules();
  if (screen === "why") renderWhy();
  renderChrome();
  if (!initial) {
    const heading = $("screen-" + screen).querySelector("h2");
    if (heading) heading.focus({ preventScroll: true });
    window.scrollTo(0, 0);
  }
}

// ---------- chrome: steps rail, summary panel, clock, theme ----------

function renderChrome() {
  renderSteps();
  renderSummary();
  const hasWork = state.programId || state.passed.size || state.picked.length;
  $("restart").disabled = !hasWork;
  tickClock();
}

function renderSteps() {
  const program = currentProgram();
  const hasPicks = state.picked.length > 0;
  const currentIdx = SCREENS.indexOf(state.screen);
  const sub = {
    degree: program ? `${program.code} · ${program.years}-year` : "Choose yours",
    passed: program ? `${state.passed.size} passed · ${L.creditsPassed(visibleCourses(), state.passed)} cr` : "Pick a degree first",
    options: program ? `${state.picked.length} of ${MAX_PICKS} picked` : "Pick a degree first",
    schedules: hasPicks ? "Ready to build" : "Pick courses first",
  };
  const enabled = { degree: true, passed: !!program, options: !!program, schedules: !!program && hasPicks };
  $("steps").replaceChildren(...STEPS.map((step, i) => {
    const done = enabled[step.id] && i < currentIdx;
    return el("button", {
      type: "button", class: "step" + (step.id === state.screen ? " is-current" : "") + (done ? " is-done" : ""),
      disabled: !enabled[step.id], "aria-current": step.id === state.screen ? "step" : null,
      "data-step": step.id, onclick: () => go(step.id),
    },
    el("span", { class: "step-dot" }, done ? icon("check") : String(i + 1)),
    el("span", {}, el("span", { class: "step-title" }, step.title), el("span", { class: "step-sub" }, sub[step.id])));
  }));
}

function meter(label, value, max, green = false) {
  const fill = el("div", { class: "meter-fill" + (green ? " green" : "") });
  requestAnimationFrame(() => { fill.style.transform = `scaleX(${max ? Math.min(1, value / max) : 0})`; });
  return el("div", {},
    el("div", { class: "meter-label" }, el("span", {}, label), el("strong", {}, `${value} of ${max}`)),
    el("div", { class: "meter-bar", role: "progressbar", "aria-label": label, "aria-valuemin": 0, "aria-valuemax": max, "aria-valuenow": value }, fill));
}

function progressMeters() {
  const program = currentProgram();
  const required = requiredList();
  const done = required.filter((code) => state.passed.has(code)).length;
  return [
    meter("Credits earned", L.creditsPassed(visibleCourses(), state.passed), program.totalCredits),
    meter("Required courses passed", done, required.length, true),
  ];
}

function renderSummary() {
  const aside = $("summary");
  const program = currentProgram();
  if (!program || state.screen === "degree" || state.screen === "why") { aside.hidden = true; return; }
  aside.hidden = false;
  const picks = state.picked.map(byCode);
  aside.replaceChildren(
    el("div", {}, el("h2", {}, "Your plan"), el("p", { class: "degree" }, program.name),
      el("p", { class: "code" }, `${program.code} · ${program.years}-year · ${program.totalCredits} credits`)),
    ...progressMeters(),
    el("div", {},
      el("h3", {}, `This term (${picks.length} of ${MAX_PICKS})`),
      picks.length
        ? el("ul", { class: "pick-list" }, picks.map((c) => el("li", {},
          el("span", { class: "pick-text" }, el("b", {}, c.code), c.title),
          el("button", { type: "button", "aria-label": `Remove ${c.code}`, onclick: () => togglePick(c.code, false) }, icon("x")))))
        : el("p", { class: "muted" }, "Nothing picked yet. Choose up to five courses on the next step.")));
}

function tickClock() {
  const clock = $("clock");
  if (state.elapsed !== null) {
    $("clock-time").textContent = formatElapsed(state.elapsed);
    $("clock-label").textContent = "Plan ready in";
    clock.classList.add("is-done");
  } else {
    $("clock-time").textContent = state.startTime ? formatElapsed((Date.now() - state.startTime) / 1000) : "0:00";
    $("clock-label").textContent = "Plan clock";
    clock.classList.remove("is-done");
  }
}

function formatElapsed(seconds) {
  const m = Math.floor(seconds / 60);
  const s = String(Math.floor(seconds % 60)).padStart(2, "0");
  return `${m}:${s}`;
}

function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  const dark = theme === "dark";
  const button = $("theme-toggle");
  button.replaceChildren(icon(dark ? "sun" : "moon", "lg"));
  button.setAttribute("aria-label", dark ? "Switch to light mode" : "Switch to dark mode");
}

function systemTheme() { return window.matchMedia && matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"; }

function restart() {
  const hasWork = state.programId || state.passed.size || state.picked.length;
  if (hasWork && !window.confirm("Start over? This clears your degree, passed courses and picks.")) return;
  state.programId = null; state.passed = new Set(); state.picked = [];
  state.startTime = null; state.elapsed = null; state.scheduleIndex = 0;
  state.filters = { noBefore: null, noAfter: null, daysOff: [] };
  state.queries = { degree: "", passed: "", options: "" }; state.tag = "all"; state.questions = "";
  store.remove(KEY_SESSION);
  history.replaceState(null, "", "#degree?d=&p=&k=");
  route();
  toast("Started over. Choose your degree to begin.");
}

// ---------- shared pieces ----------

function searchBox(id, label, value, onInput) {
  const input = el("input", { id, type: "search", placeholder: label, "aria-label": label, value, autocomplete: "off", spellcheck: "false", maxlength: "60" });
  const clear = el("button", { type: "button", class: "icon-btn small clear", "aria-label": "Clear search", hidden: !value, onclick: () => { input.value = ""; sync(); input.focus(); } }, icon("x"));
  const sync = () => { clear.hidden = !input.value; onInput(input.value); };
  input.addEventListener("input", sync);
  return el("div", { class: "search" }, icon("search"), input, clear);
}

function degreeChip() {
  const program = currentProgram();
  return el("p", { class: "lead" }, el("strong", {}, program.name), " · ",
    el("button", { type: "button", class: "btn quiet", style: { minHeight: "2.25rem", padding: "0 0.6rem" }, onclick: () => go("degree") }, "Change degree"));
}

// ---------- screen 1: your degree ----------

function matchesProgram(program, query) {
  const hay = `${program.name} ${program.code} ${program.area} ${program.years}-year ${program.years} year`.toLowerCase();
  return query.toLowerCase().split(/\s+/).filter(Boolean).every((word) => hay.includes(word));
}

function renderDegree() {
  const root = $("screen-degree");
  const next = el("button", { type: "button", class: "btn primary", disabled: !state.programId, id: "degree-next", onclick: () => go("passed") }, "Continue", icon("right"));
  const list = el("div", { id: "degree-list" });
  const fill = () => fillDegreeList(list, next);
  root.replaceChildren(
    el("div", {}, el("h2", { tabindex: "-1" }, "Choose your degree"),
      el("p", { class: "lead" }, "This decides which courses we show you and which of them count toward your degree. The plan clock starts when you pick one.")),
    el("div", { class: "toolbar" },
      searchBox("degree-search", "Search degrees, e.g. psychology, honours or BCOSC4", state.queries.degree, (q) => { state.queries.degree = q; fill(); })),
    list,
    el("div", { class: "actionbar" }, el("span", { class: "hint" }, "Next: tick the courses you've already passed."), next));
  fill();
}

function fillDegreeList(list, next) {
  const query = state.queries.degree;
  const found = state.programs.filter((p) => matchesProgram(p, query));
  if (found.length === 0) {
    announce("No degrees match your search.");
    list.replaceChildren(el("div", { class: "empty" }, el("strong", {}, "No degrees match that search"),
      "Try a subject like Biology, a level like Honours, or a code like BSC4.BIOL."));
    return;
  }
  if (query) announce(`${plural(found.length, "degree matches", "degrees match")} your search.`);
  const areas = [...new Set(found.map((p) => p.area))];
  list.replaceChildren(
    el("fieldset", { class: "areas", style: { border: "0", padding: "0", margin: "0", minWidth: "0" } },
      el("legend", { class: "sr-only" }, "Degree"),
      areas.map((area) => el("div", { class: "area" },
        el("h3", {}, area),
        el("div", { class: "choice-grid" }, found.filter((p) => p.area === area).map((program) => {
          const id = "degree-" + program.id;
          return el("label", { class: "choice", for: id },
            el("input", {
              type: "radio", name: "degree", id, value: program.id, checked: program.id === state.programId,
              onchange: () => {
                state.programId = program.id;
                startClock();
                const inDegree = new Set(visibleCourses().map((c) => c.code));
                state.passed = new Set([...state.passed].filter((code) => inDegree.has(code)));
                prunePicks();
                syncHash("degree");
                next.disabled = false;
                announce(`${program.name} selected.`);
              },
            }),
            el("span", {}, el("span", { class: "choice-name", style: { display: "block" } }, program.name),
              el("span", { class: "choice-meta" }, el("span", {}, `${program.years}-year`), el("span", {}, `${program.totalCredits} credits`), el("span", {}, program.code))));
        }))))));
}

// ---------- screen 2: what have you passed? ----------

function renderPassed() {
  const root = $("screen-passed");
  const counter = el("span", { class: "counter", id: "passed-counter" });
  const list = el("div", { id: "passed-list" });
  const fill = () => fillPassedList(list, counter);
  root.replaceChildren(
    el("div", {}, el("h2", { tabindex: "-1" }, "What have you passed?"), degreeChip(),
      el("p", { class: "lead" }, "Tick every course you have already completed. Not sure about one? Leave it unticked; you can come back.")),
    el("div", { class: "toolbar" }, searchBox("passed-search", "Search by code or title", state.queries.passed, (q) => { state.queries.passed = q; fill(); }), counter),
    list,
    el("div", { class: "actionbar" },
      el("button", { type: "button", class: "btn", onclick: () => go("degree") }, icon("left"), "Back"),
      el("button", { type: "button", class: "btn primary", onclick: () => go("options") }, "Continue", icon("right"))));
  fill();
}

function updatePassedCounter(counter) {
  const total = visibleCourses().length;
  counter.textContent = `${state.passed.size} of ${total} passed · ${L.creditsPassed(visibleCourses(), state.passed)} credits`;
}

function fillPassedList(list, counter) {
  const query = state.queries.passed;
  const found = visibleCourses().filter((c) => matches(c, query));
  updatePassedCounter(counter);
  if (found.length === 0) {
    list.replaceChildren(el("div", { class: "empty" }, el("strong", {}, "No courses match that search"), "Try a course code like COSC 2006 or a word from the title."));
    return;
  }
  const years = [...new Set(found.map(L.yearOf))].sort();
  list.replaceChildren(...years.map((year) => {
    const inYear = found.filter((c) => L.yearOf(c) === year);
    const count = el("span", { class: "count" });
    const refresh = () => { count.textContent = `${inYear.filter((c) => state.passed.has(c.code)).length} of ${inYear.length} passed`; };
    refresh();
    const details = el("details", { class: "year", open: query || state.openYears.has(year) },
      el("summary", {}, `Year ${year}`, count, el("span", { class: "chev" }, icon("right"))),
      el("ul", { class: "rows" }, rowsWithLabels([...inYear].sort(sortByTag), (course) => {
        const id = "passed-" + course.code.replace(/\s/g, "");
        return el("li", {}, el("label", { class: "row", for: id },
          el("input", {
            type: "checkbox", id, checked: state.passed.has(course.code),
            onchange: (e) => {
              startClock();
              if (e.target.checked) state.passed.add(course.code); else state.passed.delete(course.code);
              prunePicks();
              syncHash("passed");
              refresh();
              updatePassedCounter(counter);
            },
          }),
          el("span", { class: "row-body" },
            el("span", {}, el("span", { class: "row-code" }, course.code), course.title),
            el("span", { class: "row-meta" }, el("span", {}, `${creditsOf(course)} credits`))),
          tagFor(course)));
      })));
    details.addEventListener("toggle", () => { if (!query) { if (details.open) state.openYears.add(year); else state.openYears.delete(year); } });
    return details;
  }));
}

// ---------- screen 3: what can you take? ----------

function togglePick(code, on) {
  if (on && !state.picked.includes(code) && state.picked.length < MAX_PICKS) state.picked.push(code);
  if (!on) state.picked = state.picked.filter((c) => c !== code);
  state.scheduleIndex = 0;
  syncHash(state.screen);
  if (state.screen === "options") renderOptions(code);
  if (state.screen === "schedules" && state.picked.length === 0) go("options");
  else if (state.screen === "schedules") renderSchedules();
  announce(`${plural(state.picked.length, "course", "courses")} picked.`);
}

function renderOptions(focusCode) {
  const root = $("screen-options");
  const open = root.querySelector("details.blocked")?.open ?? false;
  const all = visibleCourses().filter((c) => !state.passed.has(c.code));
  const eligibleAll = all.filter((c) => L.isEligible(c, state.passed)).sort(sortByTag);
  const blockedAll = all.filter((c) => !L.isEligible(c, state.passed));
  const query = state.queries.options;
  const keep = (c) => matches(c, query) && (state.tag === "all" || countsFor(c) === state.tag);
  const eligible = eligibleAll.filter(keep);
  const blocked = blockedAll.filter(keep)
    .sort((a, b) => L.missingPrereqs(a, state.passed).length - L.missingPrereqs(b, state.passed).length || a.code.localeCompare(b.code));
  const full = state.picked.length >= MAX_PICKS;

  const filterCount = (tag) => eligibleAll.filter((c) => matches(c, query) && (tag === "all" || countsFor(c) === tag)).length;
  const segment = (tag, label) => el("button", {
    type: "button", "aria-pressed": String(state.tag === tag),
    onclick: () => { state.tag = tag; renderOptions(); },
  }, `${label} (${filterCount(tag)})`);

  const optionsRow = (course) => {
    const id = "pick-" + course.code.replace(/\s/g, "");
    const isPicked = state.picked.includes(course.code);
    return el("li", {}, el("label", { class: "row", for: id },
      el("input", { type: "checkbox", id, checked: isPicked, disabled: !isPicked && full, onchange: (e) => togglePick(course.code, e.target.checked) }),
      el("span", { class: "row-body" },
        el("span", {}, el("span", { class: "row-code" }, course.code), course.title),
        el("span", { class: "row-meta" }, el("span", {}, `${creditsOf(course)} credits`), el("span", {}, plural(course.sections.length, "section", "sections"))),
        course.note ? el("span", { class: "row-note" }, "Calendar also says: " + course.note) : null),
      tagFor(course)));
  };

  // Same layout as the "Passed" screen: one collapsible group per year, Required first.
  const allYears = [...new Set(eligibleAll.map(L.yearOf))];
  const yearGroups = (items) => [...new Set(items.map(L.yearOf))].sort().map((year) => {
    const inYear = items.filter((c) => L.yearOf(c) === year).sort(sortByTag);
    const nPicked = inYear.filter((c) => state.picked.includes(c.code)).length;
    const isOpen = query ? true : (state.pickOpen ? state.pickOpen.has(year) : true);
    const details = el("details", { class: "year", open: isOpen },
      el("summary", {}, `Year ${year}`,
        el("span", { class: "count" }, `${plural(inYear.length, "course", "courses")} available${nPicked ? ` · ${nPicked} picked` : ""}`),
        el("span", { class: "chev" }, icon("right"))),
      el("ul", { class: "rows" }, rowsWithLabels(inYear, optionsRow)));
    details.addEventListener("toggle", () => {
      if (query) return;
      if (!state.pickOpen) state.pickOpen = new Set(allYears);
      if (details.open) state.pickOpen.add(year); else state.pickOpen.delete(year);
    });
    return details;
  });

  const dots = el("span", { class: "dots", "aria-hidden": "true" }, Array.from({ length: MAX_PICKS }, (_, i) => el("span", { class: i < state.picked.length ? "on" : "" })));
  const ready = state.picked.length > 0;

  root.replaceChildren(
    el("div", {}, el("h2", { tabindex: "-1" }, "What can you take?"), degreeChip(),
      el("p", { class: "lead" }, `${plural(eligibleAll.length, "course", "courses")} you can take right now. Pick up to ${MAX_PICKS} for this term.`)),
    el("div", { class: "panel panel-pad inline-progress", style: { display: "grid", gap: "0.85rem" } }, ...progressMeters()),
    el("div", { class: "toolbar" },
      searchBox("options-search", "Search by code or title", query, (q) => { state.queries.options = q; renderOptions(); document.getElementById("options-search").focus(); }),
      el("div", { class: "segmented", role: "group", "aria-label": "Show" }, segment("all", "All"), segment("required", "Required"), segment("elective", "Elective")),
      el("span", { class: "counter" }, dots, " ", `${state.picked.length} of ${MAX_PICKS} picked`)),
    eligible.length
      ? el("div", {}, yearGroups(eligible))
      : el("div", { class: "empty" }, el("strong", {}, eligibleAll.length ? "Nothing matches your search or filter" : "No courses are available yet"),
        eligibleAll.length ? "Try clearing the search or choosing All." : "Go back and tick the courses you've already passed to unlock more."),
    blockedAll.length ? el("details", { class: "year blocked", open: open || !!query },
      el("summary", {}, "Not available yet", el("span", { class: "count" }, plural(blocked.length, "course needs", "courses need") + " more prerequisites"), el("span", { class: "chev" }, icon("right"))),
      blocked.length ? el("ul", { class: "blocked-list" }, blocked.map((course) => {
        const missing = L.missingPrereqs(course, state.passed);
        return el("li", {},
          el("div", {}, el("span", { class: "row-code" }, course.code), course.title, " ", tagFor(course),
            missing.length === 1 ? el("span", { class: "steps-away" }, "1 step away") : null),
          el("p", { class: "reason" }, icon("lock"), el("span", {}, "Needs " + missing.map(describeGroup).join(", and "))),
          course.note ? el("p", { class: "row-note" }, "Calendar also says: " + course.note) : null);
      })) : el("p", { class: "muted", style: { padding: "0.8rem 1.1rem" } }, "Nothing matches your search.")) : null,
    el("div", { class: "actionbar" },
      el("button", { type: "button", class: "btn", onclick: () => go("passed") }, icon("left"), "Back"),
      el("span", { class: "hint" }, ready ? "Ready when you are." : "Pick at least one course to continue."),
      el("button", { type: "button", class: "btn primary", id: "build", disabled: !ready, onclick: () => go("schedules") }, "Build my schedules", icon("right"))));

  if (focusCode) { const node = document.getElementById("pick-" + focusCode.replace(/\s/g, "")); if (node && !node.disabled) node.focus(); }
}

// ---------- Before & after page (follows the four parts of the ThunderHacks brief) ----------

function whyBlock(num, title, ...children) {
  return el("section", { class: "why-block" },
    el("span", { class: "why-num", "aria-hidden": "true" }, num),
    el("div", {}, el("h3", {}, title), ...children));
}

function extLink(href, text) { return el("a", { href, target: "_blank", rel: "noopener noreferrer" }, text); }

function renderWhy() {
  const root = $("screen-why");
  const hasProgram = !!currentProgram();
  const back = state.cameFrom && state.cameFrom !== "why" ? state.cameFrom : (hasProgram ? "passed" : "degree");
  const example = byCode("COSC 3506");
  const measured = state.elapsed !== null ? formatElapsed(state.elapsed) : null;
  const row = (label, today, now) => el("tr", {}, el("th", { scope: "row" }, label), el("td", {}, today), el("td", {}, now));
  const steps = ["Find your degree's requirements in the calendar PDF.", "Look up each course's prerequisites.", "Work out which of your passed courses count.",
    "Log in to Self-Service to find section times.", "Check for time clashes by eye.", "Email an academic advisor.", "Wait 2–3 business days for a reply.", "Fix what the advisor found and repeat."];

  root.replaceChildren(
    el("div", {}, el("h2", { tabindex: "-1" }, "Before and after"),
      el("p", { class: "lead" }, "What students do today, what is wrong with it, and what this planner changes. Every claim on this page can be checked in the live app.")),

    whyBlock("01", "Version 1.0: planning by hand, then emailing an advisor",
      el("p", {}, el("strong", {}, "Who uses it: "), "Algoma University students choosing courses each term. Algoma's support page tells students who need help with course registration to email an academic advisor ", extLink(SUPPORT_URL, "(Algoma support page)"), "."),
      el("p", {}, el("strong", {}, "What exists today: "), "three separate sources and an inbox. Prerequisites and degree requirements are in the academic calendar, section times are inside student login, and the check itself is done by the student and then by an advisor.")),

    whyBlock("02", "What is broken, specifically",
      el("ul", { class: "why-list" },
        el("li", {}, el("strong", {}, "A wait of days. "), "The support page says course-registration emails get a reply in 2–3 business days."),
        el("li", {}, el("strong", {}, "Three places to cross-check by hand. "), "Prerequisites sit in the calendar's course list, degree requirements in a different chapter, and section times only behind login. We had to read ", extLink(CALENDAR_URL, "the calendar"), " ourselves to build this."),
        el("li", {}, el("strong", {}, "Rules written for people, not checked for them. "),
          example && example.note ? `Real example: COSC 3506 Software Engineering says “${example.note}” The student has to work out which courses that means.`
            : "Prerequisites such as “completion of the second year core program” leave the student to work out which courses are meant."),
        el("li", {}, el("strong", {}, "Clashes are found by eye. "), "Five courses with three sections each have 3⁵ = 243 possible combinations to try by hand."),
        el("li", {}, el("strong", {}, "No conflict-free planner for Algoma "), "that we could find (we are still checking this with students).")),
      state.evidence.length ? el("div", { class: "voices" }, el("h4", {}, "What students told us"),
        state.evidence.map((q) => el("blockquote", {}, el("p", {}, `“${q.quote}”`), el("footer", {}, q.who + (q.date ? `, ${q.date}` : ""))))) : null),

    whyBlock("03", "Version 2.0: a planner that checks the rules for you",
      el("ul", { class: "why-list" },
        el("li", {}, "Pick a degree and tick what you have passed. It knows ", el("strong", {}, `${state.programs.length} degrees and ${state.courses.length} courses`), " from the calendar."),
        el("li", {}, "Only courses whose prerequisites you meet can be picked. The rest sit under “Not available yet” with exactly what is missing, and a “1 step away” hint."),
        el("li", {}, "Every timetable it builds is free of clashes by construction, and you can filter out early mornings, late afternoons and any days."),
        el("li", {}, "A printable sheet with your progress, plan and what is still required, so the advisor confirms a plan instead of building one.")),
      el("div", { class: "actions" }, el("button", { type: "button", class: "btn primary", onclick: () => go(back) }, hasProgram ? "Back to the planner" : "Try the planner", icon("right")))),

    whyBlock("04", "Proof that it is better",
      el("div", { class: "table-wrap" }, el("table", { class: "plan-table why-table" },
        el("caption", { class: "sr-only" }, "Version 1.0 compared with Version 2.0"),
        el("thead", {}, el("tr", {}, ["Measure", "Today (Version 1.0)", "This planner (Version 2.0)"].map((h) => el("th", { scope: "col" }, h)))),
        el("tbody", {},
          row("Time to a valid plan", "2–3 business days for an advisor's reply, after hours of manual work.",
            measured ? el("span", {}, el("strong", { class: "good" }, measured), " on your last run, measured by the plan clock.") : "Minutes. Run the planner and the plan clock records your time here."),
          row("Steps", el("span", {}, el("strong", {}, "8 manual steps"), " in our walkthrough of today's process (listed below)."), el("span", {}, el("strong", { class: "good" }, "4 steps"), ": degree, passed, choose, schedule.")),
          row("Errors", "Mistakes are found by the advisor, days later.", "Courses you are not eligible for cannot be picked, and every timetable is conflict-free. Both are covered by automated tests."),
          row("Who can use it", "Calendar PDFs and a login portal.", "Any device, keyboard only, a text table beside the visual timetable for screen readers, light and dark themes, and a printable sheet.")))),
      el("details", { class: "why-steps" }, el("summary", {}, "The 8 manual steps today"),
        el("ol", {}, steps.map((t) => el("li", {}, t))),
        el("p", { class: "muted" }, "This is the team's walkthrough of the current process. Student interviews will refine it."))),

    el("section", { class: "why-bonus" },
      el("h3", {}, "Beyond the basics"),
      el("div", { class: "why-grid" },
        el("div", {}, el("h4", {}, "Real data"), el("p", {}, "Course codes, titles, credits, prerequisites and degree requirements are from Algoma's 2026–2027 academic calendar. The invented part is the days and start times of sections: the public site has no timetable, so the demo uses made-up days and times, labelled on every screen. Each course’s weekly lecture and lab hours do come from the calendar.")),
        el("div", {}, el("h4", {}, "Accessibility"), el("p", {}, "Built for keyboard and screen-reader use, with a high-legibility typeface, strong contrast, reduced-motion support and a layout that works on a phone.")),
        el("div", {}, el("h4", {}, "A realistic switch"), el("p", {}, "Nothing to install and no account: students open a link. Each term the registrar updates two data files. Advisors accept the printed sheet instead of starting from scratch. A first pilot could be one program.")),
        el("div", {}, el("h4", {}, "Beyond one institution"), el("p", {}, "All rules and courses live in two data files. Another school replaces them and the planner works unchanged.")))));
}

// ---------- screen 4: schedules ----------

function renderSchedules() {
  const root = $("screen-schedules");
  const picked = state.picked.map(byCode);
  const all = L.buildSchedules(picked);
  const shown = L.filterSchedules(all, state.filters);
  if (state.scheduleIndex >= shown.length) state.scheduleIndex = 0;
  if (state.elapsed === null && state.startTime && all.length) state.elapsed = (Date.now() - state.startTime) / 1000;

  const switchBox = (id, label, checked, onChange) => el("label", { class: "switch", for: id },
    el("input", { type: "checkbox", role: "switch", id, checked, onchange: (e) => { onChange(e.target.checked); state.scheduleIndex = 0; renderSchedules(); renderChrome(); document.getElementById(id).focus(); } }),
    label);

  const head = el("div", {},
    el("h2", { tabindex: "-1" }, "Your timetable"),
    el("p", { class: "lead" }, all.length
      ? `${all.length >= 50 ? "50 or more" : all.length} conflict-free ${all.length === 1 ? "combination" : "combinations"} for ${plural(picked.length, "course", "courses")}.${shown.length !== all.length ? ` ${shown.length} match your filters.` : ""}`
      : "We checked every section combination."));
  const filters = el("div", { class: "switches", role: "group", "aria-label": "Filters" },
    switchBox("filter-early", "No classes before 10 AM", state.filters.noBefore === "10:00", (on) => { state.filters.noBefore = on ? "10:00" : null; }),
    switchBox("filter-late", "Done by 5 PM", state.filters.noAfter === "17:00", (on) => { state.filters.noAfter = on ? "17:00" : null; }),
    daysDropdown());

  if (shown.length === 0) {
    root.replaceChildren(head, filters, emptySchedules(picked, all.length),
      el("div", { class: "actionbar" }, el("button", { type: "button", class: "btn", onclick: () => go("options") }, icon("left"), "Change my courses")));
    return;
  }
  const sched = shown[state.scheduleIndex];
  const label = `Schedule ${state.scheduleIndex + 1} of ${shown.length}`;
  announce(label);
  root.replaceChildren(
    head, filters,
    el("div", { class: "toolbar", style: { justifyContent: "space-between" } },
      el("div", { class: "pager" },
        el("button", { type: "button", class: "btn", "aria-label": "Previous schedule", disabled: shown.length < 2, onclick: () => stepSchedule(-1, shown.length) }, icon("left")),
        el("strong", {}, label),
        el("button", { type: "button", class: "btn", "aria-label": "Next schedule", disabled: shown.length < 2, onclick: () => stepSchedule(1, shown.length) }, icon("right"))),
      el("span", { class: "counter" }, shown.length > 1 ? "Tip: use the ← and → keys." : "Only one option fits.")),
    weeklyGrid(sched),
    planTable(sched),
    comparePanel(),
    questionsPanel(),
    el("div", { class: "actionbar flow" },
      el("button", { type: "button", class: "btn", onclick: () => go("options") }, icon("left"), "Back"),
      el("div", { class: "actions" },
        el("button", { type: "button", class: "btn", id: "copy-text", onclick: () => copyPlanText(sched) }, icon("copy"), "Copy as text"),
        el("button", { type: "button", class: "btn", id: "copy-link", onclick: copyLink }, icon("link"), "Copy share link"),
        el("button", { type: "button", class: "btn primary", id: "print", onclick: () => printSummary(sched) }, icon("printer"), "Bring to advisor"))));
}

const DAY_NAMES = { Mon: "Monday", Tue: "Tuesday", Wed: "Wednesday", Thu: "Thursday", Fri: "Friday" };

// "Days off" dropdown: tick any weekdays that must have no classes. Stays open while you tick.
function daysDropdown() {
  const chosen = state.filters.daysOff;
  const reopen = (focusId) => { state.scheduleIndex = 0; state.daysOpen = true; renderSchedules(); renderChrome(); document.getElementById(focusId).focus(); };
  const details = el("details", { class: "dropdown", open: state.daysOpen });
  const summary = el("summary", { class: "dropdown-btn", id: "days-off-btn" },
    "Days off",
    el("span", { class: chosen.length ? "dropdown-count" : "dropdown-hint" }, chosen.length ? chosen.join(", ") : "None"),
    el("span", { class: "chev" }, icon("right")));
  const panel = el("div", { class: "dropdown-panel" },
    el("fieldset", { style: { border: "0", margin: "0", padding: "0", minWidth: "0" } },
      el("legend", {}, "No classes on these days"),
      DAYS.map((day) => {
        const id = "dayoff-" + day;
        return el("label", { class: "day-row", for: id },
          el("input", {
            type: "checkbox", id, checked: chosen.includes(day),
            onchange: (e) => { state.filters.daysOff = DAYS.filter((d) => (d === day ? e.target.checked : state.filters.daysOff.includes(d))); reopen(id); },
          }),
          DAY_NAMES[day]);
      })),
    chosen.length ? el("button", { type: "button", class: "btn quiet", id: "days-off-clear", onclick: () => { state.filters.daysOff = []; reopen("days-off-btn"); } }, "Clear days off") : null);
  details.append(summary, panel);
  details.addEventListener("toggle", () => { state.daysOpen = details.open; });
  return details;
}

function stepSchedule(delta, total) {
  state.scheduleIndex = (state.scheduleIndex + delta + total) % total;
  renderSchedules();
}

// Explain an empty result instead of showing a blank page.
function emptySchedules(picked, totalBeforeFilters) {
  if (totalBeforeFilters > 0) {
    announce("No schedules match your filters.");
    return el("div", { class: "empty" }, el("strong", {}, "No schedule fits all your filters"), "Turn one off to see the options.",
      el("div", { style: { marginTop: "0.75rem" } }, el("button", { type: "button", class: "btn", onclick: () => { state.filters = { noBefore: null, noAfter: null, daysOff: [] }; renderSchedules(); renderChrome(); } }, "Clear filters")));
  }
  const clashes = L.findClashes(picked);
  const text = clashes.length
    ? `These courses always meet at the same time: ${clashes.join(", ")}. Swap one of them.`
    : "No combination of sections avoids a clash for this set of courses. Try swapping one course.";
  announce(text);
  return el("div", { class: "notice" }, icon("alert", "lg"), el("p", {}, text));
}

// Weekly grid: a column per day, a row per 5 minutes (so times like 10:00-11:20 fit).
// Hidden from screen readers because the table below says the same thing in text.
function weeklyGrid(sched) {
  const meetings = sched.flatMap((p) => p.section.meetings);
  const startMin = Math.floor(Math.min(...meetings.map((m) => L.toMinutes(m.start))) / 60) * 60;
  const endMin = Math.ceil(Math.max(...meetings.map((m) => L.toMinutes(m.end))) / 60) * 60;
  const rows = (endMin - startMin) / GRID_STEP;
  const rowOf = (minutes) => Math.round((minutes - startMin) / GRID_STEP) + 2; // row 1 holds the day names
  const grid = el("div", { class: "grid", "aria-hidden": "true", style: { gridTemplateRows: `auto repeat(${rows}, var(--row-h, 0.3rem))` } });
  DAYS.forEach((d, i) => {
    grid.append(el("div", { class: "grid-head", style: { gridColumn: String(i + 2), gridRow: "1" } }, d));
    grid.append(el("div", { class: "day-col", style: { gridColumn: String(i + 2), gridRow: `2 / span ${rows}` } }));
  });
  for (let mins = startMin; mins < endMin; mins += 60) {
    const row = rowOf(mins);
    grid.append(el("div", { class: "grid-time", style: { gridColumn: "1", gridRow: `${row} / span ${60 / GRID_STEP}` } }, String(mins / 60).padStart(2, "0") + ":00"));
    grid.append(el("div", { class: "hour-line", style: { gridColumn: "2 / -1", gridRow: `${row} / span ${60 / GRID_STEP}` } }));
  }
  let n = 0;
  sched.forEach((p, idx) => {
    for (const m of p.section.meetings) {
      const start = L.toMinutes(m.start);
      const span = Math.max(1, Math.round((L.toMinutes(m.end) - start) / GRID_STEP));
      grid.append(el("div", {
        class: "block c" + (idx % 6),
        style: { gridColumn: String(DAYS.indexOf(m.day) + 2), gridRow: `${rowOf(start)} / span ${span}`, animationDelay: `${n++ * 45}ms` },
      }, el("b", {}, p.course.code), el("span", {}, `${p.section.id} · ${m.start}–${m.end}`)));
    }
  });
  return el("div", { class: "grid-wrap" }, grid);
}

// The same schedule as a real table (also what screen readers use).
function planTable(sched) {
  const total = sched.reduce((sum, p) => sum + creditsOf(p.course), 0);
  return el("div", { class: "panel", style: { overflowX: "auto" } },
    el("table", { class: "plan-table" },
      el("caption", { class: "sr-only" }, "Your selected schedule"),
      el("thead", {}, el("tr", {}, ["Course", "Section", "Meets", "Credits"].map((h) => el("th", { scope: "col" }, h)))),
      el("tbody", {}, sched.map((p, idx) => el("tr", {},
        el("th", { scope: "row" }, el("span", { class: "swatch c" + (idx % 6) }), el("strong", {}, p.course.code), " ", p.course.title),
        el("td", {}, p.section.id),
        el("td", {}, formatMeetings(p.section.meetings)),
        el("td", {}, String(creditsOf(p.course))))),
        el("tr", {}, el("td", { colspan: "3", style: { textAlign: "right", fontWeight: "700" } }, "Total credits this term"), el("td", {}, el("strong", {}, String(total)))))));
}

// Optional questions the student wants to ask; they are printed on the "Bring to advisor" sheet.
const MAX_QUESTION_CHARS = 600;
function questionsPanel() {
  const box = el("textarea", {
    id: "advisor-questions", rows: "4", maxlength: String(MAX_QUESTION_CHARS), "aria-describedby": "advisor-questions-hint",
    placeholder: "For example:\nCan I take COSC 3106 before MATH 2056?\nDoes this plan leave room for a minor?",
  });
  box.value = state.questions;
  const count = el("span", { class: "counter", id: "advisor-questions-count" });
  const refresh = () => { count.textContent = `${box.value.length} of ${MAX_QUESTION_CHARS} characters`; };
  box.addEventListener("input", () => { state.questions = box.value.slice(0, MAX_QUESTION_CHARS); saveSession(); refresh(); });
  refresh();
  return el("div", { class: "panel questions" },
    el("label", { for: "advisor-questions" }, el("strong", {}, "Questions for your advisor"), " (optional)"),
    el("p", { class: "muted", id: "advisor-questions-hint" }, "Type one question per line. They are printed on your “Bring to advisor” sheet."),
    box, count);
}

// Before / after, with the real clock once results exist.
function comparePanel() {
  const after = state.elapsed !== null ? formatElapsed(state.elapsed) : "Instant";
  const note = state.elapsed !== null ? "From choosing your degree to this timetable." : "This plan was opened from a saved or shared link.";
  return el("div", { class: "compare" },
    el("div", { class: "compare-col before" },
      el("span", { class: "kicker" }, "Version 1.0: email an advisor"),
      el("span", { class: "big" }, "2–3 business days"),
      el("p", { class: "small" }, "Reply time on Algoma's course registration support page, plus the manual cross-checking.")),
    el("div", { class: "compare-col after" },
      el("span", { class: "kicker" }, "Version 2.0: this planner"),
      el("span", { class: "big" }, after),
      el("p", { class: "small" }, note),
      el("button", { type: "button", class: "btn quiet", style: { marginTop: "0.5rem" }, onclick: () => go("why") }, "See the full before and after", icon("right"))));
}

// ---------- share, copy, print ----------

function copyText(text, okMessage) {
  const done = () => toast(okMessage);
  if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, () => window.prompt("Copy this:", text));
  else window.prompt("Copy this:", text);
}

function copyLink() { saveSession(); history.replaceState(null, "", "#schedules?" + hashParams().toString()); copyText(location.href, "Link copied. It opens this exact plan."); }

function planAsText(sched) {
  const program = currentProgram();
  return [`${program.name} (${program.code})`, "My term plan:",
    ...sched.map((p) => `- ${p.course.code} ${p.course.title}, section ${p.section.id}: ${formatMeetings(p.section.meetings)}`),
    "Please confirm with an academic advisor before registering."].join("\n");
}
function copyPlanText(sched) { copyText(planAsText(sched), "Plan copied as text."); }

// Fill the hidden print area, then open the print dialog.
// The printed sheet is built for an advisor: the plan first, what is left to take, then notes.
function printSummary(sched) {
  const program = currentProgram();
  const required = requiredList();
  const requiredDone = required.filter((code) => state.passed.has(code)).length;
  const planned = new Set(sched.map((p) => p.course.code));
  const passed = [...state.passed].map(byCode).sort(sortByTag);
  const stillNeeded = required.filter((code) => !state.passed.has(code)).map(byCode);
  const termCredits = sched.reduce((sum, p) => sum + creditsOf(p.course), 0);
  const earned = L.creditsPassed(visibleCourses(), state.passed);
  const today = new Date().toLocaleDateString("en-CA", { year: "numeric", month: "long", day: "numeric" });
  const questions = L.parseQuestions(state.questions);

  const stat = (value, label) => el("div", { class: "ps-stat" }, el("strong", {}, value), el("span", {}, label));
  const courseList = (courses, extra) => el("ul", { class: "ps-list" }, courses.map((c) =>
    el("li", {}, el("b", {}, c.code), " ", c.title, extra ? extra(c) : null)));

  const root = $("print-summary");
  root.replaceChildren(
    el("header", { class: "ps-head" },
      el("div", {}, el("h1", {}, "Course plan: bring to advisor"), el("p", { class: "ps-degree" }, `${program.name} (${program.code})`)),
      el("p", { class: "ps-date" }, "Prepared ", today)),
    el("div", { class: "ps-stats" },
      stat(`${earned} of ${program.totalCredits}`, "credits passed"),
      stat(`${requiredDone} of ${required.length}`, "required courses passed"),
      stat(`${sched.length} courses · ${termCredits} credits`, "planned this term")),

    el("h2", {}, "Planned courses this term"),
    el("table", { class: "ps-table" },
      el("thead", {}, el("tr", {}, ["Course", "Counts as", "Section", "Meets", "Credits"].map((h) => el("th", {}, h)))),
      el("tbody", {}, sched.map((p, idx) => el("tr", {},
        el("td", {}, el("span", { class: "swatch c" + (idx % 6) }), el("b", {}, p.course.code), " ", p.course.title),
        el("td", {}, TAGS[countsFor(p.course)]),
        el("td", {}, p.section.id),
        el("td", {}, formatMeetings(p.section.meetings)),
        el("td", {}, String(creditsOf(p.course))))),
        el("tr", { class: "ps-total" }, el("td", { colspan: "4" }, "Total credits this term"), el("td", {}, String(termCredits))))),

    el("h2", {}, "Weekly timetable"),
    el("div", { class: "ps-grid" }, weeklyGrid(sched)),

    el("div", { class: "ps-columns" },
      el("section", {}, el("h2", {}, `Courses passed (${passed.length})`),
        passed.length ? courseList(passed) : el("p", {}, "None yet.")),
      el("section", {}, el("h2", {}, `Required courses still to take (${stillNeeded.length})`),
        stillNeeded.length
          ? courseList(stillNeeded, (c) => planned.has(c.code) ? el("i", {}, " — planned this term") : null)
          : el("p", {}, "All required courses are passed."))),

    el("section", { class: "ps-notes" }, el("h2", {}, "Questions for my advisor"),
      questions.length ? el("ol", { class: "ps-questions" }, questions.map((q) => el("li", {}, q))) : null,
      Array.from({ length: questions.length ? 2 : 4 }, () => el("div", { class: "ps-line" }))),
    el("p", { class: "ps-foot" }, "Generated by Course Planner 2.0 (ThunderHacks 2026 prototype, not an official Algoma University document). Course names, prerequisites and degree requirements follow the 2026-2027 academic calendar in simplified form; section times are demo data. Please confirm everything with an academic advisor before registering."));
  window.print();
}

// ---------- start ----------

async function loadJson(path) {
  const response = await fetch(`${path}?v=${VERSION}`, { credentials: "omit", cache: "no-cache" });
  if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
  return response.json();
}

// Real student quotes (optional). Anything malformed is ignored, and the file may be missing.
async function loadEvidence() {
  try {
    const data = await loadJson("data/evidence.json");
    const list = Array.isArray(data.interviews) ? data.interviews : [];
    return list.filter((q) => q && typeof q.quote === "string" && typeof q.who === "string" && q.quote.length <= 400 && q.who.length <= 80)
      .map((q) => ({ quote: q.quote, who: q.who, date: typeof q.date === "string" ? q.date.slice(0, 20) : "" }));
  } catch { return []; }
}

function initChrome() {
  $("restart").replaceChildren(icon("restart"), el("span", { class: "btn-text" }, "Start over"));
  $("restart").setAttribute("aria-label", "Start over");   // keeps a name when only the icon shows on phones
  $("restart").setAttribute("title", "Start over");
  $("restart").addEventListener("click", restart);
  $("why-link").replaceChildren(icon("compare"), el("span", { class: "btn-text" }, "Before & after"));
  $("why-link").setAttribute("aria-label", "Before and after");
  $("why-link").addEventListener("click", () => go("why"));
  $("demo-icon").replaceChildren(icon("info"));
  $("demo-dismiss").replaceChildren(icon("x"));
  try { if (sessionStorage.getItem(KEY_NOTE)) $("demo-note").hidden = true; } catch { /* ignore */ }
  $("demo-dismiss").addEventListener("click", () => { $("demo-note").hidden = true; try { sessionStorage.setItem(KEY_NOTE, "1"); } catch { /* ignore */ } });
  applyTheme(document.documentElement.getAttribute("data-theme") || systemTheme());
  $("theme-toggle").addEventListener("click", () => {
    const next = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
    applyTheme(next); store.set(KEY_THEME, next);
  });
  setInterval(tickClock, 500);
  document.addEventListener("click", (e) => {
    const open = document.querySelector("details.dropdown[open]");
    if (open && !open.contains(e.target)) open.open = false;
  });
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    const open = document.querySelector("details.dropdown[open]");
    if (open) { open.open = false; open.querySelector("summary").focus(); }
  });
  // Left/Right arrows flip through schedules.
  document.addEventListener("keydown", (e) => {
    if (state.screen !== "schedules" || e.altKey || e.ctrlKey || e.metaKey) return;
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) && e.target.type !== "checkbox") return;
    if (e.target.closest && e.target.closest(".dropdown")) return;
    const shown = L.filterSchedules(L.buildSchedules(state.picked.map(byCode)), state.filters);
    if (shown.length < 2) return;
    if (e.key === "ArrowRight") { e.preventDefault(); stepSchedule(1, shown.length); }
    if (e.key === "ArrowLeft") { e.preventDefault(); stepSchedule(-1, shown.length); }
  });
}

// A saved session is only used when it names a real degree and real courses.
function loadSavedSession() {
  try {
    const saved = JSON.parse(store.get(KEY_SESSION) || "null");
    if (!saved || !state.programs.some((p) => p.id === saved.d)) return null;
    const ok = (list) => Array.isArray(list) ? list.filter((code) => typeof code === "string" && state.byCode.has(code)) : [];
    return { d: saved.d, p: ok(saved.p), k: ok(saved.k), q: typeof saved.q === "string" ? saved.q.slice(0, MAX_QUESTION_CHARS) : "" };
  } catch { return null; }
}

async function start() {
  initChrome();
  try {
    const [courses, programs] = await Promise.all([loadJson("data/courses.json"), loadJson("data/programs.json")]);
    if (!dataIsValid(courses, programs)) throw new Error("the course data file is not in the expected format");
    state.courses = courses; state.programs = programs;
    state.byCode = new Map(courses.map((c) => [c.code, c]));
    state.evidence = await loadEvidence();
  } catch (error) {
    $("loading").textContent = `Could not load the course data (${error.message}). If you opened this file directly, run "python -m http.server" in the project folder and open http://localhost:8000 instead.`;
    return;
  }
  $("loading").hidden = true;

  let welcomeBack = false;
  const saved = loadSavedSession();
  if (saved) state.questions = saved.q;
  if (!location.hash.includes("?")) {
    if (saved && (saved.p.length || saved.k.length)) {
      const params = new URLSearchParams({ d: saved.d, p: saved.p.join(","), k: saved.k.join(",") });
      history.replaceState(null, "", "#" + (saved.k.length ? "options" : "passed") + "?" + params.toString());
      welcomeBack = true;
    }
  }
  window.addEventListener("hashchange", () => route());
  route(true);
  if (welcomeBack) toast("Welcome back. Your last plan was restored from this device.", { label: "Start over", run: restart });
}

start();
