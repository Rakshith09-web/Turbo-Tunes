import { createCarStage } from "./car-stage.js";

const cars = JSON.parse(document.getElementById("showroom-data").textContent);
const entries = [...document.querySelectorAll(".showroom-entry")];
const dots = [...document.querySelectorAll(".showroom-dot")];
const stageEl = document.getElementById("showroom-stage");
const stage = createCarStage(stageEl, { distance: 2 });

let activeIndex = null;

function activate(index) {
  if (index === activeIndex) return;
  activeIndex = index;

  entries.forEach((entry, i) => entry.classList.toggle("is-active", i === index));
  dots.forEach((dot, i) => dot.classList.toggle("is-active", i === index));
  stage.showStyle(cars[index]);
}

// Whichever entry is closest to the vertical centre of the viewport is "in view". A plain
// intersection ratio favours whichever entry is tallest on screen, which briefly picks the
// wrong car mid-scroll on short viewports; distance-from-centre tracks what the reader is
// actually looking at.
const observer = new IntersectionObserver(
  (observed) => {
    observed.forEach((item) => {
      const index = entries.indexOf(item.target);
      item.target.dataset.visible = item.isIntersecting ? "1" : "0";
    });

    // On a narrow screen the stage is pinned over the top of the text column (see
    // showroom.css), so only the space below it is actually legible; centre against that.
    const stacked = window.matchMedia("(max-width: 720px)").matches;
    const coveredBottom = stacked ? stageEl.getBoundingClientRect().bottom : 0;
    const center = (Math.max(coveredBottom, 0) + window.innerHeight) / 2;
    let closest = null;
    let closestDistance = Infinity;
    entries.forEach((entry, index) => {
      if (entry.dataset.visible !== "1") return;
      const rect = entry.getBoundingClientRect();
      const distance = Math.abs(rect.top + rect.height / 2 - center);
      if (distance < closestDistance) {
        closestDistance = distance;
        closest = index;
      }
    });
    if (closest !== null) activate(closest);
  },
  { threshold: [0, 0.25, 0.5, 0.75, 1] }
);

entries.forEach((entry) => observer.observe(entry));
activate(0);
