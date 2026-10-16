// Runs before the page paints so a saved dark/light choice doesn't flash. No dependencies.
(function () {
  try {
    var saved = localStorage.getItem("cp2.theme");
    if (saved === "dark" || saved === "light") document.documentElement.setAttribute("data-theme", saved);
  } catch (e) { /* storage blocked: fall back to the system setting */ }
})();
