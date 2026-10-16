"use strict";
// Course Planner 2.0 presentation: arrow keys, buttons and clicks move between slides; #3 opens slide 3.
(function () {
  const stage = document.getElementById("stage");
  const slides = [...stage.querySelectorAll(".slide")];
  const counter = document.getElementById("counter");
  const live = document.getElementById("live");
  let index = 0;

  // Scale the 1280 x 720 canvas to fit the window and centre it.
  function fit() {
    const room = document.getElementById("viewport").getBoundingClientRect();
    const scale = Math.min(room.width / 1280, room.height / 720);
    stage.style.transform = `scale(${scale})`;
    stage.style.left = `${(room.width - 1280 * scale) / 2}px`;
    stage.style.top = `${(room.height - 720 * scale) / 2}px`;
  }

  function show(n, announce = true) {
    index = Math.max(0, Math.min(slides.length - 1, n));
    slides.forEach((slide, i) => { slide.hidden = i !== index; });
    counter.textContent = `${index + 1} / ${slides.length}`;
    history.replaceState(null, "", "#" + (index + 1));
    if (announce) live.textContent = slides[index].getAttribute("aria-label");
  }

  document.getElementById("prev").addEventListener("click", () => show(index - 1));
  document.getElementById("next").addEventListener("click", () => show(index + 1));
  document.addEventListener("keydown", (e) => {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    if (["ArrowRight", "PageDown", " ", "Enter"].includes(e.key) && !/^(A|BUTTON)$/.test(e.target.tagName)) { e.preventDefault(); show(index + 1); }
    else if (["ArrowLeft", "PageUp", "Backspace"].includes(e.key)) { e.preventDefault(); show(index - 1); }
    else if (e.key === "Home") { e.preventDefault(); show(0); }
    else if (e.key === "End") { e.preventDefault(); show(slides.length - 1); }
  });
  // Click the right two thirds of a slide to advance, the left third to go back.
  stage.addEventListener("click", (e) => {
    const box = stage.getBoundingClientRect();
    show(e.clientX - box.left < box.width / 3 ? index - 1 : index + 1);
  });
  window.addEventListener("resize", fit);
  window.addEventListener("hashchange", () => show((parseInt(location.hash.slice(1), 10) || 1) - 1));

  fit();
  show((parseInt(location.hash.slice(1), 10) || 1) - 1, false);
})();
