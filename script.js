// ---------------------------------------------------------
// StayScope — front-end logic
// Talks to the FastAPI backend defined in main.py (Features schema)
// ---------------------------------------------------------

// If your model's predict_proba returns classes in a different order,
// edit CLASS_LABELS_BY_LENGTH below to match model.classes_ from training.
const CLASS_LABELS_BY_LENGTH = {
  2: ["Low demand", "High demand"],
  3: ["Entire home/apt", "Private room", "Shared room"],
};

const DEFAULT_API_URL = "https://nyc-airbnb-room-type-predictor-9o18.onrender.com";

const NEIGHBOURHOODS_BY_BOROUGH = {
  Manhattan: ["Harlem", "Upper West Side", "Chelsea", "East Village", "Midtown", "Hell's Kitchen"],
  Brooklyn: ["Williamsburg", "Bushwick", "Bedford-Stuyvesant", "Park Slope", "Greenpoint"],
  Queens: ["Astoria", "Long Island City", "Flushing", "Ridgewood"],
  Bronx: ["Mott Haven", "Fordham", "Riverdale"],
  "Staten Island": ["St. George", "Tompkinsville", "New Dorp"],
};

// NYC bounding box, used only to place the decorative pin.
const BBOX = { latMin: 40.49, latMax: 40.92, lngMin: -74.26, lngMax: -73.68 };

const state = {
  apiUrl: localStorage.getItem("stayscope_api_url") || DEFAULT_API_URL,
};

// ---------- element refs ----------
const form = document.getElementById("predictForm");
const connStatus = document.getElementById("connStatus");
const connLabel = connStatus.querySelector(".conn-label");
const gearBtn = document.getElementById("gearBtn");
const apiPopover = document.getElementById("apiPopover");
const apiUrlInput = document.getElementById("apiUrlInput");
const apiSaveBtn = document.getElementById("apiSaveBtn");
const apiCloseBtn = document.getElementById("apiCloseBtn");

const boroughChips = document.getElementById("boroughChips");
const chipHighlight = document.getElementById("chipHighlight");
const neighbourhoodGroupInput = document.getElementById("neighbourhood_group");
const neighbourhoodInput = document.getElementById("neighbourhood");
const nbList = document.getElementById("nbList");

const priceInput = document.getElementById("price");
const priceBubble = document.getElementById("priceBubble");
const minNightsInput = document.getElementById("minimum_nights");
const minNightsBubble = document.getElementById("minNightsBubble");
const availInput = document.getElementById("availability_365");
const availBubble = document.getElementById("availBubble");

const latInput = document.getElementById("latitude");
const lngInput = document.getElementById("longitude");
const miniMapPin = document.getElementById("miniMapPin");

const predictBtn = document.getElementById("predictBtn");
const formError = document.getElementById("formError");

const resultStatus = document.getElementById("resultStatus");
const roomGallery = document.getElementById("roomGallery");
const roomCards = [...roomGallery.querySelectorAll(".room-card")];
const resultLoadingInline = document.getElementById("resultLoadingInline");
const resultBars = document.getElementById("resultBars");
const resetBtn = document.getElementById("resetBtn");

// ---------- init ----------
init();

function init() {
  apiUrlInput.value = state.apiUrl;
  checkHealth();

  populateNeighbourhoods(neighbourhoodGroupInput.value);
  updateMapPin();

  bindSlider(priceInput, priceBubble, (v) => `$${v}`);
  bindSlider(minNightsInput, minNightsBubble, (v) => `${v} night${v == 1 ? "" : "s"}`);
  bindSlider(availInput, availBubble, (v) => `${v} days`);

  boroughChips.addEventListener("click", (e) => {
    const chip = e.target.closest(".chip");
    if (!chip) return;
    setActiveChip(chip);
    neighbourhoodGroupInput.value = chip.dataset.value;
    populateNeighbourhoods(chip.dataset.value);
  });

  // position the sliding pill once layout is ready
  requestAnimationFrame(() => moveHighlightTo(boroughChips.querySelector(".chip.active")));
  window.addEventListener("resize", () => moveHighlightTo(boroughChips.querySelector(".chip.active")));

  latInput.addEventListener("input", updateMapPin);
  lngInput.addEventListener("input", updateMapPin);

  gearBtn.addEventListener("click", () => apiPopover.classList.toggle("open"));
  apiCloseBtn.addEventListener("click", () => apiPopover.classList.remove("open"));
  apiSaveBtn.addEventListener("click", () => {
    const val = apiUrlInput.value.trim().replace(/\/$/, "");
    if (!val) return;
    state.apiUrl = val;
    localStorage.setItem("stayscope_api_url", val);
    apiPopover.classList.remove("open");
    checkHealth();
  });

  form.addEventListener("submit", handleSubmit);
  resetBtn.addEventListener("click", resetResult);
}

