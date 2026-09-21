import { createCarStage } from "./car-stage.js";

const data = JSON.parse(document.getElementById("car-preview-data").textContent);
const container = document.getElementById("car-preview");
const form = document.getElementById("book-form");
const caption = document.getElementById("preview-caption");

const stylesById = new Map(data.styles.map((style) => [String(style.id), style]));
const colorNames = new Map(data.colors.map((color) => [color.hex.toLowerCase(), color.name]));
const stage = createCarStage(container);

function selectedValue(name) {
  const input = form.querySelector(`input[name="${name}"]:checked`);
  return input ? input.value : "";
}

async function showSelectedStyle() {
  const style = stylesById.get(selectedValue("body_style"));
  if (!style) return;
  if (await stage.showStyle(style)) stage.setColor(selectedValue("vehicle_color"));
  updateCaption();
}

// ---- Words next to the picture -------------------------------------------------------------
function labelFor(name) {
  const input = form.querySelector(`input[name="${name}"]:checked`);
  return input ? input.closest("label").textContent.trim().replace(/\s+/g, " ") : "";
}

function setSummary(key, text, emptyText) {
  const node = document.querySelector(`[data-summary="${key}"]`);
  node.textContent = text || emptyText;
  node.classList.toggle("is-empty", !text);
}

function updateCaption() {
  const style = stylesById.get(selectedValue("body_style"));
  const color = colorNames.get(selectedValue("vehicle_color").toLowerCase());
  caption.textContent = style
    ? `${style.name} body style${color ? `, ${color.toLowerCase()}` : ""}. Drag to turn it.`
    : "Drag to turn it around";
}

function updateSummary() {
  setSummary("service", labelFor("service_type"), "Not chosen yet");

  const model = form.elements["vehicle_make_model"].value.trim();
  const registration = form.elements["registration_number"].value.trim().toUpperCase();
  setSummary("car", [model, registration].filter(Boolean).join(" · "), "Not entered yet");

  const dateValue = form.elements["preferred_date"].value;
  const date = dateValue
    ? new Date(`${dateValue}T00:00`).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" })
    : "";
  const slot = labelFor("time_slot").split(",")[0];
  setSummary("when", [date, slot].filter(Boolean).join(", "), "Not chosen yet");
}

form.addEventListener("input", updateSummary);
form.addEventListener("change", (event) => {
  if (event.target.name === "body_style") showSelectedStyle();
  if (event.target.name === "vehicle_color") {
    stage.setColor(event.target.value);
    updateCaption();
  }
  updateSummary();
});

updateSummary();
showSelectedStyle();
