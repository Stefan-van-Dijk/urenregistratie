'use strict';

const STORAGE_KEY = 'urenregistratie.pwa.v1';

const defaultState = () => ({
  version: 1,
  settings: { roundingMinutes: 15 },
  timer: {
    status: 'inactive',
    startISO: null,
    stopISO: null,
    themeId: null,
    themeName: '',
    subthemeId: null,
    subthemeName: '',
    startNewAfterSave: false
  },
  themes: [],
  subthemes: [],
  colleagues: [],
  entries: []
});

let state = loadState();
let currentTab = 'timer';
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
    return {
      ...base,
      ...parsed,
      settings: { ...base.settings, ...(parsed.settings || {}) },
      timer: { ...base.timer, ...(parsed.timer || {}) },
      themes: Array.isArray(parsed.themes) ? parsed.themes : [],
      subthemes: Array.isArray(parsed.subthemes) ? parsed.subthemes : [],
      colleagues: Array.isArray(parsed.colleagues) ? parsed.colleagues : [],
      entries: Array.isArray(parsed.entries) ? parsed.entries : []
    };
  } catch (error) {
    console.error('Kan opslag niet lezen', error);
    return defaultState();
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function safeText(value) {
  return String(value ?? '').replace(/[&<>'"]/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  }[char]));
}

function cleanName(value) {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

function sortedByUsage(items) {
  return [...items].sort((a, b) => (b.usageCount || 0) - (a.usageCount || 0) || a.name.localeCompare(b.name, 'nl', { sensitivity: 'base' }));
}

function roundMinutes(minutes) {
  const block = Number(state.settings.roundingMinutes) || 15;
  const safe = Math.max(1, Math.ceil(Number(minutes) || 0));
  return Math.max(block, Math.ceil(safe / block) * block);
}

function actualMinutes(startISO, stopISO) {
  const start = new Date(startISO).getTime();
  const stop = new Date(stopISO).getTime();
  return Math.max(1, Math.ceil(Math.max(0, stop - start) / 60000));
}

function hours(minutes) {
  return new Intl.NumberFormat('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format((Number(minutes) || 0) / 60);
}

function dateText(value) {
  return new Intl.DateTimeFormat('nl-NL', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(value));
}

function timeText(value) {
  if (!value) return '-';
  return new Intl.DateTimeFormat('nl-NL', { hour: '2-digit', minute: '2-digit' }).format(new Date(value));
}

function dateInputValue(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function durationText(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = String(Math.floor(total / 3600)).padStart(2, '0');
  const m = String(Math.floor((total % 3600) / 60)).padStart(2, '0');
  const s = String(total % 60).padStart(2, '0');
  return `${h}:${m}:${s}`;
}

function toast(message) {
  const el = $('#toast');
  el.textContent = message;
  el.classList.remove('hidden');
  clearTimeout(el._timeout);
  el._timeout = setTimeout(() => el.classList.add('hidden'), 2400);
}

function setTab(tab) {
  currentTab = tab;
  $$('.tab').forEach(btn => btn.classList.toggle('is-active', btn.dataset.tab === tab));
  render();
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

function render() {
  clearInterval(timerTick);
  timerTick = null;
  if (currentTab === 'timer') renderTimer();
  if (currentTab === 'entries') renderEntries();
  if (currentTab === 'insights') renderInsights();
  if (currentTab === 'manage') renderManage();
}

function renderTimer() {
  const main = $('#main');
  const timer = state.timer;

  if (timer.status === 'active') {
    main.innerHTML = `
      <section class="card hero">
        <div class="pill">Actieve stopwatch</div>
        <h2>${safeText(timer.themeName)}</h2>
        ${timer.subthemeName ? `<p class="muted">${safeText(timer.subthemeName)}</p>` : ''}
        <div id="timerClock" class="timer-clock">00:00:00</div>
        <p class="muted small">Afronding naar boven per ${state.settings.roundingMinutes} minuten</p>
        <div class="btn-row two">
          <button id="stopTimer" class="btn danger">Stop stopwatch</button>
          <button id="stopAndNew" class="btn">Stop en nieuwe taak</button>
        </div>
      </section>
    `;
    const update = () => {
      const el = $('#timerClock');
      if (el) el.textContent = durationText(Date.now() - new Date(timer.startISO).getTime());
    };
    update();
    timerTick = setInterval(update, 1000);
    $('#stopTimer').addEventListener('click', () => beginStop(false));
    $('#stopAndNew').addEventListener('click', () => beginStop(true));
    return;
  }

  if (timer.status === 'pending') {
    const actual = actualMinutes(timer.startISO, timer.stopISO);
    const rounded = roundMinutes(actual);
    main.innerHTML = `
      <section class="card hero">
        <div class="hero-symbol">!</div>
        <h2>Boeking wacht op afronding</h2>
        <p><strong>${safeText(timer.themeName)}</strong>${timer.subthemeName ? ` - ${safeText(timer.subthemeName)}` : ''}</p>
        <p class="muted">${timeText(timer.startISO)} - ${timeText(timer.stopISO)} | ${actual} min werkelijk | ${rounded} min afgerond</p>
        <button id="finishPending" class="btn primary">Boeking afronden</button>
      </section>
    `;
    $('#finishPending').addEventListener('click', openStopModal);
    return;
  }

  main.innerHTML = `
    <section class="card hero">
      <div class="hero-symbol">◷</div>
      <h2>Geen actieve stopwatch</h2>
      <p class="muted">Start een taak of boek uren achteraf.</p>
      <div class="btn-row two">
        <button id="startTimer" class="btn primary">Start stopwatch</button>
        <button id="manualEntry" class="btn">Uren achteraf invoeren</button>
      </div>
    </section>
    <section class="card flat">
      <div class="card-title"><h3>Vandaag</h3><span class="pill">${todayEntries().length} registraties</span></div>
      <div class="grid-2">
        <div class="summary"><div class="muted small">Eigen uren</div><div class="value">${hours(todayEntries().reduce((s,e)=>s+e.ownMinutes,0))}</div></div>
        <div class="summary"><div class="muted small">Totale inzet</div><div class="value">${hours(todayEntries().reduce((s,e)=>s+e.totalMinutes,0))}</div></div>
      </div>
    </section>
  `;
  $('#startTimer').addEventListener('click', openStartModal);
  $('#manualEntry').addEventListener('click', openManualModal);
}

function todayEntries() {
  const key = dateInputValue(new Date());
  return state.entries.filter(e => dateInputValue(new Date(e.dateISO)) === key);
}

function beginStop(startNewAfterSave) {
  state.timer.status = 'pending';
  state.timer.stopISO = new Date().toISOString();
  state.timer.startNewAfterSave = !!startNewAfterSave;
  saveState();
  renderTimer();
  openStopModal();
}

function themeOptions(selectedId = '') {
  const items = sortedByUsage(state.themes);
  return `<option value="">Kies thema</option>` + items.map(t => `<option value="${t.id}" ${t.id === selectedId ? 'selected' : ''}>${safeText(t.name)}${t.usageCount ? ` (${t.usageCount})` : ''}</option>`).join('');
}

function subthemeOptions(themeId, selectedId = '') {
  const items = sortedByUsage(state.subthemes.filter(s => s.themeId === themeId));
  return `<option value="">Geen subthema</option>` + items.map(s => `<option value="${s.id}" ${s.id === selectedId ? 'selected' : ''}>${safeText(s.name)}${s.usageCount ? ` (${s.usageCount})` : ''}</option>`).join('');
}

function openStartModal() {
  openModal(`
    <div class="modal-head"><h2 id="modalTitle">Nieuwe stopwatch</h2><button class="close" aria-label="Sluiten">x</button></div>
    <div class="field"><label for="startTheme">Thema</label><select id="startTheme">${themeOptions()}</select></div>
    <div class="inline-form">
      <div class="field"><label for="newThemeStart">Nieuw thema</label><input id="newThemeStart" placeholder="Naam thema"></div>
      <button id="addThemeStart" class="btn small">Voeg toe</button>
    </div>
    <div class="field"><label for="startSubtheme">Subthema</label><select id="startSubtheme" disabled><option value="">Kies eerst een thema</option></select></div>
    <div class="inline-form">
      <div class="field"><label for="newSubthemeStart">Nieuw subthema</label><input id="newSubthemeStart" placeholder="Naam subthema" disabled></div>
      <button id="addSubthemeStart" class="btn small" disabled>Voeg toe</button>
    </div>
    <div class="section"><button id="confirmStart" class="btn primary" style="width:100%">Start stopwatch</button></div>
  `);

  const themeSelect = $('#startTheme');
  const subSelect = $('#startSubtheme');
  const newSub = $('#newSubthemeStart');
  const addSub = $('#addSubthemeStart');

  const refreshSubs = () => {
    const themeId = themeSelect.value;
    subSelect.disabled = !themeId;
    newSub.disabled = !themeId;
    addSub.disabled = !themeId;
    subSelect.innerHTML = themeId ? subthemeOptions(themeId) : '<option value="">Kies eerst een thema</option>';
  };

  themeSelect.addEventListener('change', refreshSubs);

  $('#addThemeStart').addEventListener('click', () => {
    const theme = addTheme($('#newThemeStart').value);
    if (!theme) return;
    themeSelect.innerHTML = themeOptions(theme.id);
    $('#newThemeStart').value = '';
    refreshSubs();
    toast('Thema toegevoegd');
  });

  addSub.addEventListener('click', () => {
    const sub = addSubtheme(themeSelect.value, newSub.value);
    if (!sub) return;
    subSelect.innerHTML = subthemeOptions(themeSelect.value, sub.id);
    newSub.value = '';
    toast('Subthema toegevoegd');
  });

  $('#confirmStart').addEventListener('click', () => {
    const theme = state.themes.find(t => t.id === themeSelect.value);
    if (!theme) return toast('Kies eerst een thema');
    const sub = state.subthemes.find(s => s.id === subSelect.value);
    theme.usageCount = (theme.usageCount || 0) + 1;
    if (sub) sub.usageCount = (sub.usageCount || 0) + 1;
    state.timer = {
      status: 'active',
      startISO: new Date().toISOString(),
      stopISO: null,
      themeId: theme.id,
      themeName: theme.name,
      subthemeId: sub?.id || null,
      subthemeName: sub?.name || '',
      startNewAfterSave: false
    };
    saveState();
    closeModal();
    render();
    toast('Stopwatch gestart');
  });
}

function addTheme(rawName) {
  const name = cleanName(rawName);
  if (!name) return null;
  const existing = state.themes.find(t => t.name.localeCompare(name, 'nl', { sensitivity: 'base' }) === 0);
  if (existing) return existing;
  const item = { id: uid(), name, usageCount: 0, createdAt: new Date().toISOString() };
  state.themes.push(item);
  saveState();
  return item;
}

function addSubtheme(themeId, rawName) {
  const theme = state.themes.find(t => t.id === themeId);
  const name = cleanName(rawName);
  if (!theme || !name) return null;
  const existing = state.subthemes.find(s => s.themeId === themeId && s.name.localeCompare(name, 'nl', { sensitivity: 'base' }) === 0);
  if (existing) return existing;
  const item = { id: uid(), themeId, themeName: theme.name, name, usageCount: 0, createdAt: new Date().toISOString() };
  state.subthemes.push(item);
  saveState();
  return item;
}

function addColleague(rawName) {
  const name = cleanName(rawName);
  if (!name) return null;
  const existing = state.colleagues.find(c => c.name.localeCompare(name, 'nl', { sensitivity: 'base' }) === 0);
  if (existing) return existing;
  const item = { id: uid(), name, usageCount: 0, createdAt: new Date().toISOString() };
  state.colleagues.push(item);
  saveState();
  return item;
}

function colleagueSection(ownMinutes, prefix) {
  const colleagues = sortedByUsage(state.colleagues);
  return `
    <div class="section">
      <h3>Collega's</h3>
      <div id="${prefix}ColleagueList" class="check-list">
        ${colleagues.length ? colleagues.map(c => `
          <div class="check-row">
            <input type="checkbox" id="${prefix}c-${c.id}" value="${c.id}" class="${prefix}col-check">
            <label for="${prefix}c-${c.id}">${safeText(c.name)}</label>
            <span class="muted small">${c.usageCount || 0}x</span>
          </div>
        `).join('') : '<p class="muted small">Nog geen collega\'s.</p>'}
      </div>
      <div class="inline-form" style="margin-top:10px">
        <div class="field"><label for="${prefix}NewColleague">Nieuwe collega</label><input id="${prefix}NewColleague" placeholder="Naam"></div>
        <button id="${prefix}AddColleague" class="btn small">Voeg toe</button>
      </div>
      <div id="${prefix}ColleagueTimes" style="display:none">
        <div class="field">
          <label for="${prefix}Mode">Verdeling collega-uren</label>
          <select id="${prefix}Mode">
            <option value="same">Zelfde als mijn afgeronde tijd</option>
            <option value="common">Een tijd voor alle collega's</option>
            <option value="individual">Per collega bepalen</option>
          </select>
        </div>
        <div id="${prefix}CommonWrap" class="field" style="display:none">
          <label for="${prefix}CommonMinutes">Minuten per collega</label>
          <input id="${prefix}CommonMinutes" type="number" min="0" step="${state.settings.roundingMinutes}" value="${ownMinutes}">
          <div class="btn-inline" style="margin-top:8px">
            <button type="button" class="btn small ${prefix}quick" data-minutes="${ownMinutes}">Zelfde</button>
            <button type="button" class="btn small ${prefix}quick" data-minutes="${Math.max(0, ownMinutes - state.settings.roundingMinutes)}">-${state.settings.roundingMinutes}</button>
            <button type="button" class="btn small ${prefix}quick" data-minutes="${ownMinutes + state.settings.roundingMinutes}">+${state.settings.roundingMinutes}</button>
          </div>
        </div>
        <div id="${prefix}IndividualWrap" style="display:none"></div>
      </div>
    </div>
  `;
}

function wireColleagueSection(prefix, ownMinutes) {
  const list = $(`#${prefix}ColleagueList`);
  const times = $(`#${prefix}ColleagueTimes`);
  const mode = $(`#${prefix}Mode`);
  const commonWrap = $(`#${prefix}CommonWrap`);
  const individualWrap = $(`#${prefix}IndividualWrap`);

  const selectedIds = () => $$(`.${prefix}col-check`, list).filter(x => x.checked).map(x => x.value);

  const renderIndividual = () => {
    const ids = selectedIds();
    individualWrap.innerHTML = ids.map(id => {
      const c = state.colleagues.find(x => x.id === id);
      return `<div class="field"><label>${safeText(c?.name || '')}</label><input class="${prefix}individual" data-id="${id}" type="number" min="0" step="${state.settings.roundingMinutes}" value="${ownMinutes}"></div>`;
    }).join('');
  };

  const refresh = () => {
    const ids = selectedIds();
    times.style.display = ids.length ? '' : 'none';
    commonWrap.style.display = ids.length && mode.value === 'common' ? '' : 'none';
    individualWrap.style.display = ids.length && mode.value === 'individual' ? '' : 'none';
    if (mode.value === 'individual') renderIndividual();
  };

  list.addEventListener('change', refresh);
  mode.addEventListener('change', refresh);
  $$(`.${prefix}quick`).forEach(btn => btn.addEventListener('click', () => {
    $(`#${prefix}CommonMinutes`).value = btn.dataset.minutes;
  }));

  $(`#${prefix}AddColleague`).addEventListener('click', () => {
    const input = $(`#${prefix}NewColleague`);
    const colleague = addColleague(input.value);
    if (!colleague) return;
    const oldSelected = new Set(selectedIds());
    oldSelected.add(colleague.id);
    list.innerHTML = sortedByUsage(state.colleagues).map(c => `
      <div class="check-row">
        <input type="checkbox" id="${prefix}c-${c.id}" value="${c.id}" class="${prefix}col-check" ${oldSelected.has(c.id) ? 'checked' : ''}>
        <label for="${prefix}c-${c.id}">${safeText(c.name)}</label>
        <span class="muted small">${c.usageCount || 0}x</span>
      </div>
    `).join('');
    input.value = '';
    refresh();
    toast('Collega toegevoegd');
  });

  refresh();

  return () => {
    const ids = selectedIds();
    const modeValue = mode.value;
    const common = Math.max(0, Number($(`#${prefix}CommonMinutes`)?.value || ownMinutes));
    return ids.map(id => {
      const colleague = state.colleagues.find(c => c.id === id);
      let minutes = ownMinutes;
      if (modeValue === 'common') minutes = common;
      if (modeValue === 'individual') {
        minutes = Math.max(0, Number($(`.${prefix}individual[data-id="${id}"]`)?.value || ownMinutes));
      }
      return { colleagueId: id, colleagueName: colleague?.name || '', minutes: Math.round(minutes) };
    });
  };
}

function openStopModal() {
  const timer = state.timer;
  if (timer.status !== 'pending') return;
  const actual = actualMinutes(timer.startISO, timer.stopISO);
  const own = roundMinutes(actual);
  openModal(`
    <div class="modal-head"><h2 id="modalTitle">Stopwatch boeken</h2><button class="close" aria-label="Sluiten">x</button></div>
    <div class="card flat">
      <div class="list">
        <div class="list-item"><span>Thema</span><strong>${safeText(timer.themeName)}</strong></div>
        <div class="list-item"><span>Subthema</span><strong>${safeText(timer.subthemeName || '-')}</strong></div>
        <div class="list-item"><span>Tijd</span><strong>${timeText(timer.startISO)} - ${timeText(timer.stopISO)}</strong></div>
        <div class="list-item"><span>Werkelijk</span><strong>${actual} min</strong></div>
        <div class="list-item"><span>Afgerond</span><strong>${own} min (${hours(own)} uur)</strong></div>
      </div>
    </div>
    ${colleagueSection(own, 'stop')}
    <div class="section"><button id="saveStop" class="btn primary" style="width:100%">Boek uren</button></div>
  `);

  const getAllocations = wireColleagueSection('stop', own);
  $('#saveStop').addEventListener('click', () => {
    const allocations = getAllocations();
    const colleagueMinutes = allocations.reduce((sum, x) => sum + x.minutes, 0);
    const entry = {
      id: uid(),
      dateISO: timer.stopISO,
      kind: 'Stopwatch',
      themeId: timer.themeId,
      themeName: timer.themeName,
      subthemeId: timer.subthemeId,
      subthemeName: timer.subthemeName,
      startISO: timer.startISO,
      endISO: timer.stopISO,
      actualMinutes: actual,
      roundedMinutes: own,
      ownMinutes: own,
      colleagueMinutes,
      totalMinutes: own + colleagueMinutes,
      allocations,
      createdAt: new Date().toISOString()
    };
    state.entries.push(entry);
    allocations.forEach(a => {
      const c = state.colleagues.find(x => x.id === a.colleagueId);
      if (c) c.usageCount = (c.usageCount || 0) + 1;
    });
    const startNew = !!timer.startNewAfterSave;
    state.timer = defaultState().timer;
    saveState();
    closeModal();
    render();
    toast('Uren geboekt');
    if (startNew) setTimeout(openStartModal, 250);
  });
}

function openManualModal() {
  const defaultMinutes = 60;
  openModal(`
    <div class="modal-head"><h2 id="modalTitle">Uren achteraf</h2><button class="close" aria-label="Sluiten">x</button></div>
    <div class="field"><label for="manualTheme">Thema</label><select id="manualTheme">${themeOptions()}</select></div>
    <div class="inline-form">
      <div class="field"><label for="newThemeManual">Nieuw thema</label><input id="newThemeManual" placeholder="Naam thema"></div>
      <button id="addThemeManual" class="btn small">Voeg toe</button>
    </div>
    <div class="field"><label for="manualSubtheme">Subthema</label><select id="manualSubtheme" disabled><option value="">Kies eerst een thema</option></select></div>
    <div class="inline-form">
      <div class="field"><label for="newSubthemeManual">Nieuw subthema</label><input id="newSubthemeManual" placeholder="Naam subthema" disabled></div>
      <button id="addSubthemeManual" class="btn small" disabled>Voeg toe</button>
    </div>
    <div class="section">
      <h3>Datum en tijd</h3>
      <div class="field"><label for="manualDate">Datum</label><input id="manualDate" type="date" value="${dateInputValue()}"></div>
      <div class="field"><label for="manualMinutes">Eigen minuten</label><input id="manualMinutes" type="number" min="1" step="${state.settings.roundingMinutes}" value="${defaultMinutes}"></div>
      <p id="manualRounded" class="muted small">Wordt naar boven afgerond op ${roundMinutes(defaultMinutes)} minuten.</p>
      <div class="btn-inline">
        ${[15,30,45,60,75,90,120].map(m => `<button type="button" class="btn small manual-preset" data-minutes="${m}">${hours(m)} u</button>`).join('')}
      </div>
    </div>
    <div id="manualColleagueHost">${colleagueSection(roundMinutes(defaultMinutes), 'manual')}</div>
    <div class="section"><button id="saveManual" class="btn primary" style="width:100%">Boek handmatig</button></div>
  `);

  const themeSelect = $('#manualTheme');
  const subSelect = $('#manualSubtheme');
  const newSub = $('#newSubthemeManual');
  const addSub = $('#addSubthemeManual');
  const minuteInput = $('#manualMinutes');
  let getAllocations = wireColleagueSection('manual', roundMinutes(defaultMinutes));

  const refreshSubs = () => {
    const themeId = themeSelect.value;
    subSelect.disabled = !themeId;
    newSub.disabled = !themeId;
    addSub.disabled = !themeId;
    subSelect.innerHTML = themeId ? subthemeOptions(themeId) : '<option value="">Kies eerst een thema</option>';
  };
  themeSelect.addEventListener('change', refreshSubs);

  $('#addThemeManual').addEventListener('click', () => {
    const theme = addTheme($('#newThemeManual').value);
    if (!theme) return;
    themeSelect.innerHTML = themeOptions(theme.id);
    $('#newThemeManual').value = '';
    refreshSubs();
    toast('Thema toegevoegd');
  });
  addSub.addEventListener('click', () => {
    const sub = addSubtheme(themeSelect.value, newSub.value);
    if (!sub) return;
    subSelect.innerHTML = subthemeOptions(themeSelect.value, sub.id);
    newSub.value = '';
    toast('Subthema toegevoegd');
  });

  const rebuildColleagueEditor = () => {
    const own = roundMinutes(Number(minuteInput.value) || 1);
    $('#manualRounded').textContent = `Wordt naar boven afgerond op ${own} minuten (${hours(own)} uur).`;
    $('#manualColleagueHost').innerHTML = colleagueSection(own, 'manual');
    getAllocations = wireColleagueSection('manual', own);
  };
  minuteInput.addEventListener('input', rebuildColleagueEditor);
  $$('.manual-preset').forEach(btn => btn.addEventListener('click', () => {
    minuteInput.value = btn.dataset.minutes;
    rebuildColleagueEditor();
  }));

  $('#saveManual').addEventListener('click', () => {
    const theme = state.themes.find(t => t.id === themeSelect.value);
    if (!theme) return toast('Kies eerst een thema');
    const sub = state.subthemes.find(s => s.id === subSelect.value);
    const inputMinutes = Math.max(1, Number(minuteInput.value) || 1);
    const own = roundMinutes(inputMinutes);
    const allocations = getAllocations();
    const colleagueMinutes = allocations.reduce((sum, x) => sum + x.minutes, 0);
    const dateISO = new Date(`${$('#manualDate').value}T12:00:00`).toISOString();

    theme.usageCount = (theme.usageCount || 0) + 1;
    if (sub) sub.usageCount = (sub.usageCount || 0) + 1;
    allocations.forEach(a => {
      const c = state.colleagues.find(x => x.id === a.colleagueId);
      if (c) c.usageCount = (c.usageCount || 0) + 1;
    });

    state.entries.push({
      id: uid(), dateISO, kind: 'Handmatig',
      themeId: theme.id, themeName: theme.name,
      subthemeId: sub?.id || null, subthemeName: sub?.name || '',
      startISO: null, endISO: null,
      actualMinutes: inputMinutes,
      roundedMinutes: own,
      ownMinutes: own,
      colleagueMinutes,
      totalMinutes: own + colleagueMinutes,
      allocations,
      createdAt: new Date().toISOString()
    });
    saveState();
    closeModal();
    render();
    toast('Handmatige uren geboekt');
  });
}

function renderEntries() {
  const main = $('#main');
  const themes = [...new Set(state.entries.map(e => e.themeName))].sort((a,b)=>a.localeCompare(b,'nl'));
  main.innerHTML = `
    <section class="card flat">
      <div class="card-title"><h2>Registraties</h2><span class="pill">${state.entries.length}</span></div>
      <div class="field"><label for="entryFilter">Filter op thema</label><select id="entryFilter"><option value="">Alle thema's</option>${themes.map(t=>`<option>${safeText(t)}</option>`).join('')}</select></div>
    </section>
    <div id="entryList" class="list"></div>
  `;
  const filter = $('#entryFilter');
  filter.addEventListener('change', () => renderEntryList(filter.value));
  renderEntryList('');
}

function renderEntryList(themeName) {
  const host = $('#entryList');
  if (!host) return;
  const entries = [...state.entries]
    .filter(e => !themeName || e.themeName === themeName)
    .sort((a,b) => new Date(b.dateISO) - new Date(a.dateISO) || new Date(b.createdAt) - new Date(a.createdAt));
  if (!entries.length) {
    host.innerHTML = `<div class="empty"><div class="empty-symbol">☷</div><div>Geen registraties gevonden.</div></div>`;
    return;
  }
  host.innerHTML = entries.map(e => `
    <div class="list-item clickable" data-entry="${e.id}">
      <div class="item-main">
        <div class="item-title">${safeText(e.themeName)}</div>
        <div class="item-sub">${dateText(e.dateISO)} - ${safeText(e.kind)}${e.subthemeName ? ` - ${safeText(e.subthemeName)}` : ''}</div>
      </div>
      <div class="item-value">${hours(e.totalMinutes)} u</div>
    </div>
  `).join('');
  $$('[data-entry]', host).forEach(el => el.addEventListener('click', () => openEntryDetail(el.dataset.entry)));
}

function openEntryDetail(entryId) {
  const e = state.entries.find(x => x.id === entryId);
  if (!e) return;
  openModal(`
    <div class="modal-head"><h2 id="modalTitle">Registratie</h2><button class="close" aria-label="Sluiten">x</button></div>
    <div class="list">
      <div class="list-item"><span>Datum</span><strong>${dateText(e.dateISO)}</strong></div>
      <div class="list-item"><span>Type</span><strong>${safeText(e.kind)}</strong></div>
      <div class="list-item"><span>Thema</span><strong>${safeText(e.themeName)}</strong></div>
      <div class="list-item"><span>Subthema</span><strong>${safeText(e.subthemeName || '-')}</strong></div>
      ${e.kind === 'Stopwatch' ? `
      <div class="list-item"><span>Start</span><strong>${timeText(e.startISO)}</strong></div>
      <div class="list-item"><span>Einde</span><strong>${timeText(e.endISO)}</strong></div>` : ''}
      <div class="list-item"><span>Werkelijk</span><strong>${e.actualMinutes} min</strong></div>
      <div class="list-item"><span>Afgerond</span><strong>${e.roundedMinutes} min</strong></div>
      <div class="list-item"><span>Eigen uren</span><strong>${hours(e.ownMinutes)} uur</strong></div>
      <div class="list-item"><span>Collega-uren</span><strong>${hours(e.colleagueMinutes)} uur</strong></div>
      <div class="list-item"><span>Totale inzet</span><strong>${hours(e.totalMinutes)} uur</strong></div>
    </div>
    ${e.allocations?.length ? `<div class="section"><h3>Collega's</h3><div class="list">${e.allocations.map(a=>`<div class="list-item"><span>${safeText(a.colleagueName)}</span><strong>${hours(a.minutes)} uur</strong></div>`).join('')}</div></div>` : ''}
    <div class="section"><button id="deleteEntry" class="btn danger" style="width:100%">Verwijder registratie</button></div>
  `);
  $('#deleteEntry').addEventListener('click', () => {
    if (!confirm('Deze registratie verwijderen?')) return;
    state.entries = state.entries.filter(x => x.id !== entryId);
    saveState();
    closeModal();
    render();
    toast('Registratie verwijderd');
  });
}

function totals(entries = state.entries) {
  return entries.reduce((acc, e) => {
    acc.own += Number(e.ownMinutes) || 0;
    acc.colleague += Number(e.colleagueMinutes) || 0;
    acc.total += Number(e.totalMinutes) || 0;
    return acc;
  }, { own: 0, colleague: 0, total: 0 });
}

function groupedThemes() {
  const map = new Map();
  for (const e of state.entries) {
    if (!map.has(e.themeName)) map.set(e.themeName, []);
    map.get(e.themeName).push(e);
  }
  return [...map.entries()].map(([name, entries]) => ({ name, entries, totals: totals(entries) }))
    .sort((a,b) => b.totals.total - a.totals.total || a.name.localeCompare(b.name,'nl'));
}

function renderInsights() {
  const main = $('#main');
  const all = totals();
  const groups = groupedThemes();
  main.innerHTML = `
    <section class="card flat">
      <div class="card-title"><h2>Inzicht</h2><span class="pill">${state.entries.length} registraties</span></div>
      <div class="grid-2">
        <div class="summary"><div class="muted small">Eigen uren</div><div class="value">${hours(all.own)}</div></div>
        <div class="summary"><div class="muted small">Collega-uren</div><div class="value">${hours(all.colleague)}</div></div>
      </div>
      <div class="summary" style="margin-top:10px"><div class="muted small">Totale inzet</div><div class="value">${hours(all.total)}</div></div>
    </section>
    <section class="card flat">
      <h3>Per thema</h3>
      <div id="themeTotals" class="list">
        ${groups.length ? groups.map(g => `
          <div class="list-item clickable" data-theme-detail="${safeText(g.name)}">
            <div class="item-main"><div class="item-title">${safeText(g.name)}</div><div class="item-sub">${g.entries.length} registraties | Eigen ${hours(g.totals.own)} u | Collega's ${hours(g.totals.colleague)} u</div></div>
            <div class="item-value">${hours(g.totals.total)} u</div>
          </div>
        `).join('') : '<div class="empty">Nog geen geboekte uren.</div>'}
      </div>
    </section>
  `;
  $$('[data-theme-detail]').forEach(el => el.addEventListener('click', () => openThemeDetail(el.dataset.themeDetail)));
}

function openThemeDetail(themeName) {
  const entries = state.entries.filter(e => e.themeName === themeName).sort((a,b)=>new Date(b.dateISO)-new Date(a.dateISO));
  const t = totals(entries);
  openModal(`
    <div class="modal-head"><h2 id="modalTitle">${safeText(themeName)}</h2><button class="close" aria-label="Sluiten">x</button></div>
    <div class="grid-2">
      <div class="summary"><div class="muted small">Eigen</div><div class="value">${hours(t.own)}</div></div>
      <div class="summary"><div class="muted small">Collega's</div><div class="value">${hours(t.colleague)}</div></div>
    </div>
    <div class="summary" style="margin-top:10px"><div class="muted small">Totale inzet</div><div class="value">${hours(t.total)}</div></div>
    <div class="section"><h3>Registraties (${entries.length})</h3><div class="list">
      ${entries.map((e,i)=>`<div class="list-item clickable" data-entry-modal="${e.id}"><div class="item-main"><div class="item-title">#${i+1} - ${dateText(e.dateISO)} - ${safeText(e.kind)}</div><div class="item-sub">${safeText(e.subthemeName || 'Geen subthema')} | ${e.kind === 'Stopwatch' ? `${timeText(e.startISO)} - ${timeText(e.endISO)} | ` : ''}${e.roundedMinutes} min</div></div><div class="item-value">${hours(e.totalMinutes)} u</div></div>`).join('')}
    </div></div>
  `);
  $$('[data-entry-modal]').forEach(el => el.addEventListener('click', () => openEntryDetail(el.dataset.entryModal)));
}

function renderManage() {
  const main = $('#main');
  main.innerHTML = `
    <section class="card flat">
      <h2>Beheer</h2>
      <div class="field"><label>Afronding stopwatch</label><select id="roundingSetting"><option value="10" ${state.settings.roundingMinutes===10?'selected':''}>10 minuten</option><option value="15" ${state.settings.roundingMinutes===15?'selected':''}>15 minuten</option></select></div>
      <p class="muted small">Tijd wordt altijd naar boven afgerond. 1 minuut wordt dus 10 of 15 minuten.</p>
    </section>

    <section class="card flat">
      <div class="card-title"><h3>Thema's</h3><span class="pill">${state.themes.length}</span></div>
      <div id="manageThemes" class="list">${sortedByUsage(state.themes).map(t=>`<div class="list-item"><div class="item-main"><div class="item-title">${safeText(t.name)}</div><div class="item-sub">${t.usageCount||0}x gebruikt</div></div><button class="btn small ghost" data-manage-theme="${t.id}">Subthema's</button></div>`).join('') || '<p class="muted small">Nog geen thema\'s.</p>'}</div>
      <div class="inline-form" style="margin-top:10px"><div class="field"><label for="manageNewTheme">Nieuw thema</label><input id="manageNewTheme"></div><button id="manageAddTheme" class="btn small">Voeg toe</button></div>
    </section>

    <section class="card flat">
      <div class="card-title"><h3>Collega's</h3><span class="pill">${state.colleagues.length}</span></div>
      <div class="list">${sortedByUsage(state.colleagues).map(c=>`<div class="list-item"><div class="item-main"><div class="item-title">${safeText(c.name)}</div><div class="item-sub">${c.usageCount||0}x gebruikt</div></div><button class="btn small ghost" data-delete-colleague="${c.id}">Verwijder</button></div>`).join('') || '<p class="muted small">Nog geen collega\'s.</p>'}</div>
      <div class="inline-form" style="margin-top:10px"><div class="field"><label for="manageNewColleague">Nieuwe collega</label><input id="manageNewColleague"></div><button id="manageAddColleague" class="btn small">Voeg toe</button></div>
    </section>

    <section class="card flat">
      <h3>Backup</h3>
      <p class="muted small">Alle gegevens staan alleen op dit toestel. Maak af en toe een backupbestand.</p>
      <div class="btn-row two">
        <button id="exportData" class="btn">Exporteer backup</button>
        <label class="btn" style="text-align:center">Herstel backup<input id="importData" type="file" accept="application/json,.json" hidden></label>
      </div>
    </section>

    <section class="card flat danger-zone">
      <h3>Alles wissen</h3>
      <p class="muted small">Verwijdert thema's, collega's, registraties en een eventuele actieve timer van dit toestel.</p>
      <button id="resetData" class="btn danger">Wis alle gegevens</button>
    </section>
  `;

  $('#roundingSetting').addEventListener('change', e => {
    state.settings.roundingMinutes = Number(e.target.value);
    saveState();
    toast(`Afronding ingesteld op ${e.target.value} minuten`);
  });
  $('#manageAddTheme').addEventListener('click', () => {
    const t = addTheme($('#manageNewTheme').value);
    if (t) { toast('Thema toegevoegd'); renderManage(); }
  });
  $('#manageAddColleague').addEventListener('click', () => {
    const c = addColleague($('#manageNewColleague').value);
    if (c) { toast('Collega toegevoegd'); renderManage(); }
  });
  $$('[data-manage-theme]').forEach(btn => btn.addEventListener('click', () => openSubthemeManage(btn.dataset.manageTheme)));
  $$('[data-delete-colleague]').forEach(btn => btn.addEventListener('click', () => {
    const c = state.colleagues.find(x => x.id === btn.dataset.deleteColleague);
    if (!c || !confirm(`Collega "${c.name}" verwijderen? Bestaande registraties blijven behouden.`)) return;
    state.colleagues = state.colleagues.filter(x => x.id !== c.id);
    saveState(); renderManage();
  }));
  $('#exportData').addEventListener('click', exportBackup);
  $('#importData').addEventListener('change', importBackup);
  $('#resetData').addEventListener('click', resetAll);
}

function openSubthemeManage(themeId) {
  const theme = state.themes.find(t => t.id === themeId);
  if (!theme) return;
  const renderInner = () => {
    const subs = sortedByUsage(state.subthemes.filter(s => s.themeId === themeId));
    openModal(`
      <div class="modal-head"><h2 id="modalTitle">${safeText(theme.name)}</h2><button class="close" aria-label="Sluiten">x</button></div>
      <h3>Subthema's</h3>
      <div class="list">${subs.map(s=>`<div class="list-item"><div class="item-main"><div class="item-title">${safeText(s.name)}</div><div class="item-sub">${s.usageCount||0}x gebruikt</div></div><button class="btn small ghost" data-delete-sub="${s.id}">Verwijder</button></div>`).join('') || '<p class="muted small">Nog geen subthema\'s.</p>'}</div>
      <div class="inline-form" style="margin-top:10px"><div class="field"><label for="manageNewSub">Nieuw subthema</label><input id="manageNewSub"></div><button id="manageAddSub" class="btn small">Voeg toe</button></div>
      <div class="section"><button id="deleteTheme" class="btn danger" style="width:100%">Verwijder thema</button></div>
    `);
    $('#manageAddSub').addEventListener('click', () => {
      const s = addSubtheme(themeId, $('#manageNewSub').value);
      if (s) { toast('Subthema toegevoegd'); renderInner(); }
    });
    $$('[data-delete-sub]').forEach(btn => btn.addEventListener('click', () => {
      const s = state.subthemes.find(x => x.id === btn.dataset.deleteSub);
      if (!s || !confirm(`Subthema "${s.name}" verwijderen? Bestaande registraties blijven behouden.`)) return;
      state.subthemes = state.subthemes.filter(x => x.id !== s.id);
      saveState(); renderInner();
    }));
    $('#deleteTheme').addEventListener('click', () => {
      if (!confirm(`Thema "${theme.name}" en de bijbehorende subthema's uit beheer verwijderen? Bestaande registraties blijven behouden.`)) return;
      state.themes = state.themes.filter(t => t.id !== themeId);
      state.subthemes = state.subthemes.filter(s => s.themeId !== themeId);
      saveState(); closeModal(); renderManage(); toast('Thema verwijderd');
    });
  };
  renderInner();
}

function exportBackup() {
  const payload = JSON.stringify({ ...state, exportedAt: new Date().toISOString() }, null, 2);
  const blob = new Blob([payload], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `urenregistratie-backup-${dateInputValue()}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast('Backup aangemaakt');
}

function importBackup(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(String(reader.result));
      if (!Array.isArray(parsed.entries) || !Array.isArray(parsed.themes) || !parsed.settings) throw new Error('ongeldig formaat');
      if (!confirm('Huidige gegevens vervangen door deze backup?')) return;
      state = {
        ...defaultState(), ...parsed,
        settings: { ...defaultState().settings, ...(parsed.settings || {}) },
        timer: { ...defaultState().timer, ...(parsed.timer || {}) }
      };
      saveState();
      render();
      toast('Backup hersteld');
    } catch (error) {
      alert('Dit bestand is geen geldige Urenregistratie-backup.');
    } finally {
      event.target.value = '';
    }
  };
  reader.readAsText(file);
}

function resetAll() {
  if (!confirm('Weet je zeker dat je ALLE urenregistratiegegevens wilt wissen?')) return;
  if (!confirm('Dit kan niet ongedaan worden gemaakt zonder backup. Nogmaals bevestigen?')) return;
  state = defaultState();
  saveState();
  currentTab = 'timer';
  setTab('timer');
  toast('Alle gegevens gewist');
}

function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(err => console.warn('Service worker niet actief', err));
  }
}

function init() {
  $$('.tab').forEach(btn => btn.addEventListener('click', () => setTab(btn.dataset.tab)));
  $('#modalBackdrop').addEventListener('click', event => {
    if (event.target === $('#modalBackdrop')) closeModal();
  });
  render();
  registerServiceWorker();
}

document.addEventListener('DOMContentLoaded', init);