function setActiveChip(chip) {
  [...boroughChips.querySelectorAll(".chip")].forEach((c) => c.classList.remove("active"));
  chip.classList.add("active");
  moveHighlightTo(chip);
}

function moveHighlightTo(chip) {
  if (!chip) return;
  chipHighlight.style.left = `${chip.offsetLeft}px`;
  chipHighlight.style.top = `${chip.offsetTop}px`;
  chipHighlight.style.width = `${chip.offsetWidth}px`;
  chipHighlight.style.height = `${chip.offsetHeight}px`;
}

function bindSlider(input, bubble, formatter) {
  const sync = () => {
    bubble.textContent = formatter(input.value);
    positionBubble(input, bubble);
  };
  input.addEventListener("input", sync);
  window.addEventListener("resize", sync);
  sync();
}

function positionBubble(input, bubble) {
  const min = parseFloat(input.min);
  const max = parseFloat(input.max);
  const pct = (parseFloat(input.value) - min) / (max - min);
  // thumb travels within track minus its own width, roughly 16px
  const trackWidth = input.offsetWidth;
  const thumb = 16;
  const left = pct * (trackWidth - thumb) + thumb / 2;
  bubble.style.left = `${left}px`;
}

function populateNeighbourhoods(borough) {
  const list = NEIGHBOURHOODS_BY_BOROUGH[borough] || [];
  nbList.innerHTML = list.map((n) => `<option value="${n}"></option>`).join("");
}

