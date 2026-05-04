// ── Constants ────────────────────────────────────────────────
const MIN_PX = 2;
const MAX_PX = 120;
const SIDE_PADDING = 120; // extra px on each side of first/last event
const MIN_TICK_PX = 55;   // minimum pixels between ruler ticks
const LABEL_W_EST = 7;    // px per character for label collision estimate
const MAX_LABEL_CHARS = 20;
const TIERS = 4;
const TIER_H = 14;        // px per label tier
const DOT_Y_CSS = '50%';  // event dot vertical center (via CSS top:50%)

// ── State ────────────────────────────────────────────────────
let pendingWikiEvents = null;

let state = {
  timelines: [],
  pxPerYear: 12,
  startYear: 1870,
  endYear: 1960,
  savedScroll: 0
};

// ── Utilities ────────────────────────────────────────────────
function generateId() {
  return 'id_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
}

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

function yearToX(year) {
  return (year - state.startYear) * state.pxPerYear + SIDE_PADDING;
}

function computeYearRange() {
  const years = state.timelines.flatMap(tl => tl.events.map(e => e.year));
  if (!years.length) {
    state.startYear = 1870;
    state.endYear = 1960;
    return;
  }
  state.startYear = Math.min(...years) - 5;
  state.endYear   = Math.max(...years) + 5;
}

function niceTickInterval(pxPerYear) {
  const raw = MIN_TICK_PX / pxPerYear;
  const steps = [1, 2, 5, 10, 25, 50, 100, 200, 500];
  return steps.find(s => s >= raw) || 500;
}

function canvasWidth() {
  return (state.endYear - state.startYear) * state.pxPerYear + SIDE_PADDING * 2;
}

// ── DOM helpers ──────────────────────────────────────────────
const $ = id => document.getElementById(id);

// ── Rendering ────────────────────────────────────────────────
function render() {
  const vp = $('timeline-viewport');
  state.savedScroll = vp.scrollLeft;

  updateCanvasWidth();
  renderRuler();
  renderRows();
  updateZoomDisplay();

  // restore scroll after layout
  requestAnimationFrame(() => { vp.scrollLeft = state.savedScroll; });

  // show/hide empty hint
  const hint = $('empty-hint');
  hint.classList.toggle('visible', state.timelines.length === 0);
}

function updateCanvasWidth() {
  $('timeline-canvas').style.width = canvasWidth() + 'px';
}

function renderRuler() {
  const ruler = $('ruler');
  ruler.innerHTML = '';
  ruler.style.width = canvasWidth() + 'px';

  const interval = niceTickInterval(state.pxPerYear);
  const majorInterval = interval * 5;

  // start at first tick aligned to interval
  const firstTick = Math.ceil(state.startYear / interval) * interval;

  for (let yr = firstTick; yr <= state.endYear; yr += interval) {
    const isMajor = yr % majorInterval === 0;
    const tick = document.createElement('div');
    tick.className = 'ruler-tick' + (isMajor ? ' major' : '');
    tick.style.left = yearToX(yr) + 'px';
    tick.style.height = '100%';

    const line = document.createElement('div');
    line.className = 'ruler-tick-line';
    line.style.height = isMajor ? '100%' : '40%';
    line.style.marginTop = isMajor ? '0' : '60%';

    const label = document.createElement('div');
    label.className = 'ruler-tick-label';
    label.textContent = yr;

    tick.appendChild(label);
    tick.appendChild(line);
    ruler.appendChild(tick);
  }
}

function renderRows() {
  const container = $('timeline-rows');
  container.innerHTML = '';

  for (const tl of state.timelines) {
    container.appendChild(renderRow(tl));
  }
}

function renderRow(tl) {
  const row = document.createElement('div');
  row.className = 'tl-row';
  row.dataset.id = tl.id;

  // sticky label
  const label = document.createElement('div');
  label.className = 'tl-row-label';

  const name = document.createElement('div');
  name.className = 'tl-row-name';
  name.textContent = tl.name;
  name.style.color = tl.color;

  const actions = document.createElement('div');
  actions.className = 'tl-row-actions';

  const addBtn = document.createElement('button');
  addBtn.className = 'btn-add-event';
  addBtn.textContent = '+ Event';
  addBtn.addEventListener('click', () => openAddEventModal(tl.id));

  const delBtn = document.createElement('button');
  delBtn.className = 'btn-delete-timeline';
  delBtn.textContent = '✕';
  delBtn.title = 'Remove timeline';
  delBtn.addEventListener('click', () => deleteTimeline(tl.id));

  actions.append(addBtn, delBtn);
  label.append(name, actions);

  // track
  const track = document.createElement('div');
  track.className = 'tl-row-track';
  renderEvents(tl, track);

  row.append(label, track);
  return row;
}

