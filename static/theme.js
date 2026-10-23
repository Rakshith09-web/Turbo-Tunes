/* Theme switch: keeps <html data-theme> in sync with the nav toggle and remembers
   the visitor's choice. The initial paint is handled by the inline script in
   base.html; this file only handles changes after the page has loaded. */
(function () {
  var STORAGE_KEY = "turbo-theme";
  var root = document.documentElement;
  var toggle = document.getElementById("theme-toggle");
  if (!toggle) return;

  var media = window.matchMedia("(prefers-color-scheme: dark)");

  function stored() {
    try {
      return localStorage.getItem(STORAGE_KEY);
    } catch (error) {
      return null;
    }
  }

  function current() {
    return root.getAttribute("data-theme") === "dark" ? "dark" : "light";
  }

  function sync() {
    var dark = current() === "dark";
    toggle.setAttribute("aria-pressed", dark ? "true" : "false");
    toggle.title = dark ? "Switch to light theme" : "Switch to dark theme";
  }

  function apply(theme, remember) {
    root.setAttribute("data-theme", theme);
    if (remember) {
      try {
        localStorage.setItem(STORAGE_KEY, theme);
      } catch (error) {
        /* Private mode / storage disabled: the switch still works for this page. */
      }
    }
    sync();
  }

  toggle.addEventListener("click", function () {
    apply(current() === "dark" ? "light" : "dark", true);
  });

  // Until the visitor picks a side, follow the operating system live.
  function onSystemChange(event) {
    if (!stored()) apply(event.matches ? "dark" : "light", false);
  }
  if (media.addEventListener) media.addEventListener("change", onSystemChange);
  else if (media.addListener) media.addListener(onSystemChange);

  sync();
})();