function updateMapPin() {
  const lat = parseFloat(latInput.value);
  const lng = parseFloat(lngInput.value);
  if (Number.isNaN(lat) || Number.isNaN(lng)) return;
  const xPct = clamp(((lng - BBOX.lngMin) / (BBOX.lngMax - BBOX.lngMin)) * 100, 4, 96);
  const yPct = clamp((1 - (lat - BBOX.latMin) / (BBOX.latMax - BBOX.latMin)) * 100, 4, 96);
  miniMapPin.style.left = `${xPct}%`;
  miniMapPin.style.top = `${yPct}%`;
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

async function checkHealth() {
  connStatus.dataset.state = "checking";
  connLabel.textContent = "Checking API…";
  try {
    const res = await fetch(state.apiUrl + "/", { method: "GET" });
    if (!res.ok) throw new Error("bad status");
    connStatus.dataset.state = "ok";
    connLabel.textContent = "Backend connected";
  } catch (err) {
    connStatus.dataset.state = "error";
    connLabel.textContent = "Backend unreachable";
  }
}

async function handleSubmit(e) {
  e.preventDefault();
  formError.textContent = "";

  if (!form.checkValidity()) {
    form.reportValidity();
    return;
  }

  const payload = {
    latitude: parseFloat(latInput.value),
    longitude: parseFloat(lngInput.value),
    price: parseFloat(priceInput.value),
    minimum_nights: parseInt(minNightsInput.value, 10),
    number_of_reviews: parseInt(document.getElementById("number_of_reviews").value, 10),
    reviews_per_month: parseFloat(document.getElementById("reviews_per_month").value),
    calculated_host_listings_count: parseInt(document.getElementById("calculated_host_listings_count").value, 10),
    availability_365: parseInt(availInput.value, 10),
    neighbourhood_group: neighbourhoodGroupInput.value,
    neighbourhood: neighbourhoodInput.value.trim(),
  };

  setLoading(true);
  showLoadingPanel();

  try {
    const res = await fetch(state.apiUrl + "/predict", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const detail = await safeErrorDetail(res);
      throw new Error(detail || `Request failed with status ${res.status}`);
    }

    const data = await res.json();
    renderResult(data);
  } catch (err) {
    formError.textContent =
      err.message.includes("Failed to fetch")
        ? "Can't reach the backend. Check the API URL (⚙ top right) and make sure the FastAPI server is running with CORS enabled."
        : err.message;
    showEmptyPanel();
  } finally {
    setLoading(false);
  }
}

async function safeErrorDetail(res) {
  try {
    const body = await res.json();
    return typeof body.detail === "string" ? body.detail : JSON.stringify(body.detail);
  } catch {
    return null;
  }
}

function setLoading(isLoading) {
  predictBtn.disabled = isLoading;
  predictBtn.dataset.loading = String(isLoading);
}

function resetRoomCards() {
  roomCards.forEach((card) => {
    card.classList.remove("winner", "runner-up");
    const badge = card.querySelector("[data-badge]");
    badge.hidden = true;
    badge.textContent = "";
  });
}

function showLoadingPanel() {
  resultStatus.textContent = "Talking to the model…";
  resultStatus.classList.remove("is-result");
  resultLoadingInline.hidden = false;
  resultBars.hidden = true;
  resetBtn.hidden = true;
  resetRoomCards();
  roomGallery.classList.add("thinking");
}

function showEmptyPanel() {
  resultStatus.textContent = "Fill in the listing details and run the prediction.";
  resultStatus.classList.remove("is-result");
  resultLoadingInline.hidden = true;
  resultBars.hidden = true;
  resetBtn.hidden = true;
  roomGallery.classList.remove("thinking");
  resetRoomCards();
}

function resetResult() {
  showEmptyPanel();
}

function renderResult(data) {
  resultLoadingInline.hidden = true;
  roomGallery.classList.remove("thinking");

  const predictedLabel = String(data.prediction);
  const probs = Array.isArray(data.probability) ? data.probability : [];
  const labels = CLASS_LABELS_BY_LENGTH[probs.length] || probs.map((_, i) => `Class ${i + 1}`);

  const rows = probs
    .map((p, i) => ({ label: labels[i], value: p }))
    .sort((a, b) => b.value - a.value);

  const topLabel = rows.length ? rows[0].label : predictedLabel;
  const topPct = rows.length ? rows[0].value * 100 : 0;

  resultStatus.innerHTML = `Predicted: <em>${escapeHtml(predictedLabel)}</em>`;
  resultStatus.classList.add("is-result");

  // grow the matching room card, shrink the rest
  resetRoomCards();
  roomCards.forEach((card) => {
    if (card.dataset.label === topLabel || card.dataset.label === predictedLabel) {
      card.classList.add("winner");
      const badge = card.querySelector("[data-badge]");
      badge.hidden = false;
      animateCount(0, topPct, 900, (v) => (badge.textContent = `${v.toFixed(0)}%`));
    } else {
      card.classList.add("runner-up");
    }
  });

  resultBars.hidden = false;
  resultBars.innerHTML = rows
    .map(
      (r, i) => `
      <div class="bar-row ${i === 0 ? "top" : ""}">
        <div class="bar-label-row">
          <span>${escapeHtml(r.label)}</span>
          <span class="bar-pct" data-target="${(r.value * 100).toFixed(1)}">0.0%</span>
        </div>
        <div class="bar-track"><div class="bar-fill" data-target="${r.value * 100}"></div></div>
      </div>`
    )
    .join("");

  resetBtn.hidden = false;

  requestAnimationFrame(() => {
    resultBars.querySelectorAll(".bar-fill").forEach((el) => {
      const target = parseFloat(el.dataset.target);
      requestAnimationFrame(() => (el.style.width = `${target}%`));
    });
    resultBars.querySelectorAll(".bar-pct").forEach((el) => {
      const target = parseFloat(el.dataset.target);
      animateCount(0, target, 1000, (v) => (el.textContent = `${v.toFixed(1)}%`));
    });
  });
}

function animateCount(from, to, duration, onUpdate) {
  const start = performance.now();
  function tick(now) {
    const t = Math.min(1, (now - start) / duration);
    const eased = 1 - Math.pow(1 - t, 3); // ease-out cubic
    onUpdate(from + (to - from) * eased);
    if (t < 1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}
