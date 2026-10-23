import { createCarStage } from "./car-stage.js";

// The nav is sticky (see base.css); measure its real height so the hero fills exactly the
// rest of the first viewport, re-checking once the webfont has swapped in.
function syncNavHeight() {
  const nav = document.querySelector(".site-nav");
  if (nav) document.documentElement.style.setProperty("--nav-height", `${nav.offsetHeight}px`);
}
syncNavHeight();
window.addEventListener("resize", syncNavHeight);
document.fonts?.ready?.then(syncNavHeight);

// ---- Rotating hero car -----------------------------------------------------------------------
const heroDataEl = document.getElementById("hero-car-data");
if (heroDataEl) {
  const heroCar = JSON.parse(heroDataEl.textContent);
  // A narrow phone screen needs the car pulled further back so it reads as a background
  // element rather than filling the whole readable area behind the text.
  const isNarrow = window.matchMedia("(max-width: 480px)").matches;
  const stage = createCarStage(document.getElementById("home-hero-stage"), {
    distance: isNarrow ? 4.2 : 2.6,
    interactive: false,
    autoRotateSpeed: 1.1,
    lightBoost: 1.8,
  });
  stage.showStyle(heroCar).then((shown) => {
    if (shown && heroCar.paintMode === "palette") stage.setColor("#3A3B40"); // graphite, a premium hero shade
  });
}

// ---- Reveal sections as they're scrolled into view -------------------------------------------
const revealables = [...document.querySelectorAll(".reveal")];
if (revealables.length) {
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("is-visible");
        observer.unobserve(entry.target);
      });
    },
    { threshold: 0.2, rootMargin: "0px 0px -8% 0px" }
  );
  revealables.forEach((el) => observer.observe(el));
}