function renderEvents(tl, trackEl) {
  const sorted = [...tl.events].sort((a, b) => a.year - b.year);
  // slots[tier] = rightmost pixel edge of last placed label in that tier
  const tierEdges = Array(TIERS).fill(-Infinity);

  for (const ev of sorted) {
    const x = yearToX(ev.year);
    const truncated = ev.title.length > MAX_LABEL_CHARS
      ? ev.title.slice(0, MAX_LABEL_CHARS - 1) + '…'
      : ev.title;
    const labelW = truncated.length * LABEL_W_EST;
    const labelLeft = x - labelW / 2;
    const labelRight = x + labelW / 2;

    // pick the lowest tier with no horizontal overlap (plus a small gap)
    let tier = 0;
    while (tier < TIERS - 1 && tierEdges[tier] > labelLeft - 4) tier++;
    tierEdges[tier] = labelRight;

    // dot
    const dot = document.createElement('div');
    dot.className = 'event-dot';
    dot.style.left = x + 'px';
    dot.style.top = DOT_Y_CSS;
    dot.style.background = tl.color;
    dot.addEventListener('click', e => {
      e.stopPropagation();
      openEventDetailModal(ev, tl);
    });

    // label (above the center line)
    const lbl = document.createElement('div');
    lbl.className = 'event-label';
    lbl.textContent = truncated;
    lbl.style.left = x + 'px';
    lbl.style.color = tl.color;
    // tier 0 = just above center; higher tiers move upward
    lbl.style.bottom = (50 + 10 + tier * TIER_H) + '%';

    trackEl.append(lbl, dot);
  }
}

function updateZoomDisplay() {
  $('zoom-level').textContent = Math.round(state.pxPerYear) + ' px/yr';
}

// ── Zoom ─────────────────────────────────────────────────────
function setZoom(newPx, anchorYear) {
  const vp = $('timeline-viewport');
  const cursorX = anchorYear !== undefined
    ? yearToX(anchorYear)
    : vp.scrollLeft + vp.clientWidth / 2;
  const yearAtAnchor = anchorYear !== undefined
    ? anchorYear
    : state.startYear + (vp.scrollLeft + vp.clientWidth / 2) / state.pxPerYear;

  state.pxPerYear = clamp(newPx, MIN_PX, MAX_PX);
  render();

  // re-anchor scroll so the same year stays under cursor/center
  requestAnimationFrame(() => {
    const newX = yearToX(yearAtAnchor);
    const offset = anchorYear !== undefined
      ? (cursorX - vp.getBoundingClientRect().left)
      : vp.clientWidth / 2;
    vp.scrollLeft = newX - (anchorYear !== undefined ? offset : vp.clientWidth / 2);
  });
}

// ── Wikipedia scraping ───────────────────────────────────────
async function scrapeWikipedia(topic) {
  const statusEl = $('wiki-status');
  statusEl.className = 'wiki-status loading';
  statusEl.textContent = 'Searching Wikipedia…';
  try {
    const resp = await fetch('/api/scrape', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ topic })
    });
    if (!resp.ok) throw new Error((await resp.json()).error || 'Server error');
    const data = await resp.json();
    pendingWikiEvents = data.events;
    $('tl-name').value = data.timelineName;
    statusEl.className = 'wiki-status success';
    statusEl.textContent = `Found ${data.events.length} events — edit name or click Create.`;
  } catch (err) {
    statusEl.className = 'wiki-status error';
    statusEl.textContent = 'Error: ' + err.message;
  }
}

// ── State mutators ───────────────────────────────────────────
function addTimeline(name, color, events = []) {
  state.timelines.push({ id: generateId(), name, color, events: events.map(e => ({ ...e, id: generateId() })) });
  computeYearRange();
  render();
}

function deleteTimeline(id) {
  state.timelines = state.timelines.filter(tl => tl.id !== id);
  computeYearRange();
  render();
}

function addEvent(timelineId, year, title, description) {
  const tl = state.timelines.find(t => t.id === timelineId);
  if (!tl) return;
  tl.events.push({ id: generateId(), year, title, description });
  computeYearRange();

  // scroll to the new event after render
  state.savedScroll = yearToX(year) - $('timeline-viewport').clientWidth / 2;
  render();
}

// ── Modals ───────────────────────────────────────────────────
function openModal(id) { $(id).classList.add('modal-open'); }
function closeModal(id) { $(id).classList.remove('modal-open'); }

