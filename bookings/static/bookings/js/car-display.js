import { createCarStage } from "../../cars/js/car-stage.js";

const data = JSON.parse(document.getElementById("car-display-data").textContent);
const stage = createCarStage(document.getElementById("car-preview"));

stage.showStyle(data.style).then((shown) => {
  if (shown) stage.setColor(data.color);
});
