'use strict';

const STORAGE_KEY = 'urenregistratie.pwa.v1';
const ROUNDING_UNITS = [3, 6, 12, 15, 30, 60];

const defaultTimer = () => ({
  status: 'inactive',
  sessionId: null,
  startISO: null,
  stopISO: null,
  themeId: null,
  themeName: '',
  subthemeId: null,
  subthemeName: '',
  locationName: '',
  note: '',
  startNewAfterSave: false,
  interruption: null
});

const defaultState = () => ({
  version: 2,
  settings: {
    roundingUnitMinutes: 15,
    roundingMode: 'up',
    roundingThreshold: 0.25,
    timeDisplay: 'decimal',
    interruptionUnitMinutes: 15,
    interruptionDeductAfterMinutes: 30,
    employerMode: 'single',
    swipeDeleteEnabled: true
  },
  ui: {
    periodMode: 'week',
    anchorDate: dateInputValue(new Date())
  },
  timer: defaultTimer(),
  themes: [],
  subthemes: [],
  colleagues: [],
  employers: [],
  workspaces: [],
  departments: [],
  entries: []
});

let state = loadState();
let timerTick = null;

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

function uid() {
  return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState();
    const parsed = JSON.parse(raw);
    const base = defaultState();
    const oldRounding = Number(parsed.settings?.roundingMinutes);
    const settings = {
      ...base.settings,
      ...(parsed.settings || {}),
      roundingUnitMinutes: Number(parsed.settings?.roundingUnitMinutes || oldRounding || base.settings.roundingUnitMinutes)
    };
    const ui = { ...base.ui, ...(parsed.ui || {}) };
    const timer = { ...base.timer, ...(parsed.timer || {}) };
    if (timer.status === 'active' && !timer.sessionId) timer.sessionId = uid();
    return {
      ...base,
      ...parsed,
      version: 2,
      settings,
      ui,
      timer,
      themes: Array.isArray(parsed.themes) ? parsed.themes : [],
      subthemes: Array.isArray(parsed.subthemes) ? parsed.subthemes : [],
      colleagues: Array.isArray(parsed.colleagues) ? parsed.colleagues : [],
      employers: Array.isArray(parsed.employers) ? parsed.employers : [],
      workspaces: Array.isArray(parsed.workspaces) ? parsed.workspaces : [],
      departments: Array.isArray(parsed.departments) ? parsed.departments : [],
      entries: Array.isArray(parsed.entries) ? parsed.entries.map(normalizeEntry) : []
    };
  } catch (error) {
    console.error('Kan opslag niet lezen', error);
    return defaultState();
  }
}

function normalizeEntry(entry) {
  const own = Number(entry.ownMinutes ?? entry.roundedMinutes ?? 0) || 0;
  const colleague = Number(entry.colleagueMinutes || 0) || 0;
  return {
    activityType: entry.activityType || (entry.kind === 'Tussenstop' ? 'interruption' : 'normal'),
    parentActivityId: entry.parentActivityId || null,
    locationName: entry.locationName || '',
    departmentName: entry.departmentName || '',
    note: entry.note || '',
    people: Array.isArray(entry.people) ? entry.people : [],
    contexts: Array.isArray(entry.contexts) ? entry.contexts : [],
    attributions: Array.isArray(entry.attributions) ? entry.attributions : [],
    netActualMinutes: Number(entry.netActualMinutes ?? entry.actualMinutes ?? 0) || 0,
    deductedInterruptionMinutes: Number(entry.deductedInterruptionMinutes || 0) || 0,
    deductMinutes: Number(entry.deductMinutes || 0) || 0,
    roundingSnapshot: entry.roundingSnapshot || null,
    ...entry,
    ownMinutes: own,
    colleagueMinutes: colleague,
    totalMinutes: Number(entry.totalMinutes ?? own + colleague) || 0
  };
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function safeText(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[char]));
}