function openAddTimelineModal() {
  $('form-add-timeline').reset();
  $('wiki-topic').value = '';
  $('wiki-status').textContent = '';
  $('wiki-status').className = 'wiki-status';
  pendingWikiEvents = null;
  openModal('modal-add-timeline');
  setTimeout(() => $('tl-name').focus(), 50);
}

function openAddEventModal(timelineId) {
  $('form-add-event').reset();
  $('ev-timeline-id').value = timelineId;
  openModal('modal-add-event');
  setTimeout(() => $('ev-year').focus(), 50);
}

function openEventDetailModal(ev, tl) {
  $('detail-title').textContent = ev.title;
  $('detail-year-badge').textContent = ev.year;
  $('detail-year-badge').style.background = tl.color + '33';
  $('detail-year-badge').style.color = tl.color;
  $('detail-desc').textContent = ev.description || '(no description)';
  $('detail-timeline-name').textContent = 'From: ' + tl.name;
  $('modal-event-detail').querySelector('.modal-box').style.borderTopColor = tl.color;
  openModal('modal-event-detail');
}

// ── Event listeners ──────────────────────────────────────────
function wireListeners() {
  // zoom buttons
  $('btn-zoom-in').addEventListener('click', () => setZoom(state.pxPerYear * 1.25));
  $('btn-zoom-out').addEventListener('click', () => setZoom(state.pxPerYear * 0.8));

  // add timeline button
  $('btn-add-timeline').addEventListener('click', openAddTimelineModal);

  // wiki search button
  $('btn-wiki-search').addEventListener('click', () => {
    const t = $('wiki-topic').value.trim();
    if (t) scrapeWikipedia(t);
  });
  $('wiki-topic').addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); const t = $('wiki-topic').value.trim(); if (t) scrapeWikipedia(t); }
  });

  // form: add timeline
  $('form-add-timeline').addEventListener('submit', e => {
    e.preventDefault();
    const name = $('tl-name').value.trim();
    const color = $('tl-color').value;
    if (!name) return;
    addTimeline(name, color, pendingWikiEvents || []);
    closeModal('modal-add-timeline');
  });

  // form: add event
  $('form-add-event').addEventListener('submit', e => {
    e.preventDefault();
    const tlId = $('ev-timeline-id').value;
    const year = parseInt($('ev-year').value, 10);
    const title = $('ev-title').value.trim();
    const desc = $('ev-desc').value.trim();
    if (!title || isNaN(year)) return;
    addEvent(tlId, year, title, desc);
    closeModal('modal-add-event');
  });

  // modal close buttons
  document.querySelectorAll('.modal-close, [data-modal]').forEach(el => {
    el.addEventListener('click', () => closeModal(el.dataset.modal));
  });

  // close on overlay click
  document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', e => {
      if (e.target === overlay) closeModal(overlay.id);
    });
  });

  // close on Escape
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      document.querySelectorAll('.modal-overlay.modal-open')
        .forEach(m => closeModal(m.id));
    }
  });

  // mouse wheel zoom (toward cursor)
  const vp = $('timeline-viewport');
  vp.addEventListener('wheel', e => {
    e.preventDefault();
    const rect = vp.getBoundingClientRect();
    const cursorOffsetInVP = e.clientX - rect.left;
    const yearAtCursor = state.startYear + (vp.scrollLeft + cursorOffsetInVP - SIDE_PADDING) / state.pxPerYear;
    const factor = e.deltaY < 0 ? 1.12 : 0.89;
    const newPx = clamp(state.pxPerYear * factor, MIN_PX, MAX_PX);
    state.pxPerYear = newPx;
    render();
    requestAnimationFrame(() => {
      vp.scrollLeft = yearToX(yearAtCursor) - cursorOffsetInVP;
    });
  }, { passive: false });

  // drag-to-pan
  let isDragging = false, dragStartX, scrollStart;

  vp.addEventListener('mousedown', e => {
    if (e.target.closest('.event-dot, button, input')) return;
    isDragging = true;
    dragStartX = e.clientX;
    scrollStart = vp.scrollLeft;
    vp.classList.add('dragging');
  });

  document.addEventListener('mousemove', e => {
    if (!isDragging) return;
    vp.scrollLeft = scrollStart - (e.clientX - dragStartX);
  });

  document.addEventListener('mouseup', () => {
    isDragging = false;
    vp.classList.remove('dragging');
  });
}

// ── Init ─────────────────────────────────────────────────────
function init() {
  // deep-clone preset data into state
  state.timelines = JSON.parse(JSON.stringify(window.PRESET_TIMELINES));
  computeYearRange();
  wireListeners();
  render();

  // scroll to start of data
  requestAnimationFrame(() => {
    $('timeline-viewport').scrollLeft = 0;
  });
}

init();
