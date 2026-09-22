import { createCarStage } from "./car-stage.js";

const cars = JSON.parse(document.getElementById("showroom-data").textContent);
const list = document.querySelector(".showroom-list");
const entries = [...document.querySelectorAll(".showroom-entry")];
const dots = [...document.querySelectorAll(".showroom-dot")];
const stageEl = document.getElementById("showroom-stage");
const stage = createCarStage(stageEl, { distance: 2 });

const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// The showroom's height is "the rest of the viewport below the nav" (see showroom.css); the
// nav's real height varies slightly by font rendering, so measure it rather than guess.
function syncNavHeight() {
  const nav = document.querySelector(".site-nav");
  if (nav) document.documentElement.style.setProperty("--nav-height", `${nav.offsetHeight}px`);
}
syncNavHeight();
window.addEventListener("resize", syncNavHeight);
// The nav's wordmark uses a webfont; if it swaps in after this first measurement, the nav's
// height can shift by a few pixels and leave a stale gap below the showroom.
document.fonts?.ready?.then(syncNavHeight);

let activeIndex = null;
let stageToken = 0; // lets a fast scroll abandon a mid-flight slide instead of queuing it

// The stage is one shared canvas (there's only ever one 3D scene), so "sliding to the next
// car" is a transform on its container timed around the model swap underneath: slide the
// current car out, swap the model once it's off-screen, then slide the new one in from the
// side it's arriving from.
async function slideStage(car, direction) {
  const token = ++stageToken;
  if (reduceMotion || direction === 0) {
    stage.showStyle(car);
    return;
  }

  stageEl.getAnimations().forEach((animation) => animation.cancel());
  const outX = direction > 0 ? "-6%" : "6%";
  const inX = direction > 0 ? "6%" : "-6%";

  await stageEl.animate(
    [{ transform: "translateX(0)", opacity: 1 }, { transform: `translateX(${outX})`, opacity: 0.35 }],
    { duration: 200, easing: "cubic-bezier(0.4, 0, 1, 1)", fill: "forwards" }
  ).finished.catch(() => {});
  if (token !== stageToken) return; // a newer scroll has already taken over

  await stage.showStyle(car);
  if (token !== stageToken) return;

  stageEl.animate(
    [{ transform: `translateX(${inX})`, opacity: 0.35 }, { transform: "translateX(0)", opacity: 1 }],
    { duration: 320, easing: "cubic-bezier(0.16, 1, 0.3, 1)", fill: "forwards" }
  );
}

function activate(index) {
  if (index === activeIndex) return;
  const direction = activeIndex === null ? 0 : index > activeIndex ? 1 : -1;
  activeIndex = index;

  entries.forEach((entry, i) => entry.classList.toggle("is-active", i === index));
  dots.forEach((dot, i) => dot.classList.toggle("is-active", i === index));
  slideStage(cars[index], direction);
}

// With scroll-snap, the list settles exactly on one entry at rest, so its own scroll
// position is a simpler and more reliable signal than tracking intersections.
let ticking = false;
function onScroll() {
  if (ticking) return;
  ticking = true;
  requestAnimationFrame(() => {
    const index = Math.round(list.scrollTop / list.clientHeight);
    activate(Math.max(0, Math.min(entries.length - 1, index)));
    ticking = false;
  });
}
list.addEventListener("scroll", onScroll, { passive: true });

activate(0);