function cleanName(value) {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

function sortedByUsage(items) {
  return [...items].sort((a, b) => (b.usageCount || 0) - (a.usageCount || 0) || a.name.localeCompare(b.name, 'nl', { sensitivity: 'base' }));
}

function dateInputValue(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function localDateTimeInput(value) {
  if (!value) return '';
  const d = new Date(value);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const h = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${y}-${m}-${day}T${h}:${min}`;
}

function dateText(value) {
  return new Intl.DateTimeFormat('nl-NL', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(value));
}

function timeText(value) {
  if (!value) return '-';
  return new Intl.DateTimeFormat('nl-NL', { hour: '2-digit', minute: '2-digit' }).format(new Date(value));
}

function durationText(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = String(Math.floor(total / 3600)).padStart(2, '0');
  const m = String(Math.floor((total % 3600) / 60)).padStart(2, '0');
  const s = String(total % 60).padStart(2, '0');
  return `${h}:${m}:${s}`;
}

function clockMinutes(minutes) {
  const total = Math.max(0, Math.round(Number(minutes) || 0));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

function decimalHours(minutes) {
  return new Intl.NumberFormat('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format((Number(minutes) || 0) / 60);
}

function displayMinutes(minutes, withUnit = true) {
  if (state.settings.timeDisplay === 'clock') return `${clockMinutes(minutes)}${withUnit ? ' uur' : ''}`;
  return `${decimalHours(minutes)}${withUnit ? ' uur' : ''}`;
}

function actualMinutes(startISO, stopISO) {
  const start = new Date(startISO).getTime();
  const stop = new Date(stopISO).getTime();
  return Math.max(1, Math.ceil(Math.max(0, stop - start) / 60000));
}

function roundByRule(minutes, { unit = state.settings.roundingUnitMinutes, mode = state.settings.roundingMode, threshold = state.settings.roundingThreshold } = {}) {
  const value = Math.max(0, Number(minutes) || 0);
  const block = Math.max(1, Number(unit) || 15);
  if (mode === 'none') return Math.round(value);
  if (mode === 'up') return value <= 0 ? 0 : Math.ceil(value / block) * block;
  const lower = Math.floor(value / block) * block;
  const remainder = value - lower;
  return remainder >= block * Number(threshold || 0.5) ? lower + block : lower;
}

function roundDown(minutes, unit) {
  const block = Math.max(1, Number(unit) || 15);
  return Math.floor(Math.max(0, Number(minutes) || 0) / block) * block;
}

function interruptionBooking(actual) {
  return roundByRule(actual, { unit: state.settings.interruptionUnitMinutes, mode: 'up', threshold: 0 });
}

function interruptionDeduction(actual) {
  if (actual < Number(state.settings.interruptionDeductAfterMinutes || 0)) return 0;
  return roundDown(actual, state.settings.interruptionUnitMinutes);
}

function roundingSnapshot() {
  return {
    unitMinutes: Number(state.settings.roundingUnitMinutes),
    mode: state.settings.roundingMode,
    threshold: Number(state.settings.roundingThreshold)
  };
}

function toast(message) {
  const el = $('#toast');
  el.textContent = message;
  el.classList.remove('hidden');
  requestAnimationFrame(() => el.classList.add('show'));
  clearTimeout(el._timeout);
  el._timeout = setTimeout(() => {
    el.classList.remove('show');
    setTimeout(() => el.classList.add('hidden'), 220);
  }, 2400);
}

function openModal(html) {
  const backdrop = $('#modalBackdrop');
  $('#modal').innerHTML = html;
  backdrop.classList.remove('hidden');
  backdrop.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
  $('.close', $('#modal'))?.addEventListener('click', closeModal);
}

function closeModal() {
  const backdrop = $('#modalBackdrop');
  backdrop.classList.add('hidden');
  backdrop.setAttribute('aria-hidden', 'true');
  $('#modal').innerHTML = '';
  document.body.style.overflow = '';
}

function periodBounds(mode = state.ui.periodMode, anchorValue = state.ui.anchorDate) {
  const anchor = new Date(`${anchorValue}T12:00:00`);
  let start = new Date(anchor);
  let end = new Date(anchor);
  if (mode === 'day') {
    start.setHours(0, 0, 0, 0); end.setHours(23, 59, 59, 999);
  } else if (mode === 'week') {
    const day = (anchor.getDay() + 6) % 7;
    start.setDate(anchor.getDate() - day); start.setHours(0, 0, 0, 0);
    end = new Date(start); end.setDate(start.getDate() + 6); end.setHours(23, 59, 59, 999);
  } else if (mode === 'month') {
    start = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
    end = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0, 23, 59, 59, 999);
  } else if (mode === 'quarter') {
    const month = Math.floor(anchor.getMonth() / 3) * 3;
    start = new Date(anchor.getFullYear(), month, 1);
    end = new Date(anchor.getFullYear(), month + 3, 0, 23, 59, 59, 999);
  } else if (mode === 'all') {
    start = new Date(2000, 0, 1);
    end = new Date(2999, 11, 31, 23, 59, 59, 999);
  } else {
    start = new Date(anchor.getFullYear(), 0, 1);
    end = new Date(anchor.getFullYear(), 11, 31, 23, 59, 59, 999);
  }
  return { start, end };
}

function periodLabel() {
  const { start } = periodBounds();
  if (state.ui.periodMode === 'day') return new Intl.DateTimeFormat('nl-NL', { weekday: 'long', day: 'numeric', month: 'long' }).format(start);
  if (state.ui.periodMode === 'week') return `Week ${isoWeekNumber(start)}`;
  if (state.ui.periodMode === 'month') return new Intl.DateTimeFormat('nl-NL', { month: 'long', year: 'numeric' }).format(start);
  if (state.ui.periodMode === 'quarter') return `Kwartaal ${Math.floor(start.getMonth() / 3) + 1}`;
  if (state.ui.periodMode === 'all') return 'Alle tijden';
  return String(start.getFullYear());
}

function periodSubLabel() {
  const { start, end } = periodBounds();
  if (state.ui.periodMode === 'day') return dateText(start);
  if (state.ui.periodMode === 'year') return `${start.getFullYear()}`;
  if (state.ui.periodMode === 'all') return 'Volledige historie';
  return `${new Intl.DateTimeFormat('nl-NL', { day: 'numeric', month: 'short' }).format(start)} – ${new Intl.DateTimeFormat('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' }).format(end)}`;
}

function isoWeekNumber(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
}

function movePeriod(direction) {
  const d = new Date(`${state.ui.anchorDate}T12:00:00`);
  if (state.ui.periodMode === 'day') d.setDate(d.getDate() + direction);
  if (state.ui.periodMode === 'week') d.setDate(d.getDate() + 7 * direction);
  if (state.ui.periodMode === 'month') d.setMonth(d.getMonth() + direction);
  if (state.ui.periodMode === 'quarter') d.setMonth(d.getMonth() + 3 * direction);
  if (state.ui.periodMode === 'year') d.setFullYear(d.getFullYear() + direction);
  if (state.ui.periodMode === 'all') return;
  state.ui.anchorDate = dateInputValue(d);
  saveState(); render();
}

function entriesForPeriod() {
  if (state.ui.periodMode === 'all') return [...state.entries];
  const { start, end } = periodBounds();
  return state.entries.filter(e => {
    const d = new Date(e.dateISO || e.endISO || e.startISO || e.createdAt);
    return d >= start && d <= end;
  });
}

function totals(entries = state.entries) {
  return entries.reduce((acc, e) => {
    acc.own += Number(e.ownMinutes) || 0;
    acc.colleague += Number(e.colleagueMinutes) || 0;
    acc.total += Number(e.totalMinutes) || 0;
    if (e.activityType === 'interruption') acc.interruptions += 1;
    return acc;
  }, { own: 0, colleague: 0, total: 0, interruptions: 0 });
}

function suggestion() {
  if (!state.themes.length) return null;
  const now = new Date();
  const weekday = now.getDay();
  const hour = now.getHours();
  const scores = new Map();
  for (const entry of state.entries.filter(e => e.activityType !== 'interruption')) {
    const key = `${entry.themeId || entry.themeName}|${entry.subthemeId || entry.subthemeName || ''}`;
    const d = new Date(entry.startISO || entry.dateISO || entry.createdAt);
    const daysAgo = Math.max(0, (Date.now() - d.getTime()) / 86400000);
    let score = Math.max(1, 14 - Math.min(13, daysAgo));
    if (d.getDay() === weekday) score += 4;
    if (Math.abs(d.getHours() - hour) <= 2) score += 3;
    const current = scores.get(key) || { score: 0, entry };
    current.score += score;
    current.entry = entry;
    scores.set(key, current);
  }
  if (scores.size) {
    const best = [...scores.values()].sort((a, b) => b.score - a.score)[0].entry;
    const theme = state.themes.find(t => t.id === best.themeId) || state.themes.find(t => t.name === best.themeName);
    if (theme) {
      const sub = state.subthemes.find(s => s.id === best.subthemeId) || state.subthemes.find(s => s.themeId === theme.id && s.name === best.subthemeName);
      return { theme, sub: sub || null, locationName: best.locationName || '' };
    }
  }
  const theme = sortedByUsage(state.themes)[0];
  const sub = sortedByUsage(state.subthemes.filter(s => s.themeId === theme.id))[0] || null;
  return { theme, sub, locationName: '' };
}

function render() {
  clearInterval(timerTick);
  timerTick = null;
  const main = $('#main');
  const periodEntries = entriesForPeriod();
  const t = totals(periodEntries);
  main.innerHTML = `${renderPeriodNav()}${renderSummary(t)}${renderActionCard()}${renderPeriodList(periodEntries)}`;
  wireHome();
}

function renderPeriodNav() {
  const all = state.ui.periodMode === 'all';
  return `<section class="period-nav"><div class="period-head"><button id="periodPrev" class="period-arrow" aria-label="Vorige periode" ${all ? 'disabled' : ''}>‹</button><div class="period-center"><strong>${safeText(periodLabel())}</strong><small>${safeText(periodSubLabel())}</small></div><button id="periodNext" class="period-arrow" aria-label="Volgende periode" ${all ? 'disabled' : ''}>›</button></div></section>`;
}

function renderSummary(t) {
  return `<section class="summary"><div class="summary-main"><div class="summary-label">Geboekte eigen tijd</div><div class="summary-value">${displayMinutes(t.own)}</div></div><div class="summary-parts"><div class="summary-part"><span>Collega's</span><strong>${displayMinutes(t.colleague)}</strong></div><div class="summary-part"><span>Totale inzet</span><strong>${displayMinutes(t.total)}</strong></div><div class="summary-part"><span>Tussenstops</span><strong>${t.interruptions}</strong></div></div></section>`;
}

function renderActionCard() {
  const timer = state.timer;
  if (timer.status === 'active') {
    const interruption = timer.interruption;
    return `<section class="active-card"><div class="kicker">${interruption ? 'Tussenstop actief' : 'Actieve activiteit'}</div><h2>${safeText(interruption?.themeName || timer.themeName || 'Activiteit')}</h2>${(interruption?.subthemeName || timer.subthemeName) ? `<p class="suggestion-sub">${safeText(interruption?.subthemeName || timer.subthemeName)}</p>` : ''}<div class="active-meta">${(interruption?.locationName || timer.locationName) ? `<span class="chip">⌖ ${safeText(interruption?.locationName || timer.locationName)}</span>` : ''}${interruption?.people?.length ? `<span class="chip">👥 ${safeText(interruption.people.map(p => p.name).join(', '))}</span>` : ''}${interruption?.departmentName ? `<span class="chip">${safeText(interruption.departmentName)}</span>` : ''}</div><div id="timerClock" class="timer-clock">00:00:00</div>${interruption ? `<div class="interrupt-card"><strong>${safeText(timer.themeName)} loopt op de achtergrond door</strong><small>Bij een korte onderbreking wordt niets afgetrokken; langere onderbrekingen worden omlaag afgerond van de hoofdactiviteit.</small></div><button id="stopInterruption" class="btn primary full">Tussenstop beëindigen</button>` : `<div class="row"><button id="stopTimer" class="btn primary">Stop</button><button id="startInterruption" class="btn">Tussenstop</button></div><button id="editActive" class="btn ghost full" style="margin-top:8px">Context wijzigen</button>`}</section>`;
  }
  if (timer.status === 'pending') {
    const calc = calculateParentTimer(timer);
    return `<section class="active-card"><div class="kicker warning">Nog af te ronden</div><h2>${safeText(timer.themeName)}</h2><p class="suggestion-sub">Werkelijk ${clockMinutes(calc.span)} · aftrek ${clockMinutes(calc.deducted)} · te boeken ${displayMinutes(calc.booked)}</p><button id="finishPending" class="btn primary full">Boeking afronden</button></section>`;
  }
  const s = suggestion();
  if (!s) return `<section class="suggestion"><div class="kicker">Start hier</div><h2>Eerste activiteit</h2><p class="suggestion-sub">Voeg tijdens het starten meteen je eerste thema toe.</p><button id="startOther" class="btn primary full">Start activiteit</button></section>`;
  return `<section class="suggestion"><div class="kicker">Waarschijnlijk nu</div><h2>${safeText(s.theme.name)}</h2>${s.sub ? `<p class="suggestion-sub">${safeText(s.sub.name)}</p>` : '<p class="suggestion-sub">Geen subthema</p>'}<div class="suggestion-meta">${s.locationName ? `<span class="chip">⌖ ${safeText(s.locationName)}</span>` : ''}<span class="chip">Gebaseerd op eerder gebruik</span></div><button id="quickStart" class="btn primary full">Start</button><button id="startOther" class="btn ghost full" style="margin-top:7px">Anders kiezen</button></section>`;
}

function renderPeriodList(entries) {
  const mains = entries.filter(e => e.activityType !== 'interruption').sort((a,b) => new Date(b.dateISO || b.endISO || b.createdAt) - new Date(a.dateISO || a.endISO || a.createdAt));
  const interruptions = entries.filter(e => e.activityType === 'interruption');
  if (!entries.length) return `<section class="section"><div class="section-title"><h2>Registraties</h2><button id="manualEntry" class="btn small">+ Toevoegen</button></div><div class="empty">Nog geen registraties in deze periode.</div></section>`;
  const html = [];
  let currentDay = '';
  for (const e of mains) {
    const day = entryDayKey(e);
    if (day !== currentDay) {
      currentDay = day;
      html.push(`<div class="activity-group-title">${safeText(entryDayLabel(e))}</div>`);
    }
    html.push(entryRow(e));
    interruptions.filter(x => x.parentActivityId === e.id).sort((a,b)=>new Date(a.startISO)-new Date(b.startISO)).forEach(child => html.push(entryRow(child, true)));
  }
  interruptions.filter(x => !mains.some(e => e.id === x.parentActivityId)).sort((a,b) => new Date(b.dateISO || b.endISO || b.createdAt) - new Date(a.dateISO || a.endISO || a.createdAt)).forEach(x => {
    const day = entryDayKey(x);
    if (day !== currentDay) {
      currentDay = day;
      html.push(`<div class="activity-group-title">${safeText(entryDayLabel(x))}</div>`);
    }
    html.push(entryRow(x, true));
  });
  return `<section class="section"><div class="section-title"><h2>Registraties</h2><button id="manualEntry" class="btn small">+ Toevoegen</button></div><div class="list">${html.join('')}</div></section>`;
}

function entryMoment(entry) {
  return new Date(entry.dateISO || entry.endISO || entry.startISO || entry.createdAt);
}

function entryDayKey(entry) {
  return dateInputValue(entryMoment(entry));
}

function entryDayLabel(entry) {
  const date = entryMoment(entry);
  const today = dateInputValue(new Date());
  const yesterdayDate = new Date();
  yesterdayDate.setDate(yesterdayDate.getDate() - 1);
  const key = dateInputValue(date);
  if (key === today) return 'Vandaag';
  if (key === dateInputValue(yesterdayDate)) return 'Gisteren';
  return new Intl.DateTimeFormat('nl-NL', { weekday: 'long', day: 'numeric', month: 'long' }).format(date);
}

function entryRow(e, interruption = false) {
  const secondary = [e.subthemeName, e.locationName].filter(Boolean).join(' · ');
  const start = e.startISO ? timeText(e.startISO) : '—';
  const period = e.startISO && e.endISO ? `${timeText(e.startISO)}–${timeText(e.endISO)}` : 'Handmatig';
  const total = Number(e.totalMinutes) !== Number(e.ownMinutes) ? `<small>Totaal ${displayMinutes(e.totalMinutes)}</small>` : '';
  return `<div class="entry ${interruption ? 'interruption' : ''}" data-entry="${e.id}"><div class="entry-time">${safeText(start)}</div><div class="entry-main"><strong>${safeText(e.themeName || (interruption ? 'Tussenstop' : 'Activiteit'))}</strong><small>${safeText(period)}${secondary ? ` · ${safeText(secondary)}` : ''}</small></div><div class="entry-value-stack"><strong>${displayMinutes(e.ownMinutes)}</strong>${total}</div><div class="chev">›</div></div>`;
}

function wireHome() {
  $('#periodPrev')?.addEventListener('click', () => movePeriod(-1));
  $('#periodNext')?.addEventListener('click', () => movePeriod(1));
  $$('[data-period]').forEach(btn => btn.addEventListener('click', () => { state.ui.periodMode = btn.dataset.period; saveState(); render(); }));
  $('#manualEntry')?.addEventListener('click', openManualModal);
  $('#startOther')?.addEventListener('click', () => openStartModal());
  $('#quickStart')?.addEventListener('click', () => { const s = suggestion(); if (s) startTimer(s.theme, s.sub, s.locationName || '', ''); });
  $('#stopTimer')?.addEventListener('click', beginStop);
  $('#finishPending')?.addEventListener('click', openStopModal);
  $('#startInterruption')?.addEventListener('click', openInterruptionStart);
  $('#stopInterruption')?.addEventListener('click', stopInterruption);
  $('#editActive')?.addEventListener('click', openActiveEdit);
  $$('[data-entry]').forEach(el => el.addEventListener('click', () => openEntryDetail(el.dataset.entry)));
  if (state.timer.status === 'active') {
    const update = () => { const el = $('#timerClock'); if (!el) return; const start = state.timer.interruption?.startISO || state.timer.startISO; el.textContent = durationText(Date.now() - new Date(start).getTime()); };
    update(); timerTick = setInterval(update, 1000);
  }
}

function themeOptions(selectedId = '', allowBlank = false) {
  const items = sortedByUsage(state.themes);
  return `${allowBlank ? '<option value="">Geen thema</option>' : '<option value="">Kies thema</option>'}${items.map(t => `<option value="${t.id}" ${t.id === selectedId ? 'selected' : ''}>${safeText(t.name)}</option>`).join('')}`;
}

function subthemeOptions(themeId, selectedId = '') {
  return `<option value="">Geen subthema</option>${sortedByUsage(state.subthemes.filter(s => s.themeId === themeId)).map(s => `<option value="${s.id}" ${s.id === selectedId ? 'selected' : ''}>${safeText(s.name)}</option>`).join('')}`;
}

function addTheme(rawName) {
  const name = cleanName(rawName); if (!name) return null;
  const existing = state.themes.find(t => t.name.localeCompare(name, 'nl', { sensitivity: 'base' }) === 0); if (existing) return existing;
  const item = { id: uid(), name, usageCount: 0, createdAt: new Date().toISOString() }; state.themes.push(item); saveState(); return item;
}

function addSubtheme(themeId, rawName) {
  const theme = state.themes.find(t => t.id === themeId); const name = cleanName(rawName); if (!theme || !name) return null;
  const existing = state.subthemes.find(s => s.themeId === themeId && s.name.localeCompare(name, 'nl', { sensitivity: 'base' }) === 0); if (existing) return existing;
  const item = { id: uid(), themeId, themeName: theme.name, name, usageCount: 0, createdAt: new Date().toISOString() }; state.subthemes.push(item); saveState(); return item;
}

function addColleague(rawName) {
  const name = cleanName(rawName); if (!name) return null;
  const existing = state.colleagues.find(c => c.name.localeCompare(name, 'nl', { sensitivity: 'base' }) === 0); if (existing) return existing;
  const item = { id: uid(), name, usageCount: 0, createdAt: new Date().toISOString() }; state.colleagues.push(item); saveState(); return item;
}

function openStartModal(prefill = {}) {
  const suggested = suggestion();
  const selectedThemeId = prefill.themeId || suggested?.theme?.id || '';
  const selectedSubId = prefill.subthemeId || suggested?.sub?.id || '';
  openModal(`<div class="modal-head"><h2 id="modalTitle">Start activiteit</h2><button class="close" aria-label="Sluiten">×</button></div><div class="field"><label>Thema</label><select id="startTheme">${themeOptions(selectedThemeId)}</select></div><div class="inline-form"><div class="field"><label>Nieuw thema</label><input id="newThemeStart" placeholder="Naam"></div><button id="addThemeStart" class="btn small">Toevoegen</button></div><div class="field"><label>Subthema</label><select id="startSubtheme">${selectedThemeId ? subthemeOptions(selectedThemeId, selectedSubId) : '<option value="">Kies eerst een thema</option>'}</select></div><div class="inline-form"><div class="field"><label>Nieuw subthema</label><input id="newSubthemeStart" placeholder="Naam"></div><button id="addSubthemeStart" class="btn small">Toevoegen</button></div><div class="field"><label>Locatie (optioneel)</label><input id="startLocation" value="${safeText(prefill.locationName || suggested?.locationName || '')}" placeholder="Bijvoorbeeld kantoor of Amsterdam"></div><div class="field"><label>Notitie (optioneel)</label><textarea id="startNote"></textarea></div><button id="confirmStart" class="btn primary full">Start</button>`);
  const theme = $('#startTheme'); const sub = $('#startSubtheme');
  const refreshSubs = (selected = '') => { sub.innerHTML = theme.value ? subthemeOptions(theme.value, selected) : '<option value="">Kies eerst een thema</option>'; };
  theme.addEventListener('change', () => refreshSubs());
  $('#addThemeStart').addEventListener('click', () => { const t = addTheme($('#newThemeStart').value); if (!t) return; theme.innerHTML = themeOptions(t.id); $('#newThemeStart').value = ''; refreshSubs(); toast('Thema toegevoegd'); });
  $('#addSubthemeStart').addEventListener('click', () => { if (!theme.value) return toast('Kies eerst een thema'); const s = addSubtheme(theme.value, $('#newSubthemeStart').value); if (!s) return; refreshSubs(s.id); $('#newSubthemeStart').value = ''; toast('Subthema toegevoegd'); });
  $('#confirmStart').addEventListener('click', () => { const t = state.themes.find(x => x.id === theme.value); if (!t) return toast('Kies eerst een thema'); const s = state.subthemes.find(x => x.id === sub.value) || null; startTimer(t, s, cleanName($('#startLocation').value), cleanName($('#startNote').value)); closeModal(); });
}

function startTimer(theme, subtheme = null, locationName = '', note = '') {
  theme.usageCount = (theme.usageCount || 0) + 1; if (subtheme) subtheme.usageCount = (subtheme.usageCount || 0) + 1;
  state.timer = { ...defaultTimer(), status: 'active', sessionId: uid(), startISO: new Date().toISOString(), themeId: theme.id, themeName: theme.name, subthemeId: subtheme?.id || null, subthemeName: subtheme?.name || '', locationName, note };
  saveState(); render(); toast('Activiteit gestart');
}

function openActiveEdit() {
  const timer = state.timer; if (timer.status !== 'active' || timer.interruption) return;
  openModal(`<div class="modal-head"><h2 id="modalTitle">Actieve context</h2><button class="close">×</button></div><div class="field"><label>Thema</label><select id="activeTheme">${themeOptions(timer.themeId)}</select></div><div class="field"><label>Subthema</label><select id="activeSub">${subthemeOptions(timer.themeId, timer.subthemeId)}</select></div><div class="field"><label>Locatie</label><input id="activeLocation" value="${safeText(timer.locationName)}"></div><div class="field"><label>Notitie</label><textarea id="activeNote">${safeText(timer.note)}</textarea></div><button id="saveActive" class="btn primary full">Bewaar</button>`);
  $('#activeTheme').addEventListener('change', e => { $('#activeSub').innerHTML = subthemeOptions(e.target.value); });
  $('#saveActive').addEventListener('click', () => { const theme = state.themes.find(t => t.id === $('#activeTheme').value); if (!theme) return; const sub = state.subthemes.find(s => s.id === $('#activeSub').value); Object.assign(state.timer, { themeId: theme.id, themeName: theme.name, subthemeId: sub?.id || null, subthemeName: sub?.name || '', locationName: cleanName($('#activeLocation').value), note: $('#activeNote').value.trim() }); saveState(); closeModal(); render(); toast('Context bijgewerkt'); });
}

function openInterruptionStart() {
  if (state.timer.status !== 'active' || state.timer.interruption) return;
  const top = sortedByUsage(state.colleagues).slice(0, 8);
  openModal(`<div class="modal-head"><h2 id="modalTitle">Tussenstop</h2><button class="close">×</button></div><p class="muted small">Kies eventueel bij wie je meekijkt. Meerdere collega's zijn mogelijk.</p><div id="interruptPeople" class="check-list">${top.map((c,i)=>`<div class="check-row"><input type="checkbox" value="${c.id}" id="ic-${c.id}" ${i===0?'checked':''}><label for="ic-${c.id}">${safeText(c.name)}</label><small>${c.usageCount||0}×</small></div>`).join('') || '<div class="muted small">Nog geen collega\'s bekend.</div>'}</div><div class="inline-form"><div class="field"><label>Andere collega</label><input id="interruptNewColleague" placeholder="Naam"></div><button id="addInterruptColleague" class="btn small">Toevoegen</button></div><div class="field"><label>Afdeling (optioneel)</label><input id="interruptDepartment" placeholder="Bijvoorbeeld Engineering"></div><div class="field"><label>Onderwerp (optioneel)</label><select id="interruptTheme">${themeOptions('', true)}</select></div><div class="field"><label>Subthema</label><select id="interruptSub"><option value="">Geen subthema</option></select></div><div class="field"><label>Locatie (optioneel)</label><input id="interruptLocation" value="${safeText(state.timer.locationName || '')}"></div><button id="confirmInterruption" class="btn primary full">Start tussenstop</button>`);
  const refreshPeople = selected => { const set = new Set(selected); $('#interruptPeople').innerHTML = sortedByUsage(state.colleagues).slice(0, 12).map(c=>`<div class="check-row"><input type="checkbox" value="${c.id}" id="ic-${c.id}" ${set.has(c.id)?'checked':''}><label for="ic-${c.id}">${safeText(c.name)}</label><small>${c.usageCount||0}×</small></div>`).join('') || '<div class="muted small">Nog geen collega\'s bekend.</div>'; };
  $('#interruptTheme').addEventListener('change', e => { $('#interruptSub').innerHTML = e.target.value ? subthemeOptions(e.target.value) : '<option value="">Geen subthema</option>'; });
  $('#addInterruptColleague').addEventListener('click', () => { const selected = $$('#interruptPeople input:checked').map(x=>x.value); const c = addColleague($('#interruptNewColleague').value); if (!c) return; selected.push(c.id); refreshPeople(selected); $('#interruptNewColleague').value=''; toast('Collega toegevoegd'); });
  $('#confirmInterruption').addEventListener('click', () => { const people = $$('#interruptPeople input:checked').map(input => { const c = state.colleagues.find(x => x.id === input.value); if (c) c.usageCount = (c.usageCount || 0) + 1; return c ? { id: c.id, name: c.name } : null; }).filter(Boolean); const theme = state.themes.find(t => t.id === $('#interruptTheme').value); const sub = state.subthemes.find(s => s.id === $('#interruptSub').value); state.timer.interruption = { id: uid(), startISO: new Date().toISOString(), themeId: theme?.id || null, themeName: theme?.name || 'Tussenstop', subthemeId: sub?.id || null, subthemeName: sub?.name || '', departmentName: cleanName($('#interruptDepartment').value), locationName: cleanName($('#interruptLocation').value), people }; saveState(); closeModal(); render(); toast('Tussenstop gestart'); });
}

function stopInterruption() {
  const interruption = state.timer.interruption; if (!interruption) return;
  const endISO = new Date().toISOString(); const actual = actualMinutes(interruption.startISO, endISO); const booked = interruptionBooking(actual); const deduct = interruptionDeduction(actual);
  const entry = normalizeEntry({ id: interruption.id, activityType: 'interruption', parentActivityId: state.timer.sessionId, kind: 'Tussenstop', dateISO: endISO, startISO: interruption.startISO, endISO, themeId: interruption.themeId, themeName: interruption.themeName, subthemeId: interruption.subthemeId, subthemeName: interruption.subthemeName, locationName: interruption.locationName, departmentName: interruption.departmentName, people: interruption.people, actualMinutes: actual, netActualMinutes: actual, roundedMinutes: booked, ownMinutes: booked, colleagueMinutes: 0, totalMinutes: booked, deductMinutes: deduct, roundingSnapshot: { unitMinutes: Number(state.settings.interruptionUnitMinutes), mode: 'up', threshold: 0 }, createdAt: new Date().toISOString() });
  state.entries.push(entry); state.timer.interruption = null; saveState(); render(); toast(`${actual} min tussenstop · ${booked} min geboekt · ${deduct} min afgetrokken`);
}

function calculateParentTimer(timer) {
  const stop = timer.stopISO || new Date().toISOString(); const span = actualMinutes(timer.startISO, stop); const deducted = state.entries.filter(e => e.activityType === 'interruption' && e.parentActivityId === timer.sessionId).reduce((sum,e)=>sum+(Number(e.deductMinutes)||0),0); const net = Math.max(1, span - deducted); const booked = roundByRule(net); return { span, deducted, net, booked };
}

function beginStop() {
  if (state.timer.status !== 'active') return; if (state.timer.interruption) return toast('Beëindig eerst de tussenstop'); state.timer.status = 'pending'; state.timer.stopISO = new Date().toISOString(); saveState(); render(); openStopModal();
}

function colleagueSection(ownMinutes, prefix) {
  const colleagues = sortedByUsage(state.colleagues);
  return `<div class="settings-section"><h3>Collega-inzet</h3><div id="${prefix}ColleagueList" class="check-list">${colleagues.map(c=>`<div class="check-row"><input type="checkbox" id="${prefix}c-${c.id}" value="${c.id}" class="${prefix}col-check"><label for="${prefix}c-${c.id}">${safeText(c.name)}</label><small>${c.usageCount||0}×</small></div>`).join('') || '<p class="muted small">Geen collega\'s.</p>'}</div><div class="inline-form"><div class="field"><label>Nieuwe collega</label><input id="${prefix}NewColleague"></div><button id="${prefix}AddColleague" class="btn small">Toevoegen</button></div><div id="${prefix}ColleagueTimes" style="display:none"><div class="field"><label>Verdeling</label><select id="${prefix}Mode"><option value="same">Zelfde als mijn geboekte tijd</option><option value="common">Eén tijd voor iedereen</option><option value="individual">Per collega</option></select></div><div id="${prefix}CommonWrap" class="field" style="display:none"><label>Minuten per collega</label><input id="${prefix}CommonMinutes" type="number" min="0" value="${ownMinutes}"></div><div id="${prefix}IndividualWrap" style="display:none"></div></div></div>`;
}

function wireColleagueSection(prefix, ownMinutes) {
  const list = $(`#${prefix}ColleagueList`), times = $(`#${prefix}ColleagueTimes`), mode = $(`#${prefix}Mode`), commonWrap = $(`#${prefix}CommonWrap`), individualWrap = $(`#${prefix}IndividualWrap`);
  const selectedIds = () => $$(`.${prefix}col-check`, list).filter(x=>x.checked).map(x=>x.value);
  const renderIndividual = () => { individualWrap.innerHTML = selectedIds().map(id => { const c=state.colleagues.find(x=>x.id===id); return `<div class="field"><label>${safeText(c?.name||'')}</label><input class="${prefix}individual" data-id="${id}" type="number" min="0" value="${ownMinutes}"></div>`; }).join(''); };
  const refresh = () => { const ids=selectedIds(); times.style.display=ids.length?'':'none'; commonWrap.style.display=ids.length&&mode.value==='common'?'':'none'; individualWrap.style.display=ids.length&&mode.value==='individual'?'':'none'; if(mode.value==='individual')renderIndividual(); };
  list.addEventListener('change', refresh); mode.addEventListener('change', refresh);
  $(`#${prefix}AddColleague`).addEventListener('click',()=>{const selected=new Set(selectedIds());const c=addColleague($(`#${prefix}NewColleague`).value);if(!c)return;selected.add(c.id);list.innerHTML=sortedByUsage(state.colleagues).map(x=>`<div class="check-row"><input type="checkbox" id="${prefix}c-${x.id}" value="${x.id}" class="${prefix}col-check" ${selected.has(x.id)?'checked':''}><label for="${prefix}c-${x.id}">${safeText(x.name)}</label></div>`).join('');$(`#${prefix}NewColleague`).value='';refresh();});
  refresh();
  return () => { const ids=selectedIds(); const modeValue=mode.value; const common=Math.max(0,Number($(`#${prefix}CommonMinutes`)?.value||ownMinutes)); return ids.map(id=>{const c=state.colleagues.find(x=>x.id===id);let minutes=ownMinutes;if(modeValue==='common')minutes=common;if(modeValue==='individual')minutes=Math.max(0,Number($(`.${prefix}individual[data-id="${id}"]`)?.value||ownMinutes));return{colleagueId:id,colleagueName:c?.name||'',minutes:Math.round(minutes)};}); };
}

function openStopModal() {
  const timer = state.timer; if (timer.status !== 'pending') return; const calc = calculateParentTimer(timer);
  openModal(`<div class="modal-head"><h2 id="modalTitle">Boeking afronden</h2><button class="close">×</button></div><div class="detail-grid"><div class="detail-item"><span>Werkelijke periode</span><strong>${clockMinutes(calc.span)}</strong></div><div class="detail-item"><span>Tussenstops afgetrokken</span><strong>${clockMinutes(calc.deducted)}</strong></div><div class="detail-item"><span>Netto werkelijke tijd</span><strong>${clockMinutes(calc.net)}</strong></div><div class="detail-item"><span>Te boeken</span><strong>${displayMinutes(calc.booked)}</strong></div></div>${colleagueSection(calc.booked,'stop')}<button id="saveStop" class="btn primary full">Opslaan</button>`);
  const getAllocations = wireColleagueSection('stop', calc.booked);
  $('#saveStop').addEventListener('click', () => { const allocations = getAllocations(); allocations.forEach(a=>{const c=state.colleagues.find(x=>x.id===a.colleagueId);if(c)c.usageCount=(c.usageCount||0)+1;}); const colleagueMinutes=allocations.reduce((s,x)=>s+x.minutes,0); const entry = normalizeEntry({ id: timer.sessionId, activityType:'normal', parentActivityId:null, kind:'Stopwatch', dateISO:timer.stopISO, themeId:timer.themeId,themeName:timer.themeName,subthemeId:timer.subthemeId,subthemeName:timer.subthemeName, locationName:timer.locationName,note:timer.note,startISO:timer.startISO,endISO:timer.stopISO, actualMinutes:calc.span,netActualMinutes:calc.net,deductedInterruptionMinutes:calc.deducted, roundedMinutes:calc.booked,ownMinutes:calc.booked,colleagueMinutes,totalMinutes:calc.booked+colleagueMinutes, allocations,roundingSnapshot:roundingSnapshot(),createdAt:new Date().toISOString() }); state.entries.push(entry); state.timer=defaultTimer(); saveState(); closeModal(); render(); toast('Activiteit opgeslagen'); });
}

function openManualModal() {
  const defaultMinutes = 60; const s = suggestion();
  openModal(`<div class="modal-head"><h2 id="modalTitle">Activiteit toevoegen</h2><button class="close">×</button></div><div class="field"><label>Thema</label><select id="manualTheme">${themeOptions(s?.theme?.id||'')}</select></div><div class="inline-form"><div class="field"><label>Nieuw thema</label><input id="manualNewTheme"></div><button id="manualAddTheme" class="btn small">Toevoegen</button></div><div class="field"><label>Subthema</label><select id="manualSub">${s?.theme ? subthemeOptions(s.theme.id,s.sub?.id||'') : '<option value="">Geen subthema</option>'}</select></div><div class="field"><label>Datum</label><input id="manualDate" type="date" value="${dateInputValue()}"></div><div class="field"><label>Werkelijke minuten</label><input id="manualMinutes" type="number" min="1" value="${defaultMinutes}"></div><div id="manualPreview" class="hint">Te boeken: ${displayMinutes(roundByRule(defaultMinutes))}</div><div class="field"><label>Locatie (optioneel)</label><input id="manualLocation" value="${safeText(s?.locationName||'')}"></div><div class="field"><label>Notitie</label><textarea id="manualNote"></textarea></div><div id="manualColleagueHost">${colleagueSection(roundByRule(defaultMinutes),'manual')}</div><button id="saveManual" class="btn primary full">Opslaan</button>`);
  const theme=$('#manualTheme'),sub=$('#manualSub'),minutes=$('#manualMinutes'); let getAllocations=wireColleagueSection('manual',roundByRule(defaultMinutes));
  theme.addEventListener('change',()=>{sub.innerHTML=subthemeOptions(theme.value);});
  $('#manualAddTheme').addEventListener('click',()=>{const t=addTheme($('#manualNewTheme').value);if(!t)return;theme.innerHTML=themeOptions(t.id);sub.innerHTML=subthemeOptions(t.id);$('#manualNewTheme').value='';});
  const rebuild=()=>{const own=roundByRule(Math.max(1,Number(minutes.value)||1));$('#manualPreview').textContent=`Te boeken: ${displayMinutes(own)}`;$('#manualColleagueHost').innerHTML=colleagueSection(own,'manual');getAllocations=wireColleagueSection('manual',own);}; minutes.addEventListener('input',rebuild);
  $('#saveManual').addEventListener('click',()=>{ const t=state.themes.find(x=>x.id===theme.value);if(!t)return toast('Kies een thema');const st=state.subthemes.find(x=>x.id===sub.value);const actual=Math.max(1,Number(minutes.value)||1);const own=roundByRule(actual);const allocations=getAllocations();const colleagueMinutes=allocations.reduce((s,x)=>s+x.minutes,0);const dateISO=new Date(`${$('#manualDate').value}T12:00:00`).toISOString(); t.usageCount=(t.usageCount||0)+1;if(st)st.usageCount=(st.usageCount||0)+1;allocations.forEach(a=>{const c=state.colleagues.find(x=>x.id===a.colleagueId);if(c)c.usageCount=(c.usageCount||0)+1;}); state.entries.push(normalizeEntry({id:uid(),activityType:'normal',kind:'Handmatig',dateISO,themeId:t.id,themeName:t.name,subthemeId:st?.id||null,subthemeName:st?.name||'',startISO:null,endISO:null,actualMinutes:actual,netActualMinutes:actual,roundedMinutes:own,ownMinutes:own,colleagueMinutes,totalMinutes:own+colleagueMinutes,allocations,locationName:cleanName($('#manualLocation').value),note:$('#manualNote').value.trim(),roundingSnapshot:roundingSnapshot(),createdAt:new Date().toISOString()})); saveState();closeModal();render();toast('Activiteit toegevoegd'); });
}

function openEntryDetail(entryId) {
  const e=state.entries.find(x=>x.id===entryId);if(!e)return; const children=state.entries.filter(x=>x.parentActivityId===e.id);
  openModal(`<div class="modal-head"><h2 id="modalTitle">${e.activityType==='interruption'?'Tussenstop':'Registratie'}</h2><button class="close">×</button></div><div class="detail-hero"><div class="kicker">${safeText(e.kind||'Activiteit')}</div><h2>${safeText(e.themeName||'Activiteit')}</h2>${e.subthemeName?`<div class="muted">${safeText(e.subthemeName)}</div>`:''}</div><div class="detail-grid"><div class="detail-item"><span>Werkelijk</span><strong>${clockMinutes(e.actualMinutes)}</strong></div><div class="detail-item"><span>Geboekt</span><strong>${displayMinutes(e.ownMinutes)}</strong></div>${e.deductedInterruptionMinutes?`<div class="detail-item"><span>Aftrek tussenstops</span><strong>${clockMinutes(e.deductedInterruptionMinutes)}</strong></div>`:''}${e.activityType==='interruption'?`<div class="detail-item"><span>Aftrek hoofdactiviteit</span><strong>${clockMinutes(e.deductMinutes)}</strong></div>`:''}<div class="detail-item"><span>Collega-inzet</span><strong>${displayMinutes(e.colleagueMinutes)}</strong></div><div class="detail-item"><span>Totale inzet</span><strong>${displayMinutes(e.totalMinutes)}</strong></div></div><div class="settings-section"><h3>Informatie</h3><div class="list"><div class="entry"><div class="entry-main"><strong>Datum</strong><small>${dateText(e.dateISO)}</small></div></div>${e.startISO?`<div class="entry"><div class="entry-main"><strong>Tijd</strong><small>${timeText(e.startISO)}–${timeText(e.endISO)}</small></div></div>`:''}${e.locationName?`<div class="entry"><div class="entry-main"><strong>Locatie</strong><small>${safeText(e.locationName)}</small></div></div>`:''}${e.departmentName?`<div class="entry"><div class="entry-main"><strong>Afdeling</strong><small>${safeText(e.departmentName)}</small></div></div>`:''}${e.people?.length?`<div class="entry"><div class="entry-main"><strong>Bij / met</strong><small>${safeText(e.people.map(p=>p.name).join(', '))}</small></div></div>`:''}${e.note?`<div class="entry"><div class="entry-main"><strong>Notitie</strong><small>${safeText(e.note)}</small></div></div>`:''}</div></div>${children.length?`<div class="settings-section"><h3>Tussenstops</h3><div class="list">${children.map(c=>entryRow(c,true)).join('')}</div></div>`:''}<div class="row"><button id="editEntry" class="btn primary">Wijzigen</button><button id="deleteEntry" class="btn danger">Verwijderen</button></div>`);
  $$('[data-entry]').forEach(el=>el.addEventListener('click',()=>openEntryDetail(el.dataset.entry))); $('#editEntry').addEventListener('click',()=>openEntryEdit(entryId)); $('#deleteEntry').addEventListener('click',()=>{ const childCount=state.entries.filter(x=>x.parentActivityId===entryId).length; const msg=childCount?`Deze registratie en ${childCount} gekoppelde tussenstop(s) verwijderen?`:'Deze registratie verwijderen?'; if(!confirm(msg))return; state.entries=state.entries.filter(x=>x.id!==entryId&&x.parentActivityId!==entryId);saveState();closeModal();render();toast('Registratie verwijderd'); });
}

function openEntryEdit(entryId) {
  const e=state.entries.find(x=>x.id===entryId);if(!e)return; const isManual=!e.startISO||!e.endISO;
  openModal(`<div class="modal-head"><h2 id="modalTitle">Registratie wijzigen</h2><button class="close">×</button></div><div class="field"><label>Thema</label><select id="editTheme">${themeOptions(e.themeId,e.activityType==='interruption')}</select></div><div class="field"><label>Subthema</label><select id="editSub">${e.themeId?subthemeOptions(e.themeId,e.subthemeId):'<option value="">Geen subthema</option>'}</select></div>${isManual?`<div class="field"><label>Datum</label><input id="editDate" type="date" value="${dateInputValue(new Date(e.dateISO))}"></div><div class="field"><label>Werkelijke minuten</label><input id="editMinutes" type="number" min="1" value="${e.actualMinutes}"></div>`:`<div class="field"><label>Start</label><input id="editStart" type="datetime-local" value="${localDateTimeInput(e.startISO)}"></div><div class="field"><label>Einde</label><input id="editEnd" type="datetime-local" value="${localDateTimeInput(e.endISO)}"></div>`}<div class="field"><label>Locatie</label><input id="editLocation" value="${safeText(e.locationName||'')}"></div>${e.activityType==='interruption'?`<div class="field"><label>Afdeling</label><input id="editDepartment" value="${safeText(e.departmentName||'')}"></div>`:''}<div class="field"><label>Notitie</label><textarea id="editNote">${safeText(e.note||'')}</textarea></div><p class="hint">Collega-inzet blijft bij deze wijziging gelijk. Tijd en totalen worden automatisch opnieuw berekend.</p><button id="saveEdit" class="btn primary full">Bewaar wijzigingen</button>`);
  $('#editTheme').addEventListener('change',ev=>{$('#editSub').innerHTML=ev.target.value?subthemeOptions(ev.target.value):'<option value="">Geen subthema</option>';});
  $('#saveEdit').addEventListener('click',()=>{ const theme=state.themes.find(t=>t.id===$('#editTheme').value);const sub=state.subthemes.find(s=>s.id===$('#editSub').value); e.themeId=theme?.id||null;e.themeName=theme?.name||(e.activityType==='interruption'?'Tussenstop':'Activiteit');e.subthemeId=sub?.id||null;e.subthemeName=sub?.name||'';e.locationName=cleanName($('#editLocation').value);e.note=$('#editNote').value.trim();if(e.activityType==='interruption')e.departmentName=cleanName($('#editDepartment').value); if(isManual){const actual=Math.max(1,Number($('#editMinutes').value)||1);e.dateISO=new Date(`${$('#editDate').value}T12:00:00`).toISOString();e.actualMinutes=actual;e.netActualMinutes=actual;e.roundedMinutes=roundByRule(actual);e.ownMinutes=e.roundedMinutes;} else{const start=new Date($('#editStart').value);const end=new Date($('#editEnd').value);if(!(end>start))return toast('Eindtijd moet na starttijd liggen');e.startISO=start.toISOString();e.endISO=end.toISOString();e.dateISO=e.endISO;e.actualMinutes=actualMinutes(e.startISO,e.endISO);if(e.activityType==='interruption'){e.netActualMinutes=e.actualMinutes;e.roundedMinutes=interruptionBooking(e.actualMinutes);e.ownMinutes=e.roundedMinutes;e.deductMinutes=interruptionDeduction(e.actualMinutes);}else{recalculateNormalEntry(e);}} e.totalMinutes=(Number(e.ownMinutes)||0)+(Number(e.colleagueMinutes)||0);if(e.parentActivityId){const parent=state.entries.find(x=>x.id===e.parentActivityId);if(parent)recalculateNormalEntry(parent);}saveState();closeModal();render();toast('Registratie bijgewerkt'); });
}

function recalculateNormalEntry(entry) {
  if (!entry.startISO || !entry.endISO) return; const span=actualMinutes(entry.startISO,entry.endISO);const deducted=state.entries.filter(x=>x.activityType==='interruption'&&x.parentActivityId===entry.id).reduce((s,x)=>s+(Number(x.deductMinutes)||0),0);const net=Math.max(1,span-deducted);const booked=roundByRule(net); entry.actualMinutes=span;entry.netActualMinutes=net;entry.deductedInterruptionMinutes=deducted;entry.roundedMinutes=booked;entry.ownMinutes=booked;entry.totalMinutes=booked+(Number(entry.colleagueMinutes)||0);
}

function settingsAccordion(title, subtitle, body) {
  return `<details class="settings-accordion"><summary><span class="settings-accordion-title"><strong>${safeText(title)}</strong><small>${safeText(subtitle)}</small></span><span class="settings-accordion-arrow">›</span></summary><div class="settings-accordion-body">${body}</div></details>`;
}

function openSettings() {
  const timeBody = `<div class="field"><label>Weergave</label><select id="timeDisplay"><option value="decimal" ${state.settings.timeDisplay==='decimal'?'selected':''}>Decimale uren (1,25)</option><option value="clock" ${state.settings.timeDisplay==='clock'?'selected':''}>Uren:minuten (1:15)</option></select></div><div class="field"><label>Afronding</label><select id="roundMode"><option value="none" ${state.settings.roundingMode==='none'?'selected':''}>Geen afronding</option><option value="up" ${state.settings.roundingMode==='up'?'selected':''}>Altijd omhoog</option><option value="threshold" ${state.settings.roundingMode==='threshold'?'selected':''}>Vanaf drempel omhoog</option></select></div><div class="field"><label>Tijdseenheid</label><select id="roundUnit">${ROUNDING_UNITS.map(x=>`<option value="${x}" ${Number(state.settings.roundingUnitMinutes)===x?'selected':''}>${x} min · ${decimalHours(x)} uur</option>`).join('')}</select></div><div class="field"><label>Drempel</label><select id="roundThreshold">${[.25,.5,.75].map(x=>`<option value="${x}" ${Number(state.settings.roundingThreshold)===x?'selected':''}>${Math.round(x*100)}%</option>`).join('')}</select></div>`;
  const controlBody = `<div class="check-row settings-toggle-row"><input id="swipeDeleteEnabled" type="checkbox" ${state.settings.swipeDeleteEnabled!==false?'checked':''}><label for="swipeDeleteEnabled"><strong>Verwijderen met swipe</strong><small>Bewerken met swipe blijft altijd mogelijk. Verder vegen kan verwijderen na bevestiging.</small></label></div>`;
  const interruptionBody = `<p class="muted small">Tussenstops worden altijd omhoog afgerond. Aftrek van de hoofdactiviteit wordt altijd omlaag afgerond.</p><div class="field"><label>Eenheid tussenstop</label><select id="interruptUnit">${ROUNDING_UNITS.map(x=>`<option value="${x}" ${Number(state.settings.interruptionUnitMinutes)===x?'selected':''}>${x} minuten</option>`).join('')}</select></div><div class="field"><label>Hoofdactiviteit aftrekken vanaf</label><select id="interruptThreshold">${[5,10,15,30,45,60].map(x=>`<option value="${x}" ${Number(state.settings.interruptionDeductAfterMinutes)===x?'selected':''}>${x} minuten</option>`).join('')}</select></div>`;
  const themeBody = `<div class="settings-list">${sortedByUsage(state.themes).map(t=>`<div class="settings-list-row"><div class="entry-main"><strong>${safeText(t.name)}</strong><small>${t.usageCount||0}× gebruikt</small></div><button class="settings-row-action" data-submanage="${t.id}">Subthema's</button></div>`).join('')||'<p class="muted small">Nog geen thema\'s.</p>'}</div><div class="inline-form"><div class="field"><label>Nieuw thema</label><input id="settingsNewTheme"></div><button id="settingsAddTheme" class="btn small">Toevoegen</button></div>`;
  const colleagueBody = `<div class="settings-list">${sortedByUsage(state.colleagues).map(c=>`<div class="settings-list-row"><div class="entry-main"><strong>${safeText(c.name)}</strong><small>${c.usageCount||0}× gebruikt</small></div><button class="settings-row-action danger" data-delete-colleague="${c.id}">Wis</button></div>`).join('')||'<p class="muted small">Nog geen collega\'s.</p>'}</div><div class="inline-form"><div class="field"><label>Nieuwe collega</label><input id="settingsNewColleague"></div><button id="settingsAddColleague" class="btn small">Toevoegen</button></div>`;
  const backupBody = `<div class="row"><button id="exportData" class="btn">Back-up maken</button><label class="btn" style="text-align:center">Back-up herstellen<input id="importData" type="file" accept="application/json,.json" hidden></label></div><button id="resetData" class="settings-danger-action">Wis alle gegevens</button>`;
  openModal(`<div class="modal-head settings-modal-head"><div><div class="kicker">Beheer</div><h2 id="modalTitle">Instellingen</h2></div><button class="close">×</button></div><p class="settings-autosave">Wijzigingen worden automatisch opgeslagen.</p>${settingsAccordion('Tijd en afronding', `${displayMinutes(state.settings.roundingUnitMinutes)} · ${state.settings.roundingMode==='none'?'geen afronding':'afronding actief'}`, timeBody)}${settingsAccordion('Bediening', 'Swipe en verwijderen', controlBody)}${settingsAccordion('Tussenstops', `${state.settings.interruptionUnitMinutes} minuten`, interruptionBody)}${settingsAccordion("Thema's", `${state.themes.length} opgeslagen`, themeBody)}${settingsAccordion("Collega's", `${state.colleagues.length} opgeslagen`, colleagueBody)}${settingsAccordion('Data & back-up', 'Exporteren, herstellen en wissen', backupBody)}`);
  $('#swipeDeleteEnabled')?.addEventListener('change',event=>{state.settings.swipeDeleteEnabled=event.target.checked;saveState();toast('Instelling bewaard');});
  const saveSettings=()=>{state.settings.timeDisplay=$('#timeDisplay').value;state.settings.roundingMode=$('#roundMode').value;state.settings.roundingUnitMinutes=Number($('#roundUnit').value);state.settings.roundingThreshold=Number($('#roundThreshold').value);state.settings.interruptionUnitMinutes=Number($('#interruptUnit').value);state.settings.interruptionDeductAfterMinutes=Number($('#interruptThreshold').value);saveState();};
  ['timeDisplay','roundMode','roundUnit','roundThreshold','interruptUnit','interruptThreshold'].forEach(id=>$('#'+id).addEventListener('change',()=>{saveSettings();toast('Instelling bewaard');})); $('#settingsAddTheme').addEventListener('click',()=>{if(addTheme($('#settingsNewTheme').value)){openSettings();toast('Thema toegevoegd');}}); $('#settingsAddColleague').addEventListener('click',()=>{if(addColleague($('#settingsNewColleague').value)){openSettings();toast('Collega toegevoegd');}}); $$('[data-submanage]').forEach(btn=>btn.addEventListener('click',()=>openSubthemeManage(btn.dataset.submanage))); $$('[data-delete-colleague]').forEach(btn=>btn.addEventListener('click',()=>{const c=state.colleagues.find(x=>x.id===btn.dataset.deleteColleague);if(c&&confirm(`Collega "${c.name}" uit beheer verwijderen?`)){state.colleagues=state.colleagues.filter(x=>x.id!==c.id);saveState();openSettings();}})); $('#exportData').addEventListener('click',exportBackup);$('#importData').addEventListener('change',importBackup);$('#resetData').addEventListener('click',resetAll);
}

function openSubthemeManage(themeId) {
  const theme=state.themes.find(t=>t.id===themeId);if(!theme)return; const subs=sortedByUsage(state.subthemes.filter(s=>s.themeId===themeId)); openModal(`<div class="modal-head"><h2 id="modalTitle">${safeText(theme.name)}</h2><button class="close">×</button></div><div class="list">${subs.map(s=>`<div class="entry"><div class="entry-main"><strong>${safeText(s.name)}</strong><small>${s.usageCount||0}× gebruikt</small></div><button class="btn small danger" data-del-sub="${s.id}">Wis</button></div>`).join('')||'<p class="muted small">Nog geen subthema\'s.</p>'}</div><div class="inline-form"><div class="field"><label>Nieuw subthema</label><input id="newSubManage"></div><button id="addSubManage" class="btn small">Toevoegen</button></div><button id="backSettings" class="btn ghost full">Terug naar instellingen</button>`); $('#addSubManage').addEventListener('click',()=>{if(addSubtheme(themeId,$('#newSubManage').value)){openSubthemeManage(themeId);toast('Subthema toegevoegd');}});$$('[data-del-sub]').forEach(btn=>btn.addEventListener('click',()=>{state.subthemes=state.subthemes.filter(s=>s.id!==btn.dataset.delSub);saveState();openSubthemeManage(themeId);}));$('#backSettings').addEventListener('click',openSettings);
}

function exportBackup() {
  const payload=JSON.stringify({...state,exportedAt:new Date().toISOString()},null,2);const blob=new Blob([payload],{type:'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`urenregistratie-backup-${dateInputValue()}.json`;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);toast('Backup aangemaakt');
}

function importBackup(event) {
  const file=event.target.files?.[0];if(!file)return;const reader=new FileReader();reader.onload=()=>{try{const parsed=JSON.parse(String(reader.result));if(!Array.isArray(parsed.entries)||!Array.isArray(parsed.themes))throw new Error('formaat');if(!confirm('Huidige gegevens vervangen door deze backup?'))return;localStorage.setItem(STORAGE_KEY,JSON.stringify(parsed));state=loadState();closeModal();render();toast('Backup hersteld');}catch{alert('Dit bestand is geen geldige Urenregistratie-backup.');}finally{event.target.value='';}};reader.readAsText(file);
}

function resetAll() {
  if(!confirm('Alle urenregistratiegegevens wissen?'))return;if(!confirm('Dit kan niet ongedaan worden gemaakt zonder backup.'))return;state=defaultState();saveState();closeModal();render();toast('Alle gegevens gewist');
}

function registerServiceWorker() {
  if('serviceWorker'in navigator)navigator.serviceWorker.register('./sw.js').catch(err=>console.warn('Service worker niet actief',err));
}

function init() {
  $('#openSettings').addEventListener('click',openSettings); $('#modalBackdrop').addEventListener('click',event=>{if(event.target===$('#modalBackdrop'))closeModal();}); render();registerServiceWorker();
}

document.addEventListener('DOMContentLoaded',init);
