// Apply stored theme before first paint, then wire the masthead toggle.
(function () {
  const root = document.documentElement;
  const stored = localStorage.getItem("theme");
  if (stored === "dark" || stored === "light") root.setAttribute("data-theme", stored);
})();

function effectiveDark() {
  const t = document.documentElement.getAttribute("data-theme");
  if (t === "dark") return true;
  if (t === "light") return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function updateToggle() {
  const btn = document.getElementById("theme-toggle");
  if (btn) btn.setAttribute("aria-pressed", String(effectiveDark()));
}

function setTheme(mode) {
  document.documentElement.setAttribute("data-theme", mode);
  localStorage.setItem("theme", mode);
  updateToggle();
  window.dispatchEvent(new Event("themechange"));
}

document.addEventListener("DOMContentLoaded", () => {
  updateToggle();
  document.getElementById("theme-toggle")?.addEventListener("click", () => {
    setTheme(effectiveDark() ? "light" : "dark");
  });
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
    if (!localStorage.getItem("theme")) {
      updateToggle();
      window.dispatchEvent(new Event("themechange"));
    }
  });
});
