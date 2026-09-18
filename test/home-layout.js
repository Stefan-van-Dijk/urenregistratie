(function () {
  'use strict';

  const PERIOD_MODES = ['day', 'week', 'month', 'quarter', 'year', 'all'];
  const SCREEN_EDGE_SWIPE_ZONE = 32;
  const SCREEN_EDGE_SWIPE_DISTANCE = 72;

  let panelMode = 'overview';
  let applying = false;
  let periodGesture = null;
  let periodLastTap = 0;
  let activitySwipe = null;
  let screenSwipe = null;
  let expandedEntryId = null;

  const colleagueById = id => state.colleagues.find(c => c.id === id);
  const entryById = id => state.entries.find(e => e.id === id);

  function interruptionSuggestion() {
    const history = state.entries
      .filter(e => e.activityType === 'interruption')
      .sort((a, b) => new Date(b.endISO || b.dateISO || b.createdAt) - new Date(a.endISO || a.dateISO || a.createdAt));

    if (!history.length) {
      const first = sortedByUsage(state.colleagues)[0];
      return {
        peopleIds: first ? [first.id] : [],
        departmentName: '',
        themeId: '',
        subthemeId: '',
        locationName: state.timer.locationName || ''
      };
    }

    let best = history[0];
    let bestScore = -Infinity;
    const currentThemeId = state.timer.themeId;
    const now = Date.now();

    for (const entry of history) {
      const ageDays = Math.max(0, (now - new Date(entry.endISO || entry.dateISO || entry.createdAt).getTime()) / 86400000);
      let score = Math.max(0, 20 - ageDays);
      const parent = state.entries.find(e => e.id === entry.parentActivityId);
      if (currentThemeId && parent?.themeId === currentThemeId) score += 12;
      score += (entry.people?.length || 0) * 2;
      if (score > bestScore) {
        best = entry;
        bestScore = score;
      }
    }

    const peopleIds = (best.people || []).map(p => p.id).filter(id => colleagueById(id));
    if (!peopleIds.length) {
      const first = sortedByUsage(state.colleagues)[0];
      if (first) peopleIds.push(first.id);
    }

    return {
      peopleIds,
      departmentName: best.departmentName || '',
      themeId: best.themeId || '',
      subthemeId: best.subthemeId || '',
      locationName: best.locationName || state.timer.locationName || ''
    };
  }

  function periodModeLabel(mode) {
    return ({ day: 'Dag', week: 'Week', month: 'Maand', quarter: 'Kwartaal', year: 'Jaar', all: 'Alles' })[mode] || 'Week';
  }

  function setPeriodMode(mode) {
    if (!PERIOD_MODES.includes(mode)) return;
    const today = dateInputValue(new Date());
    const current = periodBounds(state.ui.periodMode, state.ui.anchorDate).start.getTime() === periodBounds(state.ui.periodMode, today).start.getTime();
    state.ui.periodMode = mode;
    if (current) state.ui.anchorDate = today;
    saveState();
    panelMode = 'overview';
    render();
  }

  function zoomPeriod(direction) {
    const index = PERIOD_MODES.indexOf(state.ui.periodMode);
    const next = Math.max(0, Math.min(PERIOD_MODES.length - 1, index + direction));
    if (next !== index) setPeriodMode(PERIOD_MODES[next]);
  }

  function resetCurrentPeriod() {
    state.ui.anchorDate = dateInputValue(new Date());
    saveState();
    panelMode = 'overview';
    render();
  }

  function periodTouchDistance(touches) {
    if (touches.length < 2) return 0;
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.hypot(dx, dy);
  }

  function periodTouchStart(event) {
    const period = event.target.closest?.('.period-overview');
    if (!period || panelMode !== 'overview') return;
    if (event.touches.length === 2) {
      periodGesture = {
        kind: 'pinch',
        startDistance: periodTouchDistance(event.touches),
        lastDistance: periodTouchDistance(event.touches)
      };
      return;
    }
    if (event.touches.length === 1 && !event.target.closest?.('button,input,select,textarea')) {
      const touch = event.touches[0];
      periodGesture = { kind: 'swipe', startX: touch.clientX, startY: touch.clientY, startTime: Date.now() };
    }
  }

  function periodTouchMove(event) {
    if (!periodGesture) return;
    if (periodGesture.kind === 'pinch' && event.touches.length === 2) {
      periodGesture.lastDistance = periodTouchDistance(event.touches);
      event.preventDefault();
    }
  }

  function periodTouchEnd(event) {
    if (!periodGesture) return;
    const gesture = periodGesture;
    if (gesture.kind === 'pinch') {
      if (event.touches.length) return;
      periodGesture = null;
      const scale = gesture.startDistance ? gesture.lastDistance / gesture.startDistance : 1;
      if (scale > 1.12) zoomPeriod(-1);
      else if (scale < 0.88) zoomPeriod(1);
      return;
    }
    if (event.touches.length) return;
    periodGesture = null;
    const touch = event.changedTouches?.[0];
    const x = touch?.clientX ?? gesture.startX;
    const y = touch?.clientY ?? gesture.startY;
    const dx = x - gesture.startX;
    const dy = y - gesture.startY;
    if (Math.abs(dx) > 55 && Math.abs(dx) > Math.abs(dy) * 1.2) {
      movePeriod(dx < 0 ? 1 : -1);
      periodLastTap = 0;
      return;
    }
    if (Date.now() - gesture.startTime < 350) {
      const now = Date.now();
      if (now - periodLastTap < 330) {
        periodLastTap = 0;
        resetCurrentPeriod();
      } else {
        periodLastTap = now;
      }
    }
  }

  function compactAction(action) {
    if (!action) return;
    action.classList.toggle('context-preparing', panelMode !== 'overview');

    if (state.timer.status === 'inactive') {
      const suggestionValue = suggestion();
      action.classList.add('home-action');
      action.innerHTML = `
        <div class="kicker">${suggestionValue ? 'Waarschijnlijk nu' : 'Nieuwe activiteit'}</div>
        <h2 class="home-action-title">${safeText(suggestionValue?.theme?.name || 'Wat ga je doen?')}</h2>
        <p class="home-action-subtitle">${safeText(suggestionValue?.sub?.name || 'Kies een taak en start direct.')}</p>
        ${suggestionValue?.locationName ? `<div class="home-action-meta">⌖ ${safeText(suggestionValue.locationName)}</div>` : ''}
        <button id="registerTaskInline" class="btn primary full home-action-button">Taak registreren</button>`;
      $('#registerTaskInline')?.addEventListener('click', () => {
        panelMode = 'task';
        const period = document.querySelector('#main > .period-nav, #main > .period-overview');
        if (period) renderTaskPanel(period);
      });
      return;
    }

    if (state.timer.status === 'active' && !state.timer.interruption) {
      const stopOriginal = action.querySelector('#stopTimer');
      if (stopOriginal && !stopOriginal.dataset.inlineBound) {
        const stop = stopOriginal.cloneNode(true);
        stop.dataset.inlineBound = '1';
        stopOriginal.replaceWith(stop);
        stop.addEventListener('click', () => {
          state.timer.status = 'pending';
          state.timer.stopISO = new Date().toISOString();
          saveState();
          panelMode = 'stop';
          render();
        });
      }

      const interruptionOriginal = action.querySelector('#startInterruption');
      if (interruptionOriginal && !interruptionOriginal.dataset.inlineBound) {
        const interruption = interruptionOriginal.cloneNode(true);
        interruption.dataset.inlineBound = '1';
        interruption.textContent = 'Tussenstop';
        interruptionOriginal.replaceWith(interruption);
        interruption.addEventListener('click', () => {
          panelMode = 'interruption';
          const period = document.querySelector('#main > .period-nav, #main > .period-overview');
          if (period) renderInterruptionPanel(period);
        });
      }
      return;
    }

    if (state.timer.status === 'pending') {
      const finishOriginal = action.querySelector('#finishPending');
      if (finishOriginal && !finishOriginal.dataset.inlineBound) {
        const finish = finishOriginal.cloneNode(true);
        finish.dataset.inlineBound = '1';
        finish.textContent = 'Taak afronden';
        finishOriginal.replaceWith(finish);
        finish.addEventListener('click', () => {
          panelMode = 'stop';
          const period = document.querySelector('#main > .period-nav, #main > .period-overview');
          if (period) renderStopPanel(period);
        });
      }
    }
  }

  function setupPeriodOverview(period, summary) {
    if (!period) return;
    period.classList.add('period-overview');
    period.classList.remove('period-entry-mode');
    period.id = 'periodNavigator';

    if (summary && summary.parentElement === document.querySelector('#main')) {
      summary.classList.add('period-summary');
      period.appendChild(summary);
    }

    const center = period.querySelector('.period-center');
    if (center && !center.dataset.periodChooseBound) {
      center.dataset.periodChooseBound = '1';
      center.setAttribute('role', 'button');
      center.setAttribute('tabindex', '0');
      center.setAttribute('aria-label', 'Periodegrootte kiezen');
      center.addEventListener('click', () => renderPeriodChooser(period));
      center.addEventListener('keydown', event => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          renderPeriodChooser(period);
        }
      });
    }
  }

  function renderPeriodChooser(period) {
    panelMode = 'period-chooser';
    period.classList.add('period-overview', 'period-entry-mode');
    period.innerHTML = `
      <div class="inline-register-head">
        <div>
          <div class="kicker">Periodegrootte</div>
          <h2>Kies een periode</h2>
        </div>
        <button id="cancelPeriodChooser" class="period-arrow inline-close" type="button" aria-label="Annuleren">×</button>
      </div>
      <div class="period-choice-list">
        ${PERIOD_MODES.map(mode => `<button type="button" class="period-choice ${state.ui.periodMode === mode ? 'active' : ''}" data-period-choice="${mode}">${periodModeLabel(mode)}</button>`).join('')}
      </div>
      <div class="period-choice-help">
        <div>Swipe links/rechts voor vorige of volgende periode.</div>
        <div>Knijp uit elkaar voor een kleinere periode; naar elkaar toe voor een grotere.</div>
        <div>Dubbel tik op het overzicht om terug te gaan naar de huidige periode.</div>
      </div>`;

    $('#cancelPeriodChooser')?.addEventListener('click', () => {
      panelMode = 'overview';
      render();
    });
    $$('[data-period-choice]', period).forEach(button => {
      button.addEventListener('click', () => setPeriodMode(button.dataset.periodChoice));
    });
  }

  function renderTaskPanel(period) {
    panelMode = 'task';
    const suggestionValue = suggestion();
    const selectedThemeId = suggestionValue?.theme?.id || sortedByUsage(state.themes)[0]?.id || '';
    const selectedSubId = suggestionValue?.sub?.id || '';

    period.classList.add('period-overview', 'period-entry-mode');
    period.innerHTML = `
      <div class="inline-register-head">
        <div>
          <div class="kicker">Taak registreren</div>
          <h2>Start je taak</h2>
        </div>
        <button id="cancelInlineTask" class="period-arrow inline-close" type="button" aria-label="Annuleren">×</button>
      </div>
      ${suggestionValue ? `<div class="inline-proposal"><span>Voorstel</span><strong>${safeText(suggestionValue.theme.name)}${suggestionValue.sub ? ` · ${safeText(suggestionValue.sub.name)}` : ''}</strong><small>Gebaseerd op eerder gebruik, dag en tijdstip.</small></div>` : ''}
      ${state.themes.length ? `
        <div class="inline-fields">
          <label class="inline-field"><span>Thema</span><select id="inlineTaskTheme">${themeOptions(selectedThemeId)}</select></label>
          <label class="inline-field"><span>Subthema</span><select id="inlineTaskSub">${selectedThemeId ? subthemeOptions(selectedThemeId, selectedSubId) : '<option value="">Geen subthema</option>'}</select></label>
          <label class="inline-field inline-field-wide"><span>Locatie <small>optioneel</small></span><input id="inlineTaskLocation" value="${safeText(suggestionValue?.locationName || '')}" placeholder="Bijvoorbeeld kantoor"></label>
        </div>
        <button id="startInlineTask" class="btn primary full start-confirm">Start taak</button>
      ` : `
        <p class="muted small">Er is nog geen thema. Voeg je eerste thema hier toe.</p>
        <div class="inline-form inline-first-theme">
          <div class="field"><label>Nieuw thema</label><input id="inlineFirstTheme" placeholder="Naam van de taak of het thema"></div>
          <button id="addInlineFirstTheme" class="btn small">Toevoegen</button>
        </div>
      `}`;

    $('#cancelInlineTask')?.addEventListener('click', () => {
      panelMode = 'overview';
      render();
    });

    if (!state.themes.length) {
      $('#addInlineFirstTheme')?.addEventListener('click', () => {
        const theme = addTheme($('#inlineFirstTheme').value);
        if (!theme) return toast('Vul eerst een naam in');
        renderTaskPanel(period);
        toast('Thema toegevoegd');
      });
      return;
    }

    const themeSelect = $('#inlineTaskTheme');
    const subSelect = $('#inlineTaskSub');
    themeSelect?.addEventListener('change', () => {
      subSelect.innerHTML = themeSelect.value ? subthemeOptions(themeSelect.value) : '<option value="">Geen subthema</option>';
    });

    $('#startInlineTask')?.addEventListener('click', () => {
      const theme = state.themes.find(t => t.id === themeSelect.value);
      if (!theme) return toast('Kies eerst een thema');
      const sub = state.subthemes.find(st => st.id === subSelect.value) || null;
      panelMode = 'overview';
      startTimer(theme, sub, cleanName($('#inlineTaskLocation').value), '');
    });
  }

  function renderInterruptionPanel(period) {
    panelMode = 'interruption';
    const proposed = interruptionSuggestion();
    const topColleagues = sortedByUsage(state.colleagues).slice(0, 8);

    period.classList.add('period-overview', 'period-entry-mode');
    period.innerHTML = `
      <div class="inline-register-head">
        <div>
          <div class="kicker">Tussenstop</div>
          <h2>Waar word je voor weggetrokken?</h2>
        </div>
        <button id="cancelInlineInterruption" class="period-arrow inline-close" type="button" aria-label="Annuleren">×</button>
      </div>
      <div class="inline-parent-task">
        <span>Je gaat daarna verder met</span>
        <strong>${safeText(state.timer.themeName)}${state.timer.subthemeName ? ` · ${safeText(state.timer.subthemeName)}` : ''}</strong>
      </div>
      <div class="inline-field-block">
        <span class="inline-label">Bij wie?</span>
        <div id="inlineInterruptPeople" class="inline-people">
          ${topColleagues.length ? topColleagues.map(c => `
            <label class="person-choice">
              <input type="checkbox" value="${c.id}" ${proposed.peopleIds.includes(c.id) ? 'checked' : ''}>
              <span>${safeText(c.name)}</span>
            </label>`).join('') : '<small class="muted">Nog geen collega’s bekend.</small>'}
        </div>
      </div>
      <div class="inline-fields">
        <label class="inline-field"><span>Afdeling <small>optioneel</small></span><input id="inlineInterruptDepartment" value="${safeText(proposed.departmentName)}" placeholder="Bijvoorbeeld Engineering"></label>
        <label class="inline-field"><span>Onderwerp <small>optioneel</small></span><select id="inlineInterruptTheme">${themeOptions(proposed.themeId, true)}</select></label>
        <label class="inline-field"><span>Subthema</span><select id="inlineInterruptSub">${proposed.themeId ? subthemeOptions(proposed.themeId, proposed.subthemeId) : '<option value="">Geen subthema</option>'}</select></label>
        <label class="inline-field"><span>Locatie <small>optioneel</small></span><input id="inlineInterruptLocation" value="${safeText(proposed.locationName)}"></label>
      </div>
      <div class="inline-add-person">
        <input id="inlineInterruptNewColleague" placeholder="Andere collega toevoegen">
        <button id="inlineAddInterruptColleague" class="btn small">Toevoegen</button>
      </div>
      <button id="startInlineInterruption" class="btn primary full start-confirm">Start tussenstop</button>`;

    $('#cancelInlineInterruption')?.addEventListener('click', () => {
      panelMode = 'overview';
      render();
    });

    const themeSelect = $('#inlineInterruptTheme');
    const subSelect = $('#inlineInterruptSub');
    themeSelect?.addEventListener('change', () => {
      subSelect.innerHTML = themeSelect.value ? subthemeOptions(themeSelect.value) : '<option value="">Geen subthema</option>';
    });

    $('#inlineAddInterruptColleague')?.addEventListener('click', () => {
      const selected = new Set($$('#inlineInterruptPeople input:checked').map(input => input.value));
      const colleague = addColleague($('#inlineInterruptNewColleague').value);
      if (!colleague) return toast('Vul eerst een naam in');
      selected.add(colleague.id);
      renderInterruptionPanel(period);
      requestAnimationFrame(() => {
        $$('#inlineInterruptPeople input').forEach(input => { input.checked = selected.has(input.value); });
      });
      toast('Collega toegevoegd');
    });

    $('#startInlineInterruption')?.addEventListener('click', () => {
      const people = $$('#inlineInterruptPeople input:checked').map(input => {
        const colleague = colleagueById(input.value);
        if (!colleague) return null;
        colleague.usageCount = (colleague.usageCount || 0) + 1;
        return { id: colleague.id, name: colleague.name };
      }).filter(Boolean);
      const theme = state.themes.find(t => t.id === themeSelect.value);
      const sub = state.subthemes.find(st => st.id === subSelect.value);
      state.timer.interruption = {
        id: uid(),
        startISO: new Date().toISOString(),
        themeId: theme?.id || null,
        themeName: theme?.name || 'Tussenstop',
        subthemeId: sub?.id || null,
        subthemeName: sub?.name || '',
        departmentName: cleanName($('#inlineInterruptDepartment').value),
        locationName: cleanName($('#inlineInterruptLocation').value),
        people
      };
      saveState();
      panelMode = 'overview';
      render();
      toast('Tussenstop gestart');
    });
  }

  function renderStopPanel(period) {
    if (state.timer.status !== 'pending') return;
    panelMode = 'stop';
    const calc = calculateParentTimer(state.timer);

    period.classList.add('period-overview', 'period-entry-mode');
    period.innerHTML = `
      <div class="inline-register-head">
        <div>
          <div class="kicker">Taak afronden</div>
          <h2>${safeText(state.timer.themeName)}${state.timer.subthemeName ? ` · ${safeText(state.timer.subthemeName)}` : ''}</h2>
        </div>
        <button id="resumeInlineTask" class="period-arrow inline-close" type="button" aria-label="Stoppen annuleren">×</button>
      </div>
      <div class="inline-stop-grid">
        <div><span>Werkelijke periode</span><strong>${clockMinutes(calc.span)}</strong></div>
        <div><span>Aftrek tussenstops</span><strong>${clockMinutes(calc.deducted)}</strong></div>
        <div><span>Netto werkelijk</span><strong>${clockMinutes(calc.net)}</strong></div>
        <div class="primary"><span>Te boeken</span><strong>${displayMinutes(calc.booked)}</strong></div>
      </div>
      <div id="inlineStopColleagues" class="inline-stop-colleagues">${colleagueSection(calc.booked, 'inlineStop')}</div>
      <button id="saveInlineStop" class="btn primary full start-confirm">Taak opslaan</button>
      <div class="inline-register-context">× hervat de taak zonder deze stop op te slaan.</div>`;

    const getAllocations = wireColleagueSection('inlineStop', calc.booked);

    $('#resumeInlineTask')?.addEventListener('click', () => {
      state.timer.status = 'active';
      state.timer.stopISO = null;
      saveState();
      panelMode = 'overview';
      render();
      toast('Taak hervat');
    });

    $('#saveInlineStop')?.addEventListener('click', () => {
      const allocations = getAllocations();
      allocations.forEach(allocation => {
        const colleague = colleagueById(allocation.colleagueId);
        if (colleague) colleague.usageCount = (colleague.usageCount || 0) + 1;
      });
      const colleagueMinutes = allocations.reduce((sum, allocation) => sum + allocation.minutes, 0);
      const entry = normalizeEntry({
        id: state.timer.sessionId,
        activityType: 'normal',
        parentActivityId: null,
        kind: 'Stopwatch',
        dateISO: state.timer.stopISO,
        themeId: state.timer.themeId,
        themeName: state.timer.themeName,
        subthemeId: state.timer.subthemeId,
        subthemeName: state.timer.subthemeName,
        locationName: state.timer.locationName,
        note: state.timer.note,
        startISO: state.timer.startISO,
        endISO: state.timer.stopISO,
        actualMinutes: calc.span,
        netActualMinutes: calc.net,
        deductedInterruptionMinutes: calc.deducted,
        roundedMinutes: calc.booked,
        ownMinutes: calc.booked,
        colleagueMinutes,
        totalMinutes: calc.booked + colleagueMinutes,
        allocations,
        roundingSnapshot: roundingSnapshot(),
        createdAt: new Date().toISOString()
      });
      state.entries.push(entry);
      state.lastCompletion = { type: 'task', entryId: entry.id, completedAt: new Date().toISOString() };
      state.timer = defaultTimer();
      saveState();
      panelMode = 'overview';
      render();
      toast('Taak opgeslagen');
    });
  }

  function detailLine(label, value) {
    if (!value) return '';
    return `<div class="activity-inline-item"><span>${safeText(label)}</span><strong>${safeText(value)}</strong></div>`;
  }

  function entryDetailsHtml(entry) {
    const children = state.entries.filter(item => item.parentActivityId === entry.id);
    const period = entry.startISO && entry.endISO ? `${timeText(entry.startISO)} – ${timeText(entry.endISO)}` : dateText(entry.dateISO);
    return `
      <div class="activity-inline-details-inner">
        <div class="activity-inline-grid">
          ${detailLine('Werkelijk', clockMinutes(entry.actualMinutes))}
          ${detailLine('Geboekt', displayMinutes(entry.ownMinutes))}
          ${entry.colleagueMinutes ? detailLine('Collega-inzet', displayMinutes(entry.colleagueMinutes)) : ''}
          ${entry.totalMinutes !== entry.ownMinutes ? detailLine('Totale inzet', displayMinutes(entry.totalMinutes)) : ''}
          ${entry.deductedInterruptionMinutes ? detailLine('Aftrek tussenstops', clockMinutes(entry.deductedInterruptionMinutes)) : ''}
          ${entry.activityType === 'interruption' && entry.deductMinutes ? detailLine('Aftrek hoofdtaak', clockMinutes(entry.deductMinutes)) : ''}
        </div>
        <div class="activity-inline-context">
          ${detailLine('Tijd', period)}
          ${entry.locationName ? detailLine('Locatie', entry.locationName) : ''}
          ${entry.departmentName ? detailLine('Afdeling', entry.departmentName) : ''}
          ${entry.people?.length ? detailLine('Bij / met', entry.people.map(person => person.name).join(', ')) : ''}
          ${entry.note ? detailLine('Notitie', entry.note) : ''}
          ${children.length ? detailLine('Tussenstops', String(children.length)) : ''}
        </div>
        <div class="activity-inline-actions">
          <button type="button" class="activity-edit-link" data-inline-edit="${entry.id}">Bewerken</button>
        </div>
      </div>`;
  }

  function enhanceEntries(main) {
    const entries = [...main.querySelectorAll('.section .list > .entry[data-entry]')];
    for (const original of entries) {
      if (original.closest('.activity-entry-shell')) continue;
      const id = original.dataset.entry;
      const entry = entryById(id);
      if (!entry) continue;

      const clean = original.cloneNode(true);
      clean.classList.add('activity-swipe-surface');
      clean.removeAttribute('style');

      const shell = document.createElement('div');
      shell.className = `activity-entry-shell${entry.activityType === 'interruption' ? ' interruption-shell' : ''}`;
      shell.dataset.id = id;
      const canDelete = state.settings.swipeDeleteEnabled !== false;
      const canReopen = state.timer.status === 'inactive' && state.lastCompletion?.type === 'task' && state.lastCompletion.entryId === id && entry.activityType !== 'interruption';
      const actionCount = (canDelete ? 1 : 0) + 1;
      shell.innerHTML = `
        <div class="activity-swipe-row" data-id="${safeText(id)}">
          ${canReopen ? `<div class="activity-swipe-actions activity-swipe-actions-left" style="--activity-action-count:1"><button type="button" class="activity-swipe-action activity-swipe-reopen" data-swipe-action="reopen" aria-label="Taak opnieuw activeren">Activeer</button></div>` : ''}
          <div class="activity-swipe-actions activity-swipe-actions-right" style="--activity-action-count:${actionCount}">
            ${canDelete ? `<button type="button" class="activity-swipe-action activity-swipe-delete" data-swipe-action="delete" aria-label="Registratie verwijderen">Verwijder</button>` : ''}
            <button type="button" class="activity-swipe-action activity-swipe-edit" data-swipe-action="edit" aria-label="Registratie bewerken">Bewerk</button>
          </div>
        </div>
        <div class="activity-inline-details" ${expandedEntryId === id ? '' : 'hidden'}></div>`;
      const swipeRow = shell.querySelector('.activity-swipe-row');
      swipeRow.appendChild(clean);
      original.replaceWith(shell);

      const details = shell.querySelector('.activity-inline-details');
      shell.querySelector('[data-swipe-action="edit"]')?.addEventListener('click', event => {
        event.stopPropagation();
        resetActivitySwipe(swipeRow);
        openEntryEdit(id);
      });
      shell.querySelector('[data-swipe-action="delete"]')?.addEventListener('click', event => {
        event.stopPropagation();
        resetActivitySwipe(swipeRow);
        deleteEntryInline(id);
      });
      shell.querySelector('[data-swipe-action="reopen"]')?.addEventListener('click', event => {
        event.stopPropagation();
        resetActivitySwipe(swipeRow);
        reopenLastTask(id);
      });
      if (expandedEntryId === id) {
        shell.classList.add('expanded');
        details.innerHTML = entryDetailsHtml(entry);
      }

      clean.addEventListener('click', () => {
        if (clean.dataset.suppressClick === '1') return;
        expandedEntryId = expandedEntryId === id ? null : id;
        main.querySelectorAll('.activity-entry-shell').forEach(other => {
          const otherDetails = other.querySelector('.activity-inline-details');
          const open = other.dataset.id === expandedEntryId;
          other.classList.toggle('expanded', open);
          if (open) {
            const item = entryById(other.dataset.id);
            otherDetails.innerHTML = item ? entryDetailsHtml(item) : '';
            otherDetails.hidden = false;
          } else {
            otherDetails.hidden = true;
            otherDetails.innerHTML = '';
          }
        });
        bindInlineEditButtons(main);
      });
    }
    bindInlineEditButtons(main);
  }

  function bindInlineEditButtons(root) {
    $$('[data-inline-edit]', root).forEach(button => {
      if (button.dataset.bound === '1') return;
      button.dataset.bound = '1';
      button.addEventListener('click', event => {
        event.stopPropagation();
        openEntryEdit(button.dataset.inlineEdit);
      });
    });
  }

  function resetActivitySwipe(row) {
    if (!row) return;
    const surface = row.querySelector('.activity-swipe-surface');
    if (surface) {
      surface.style.transition = 'transform .18s ease';
      surface.style.transform = 'translateX(0)';
    }
    row.classList.remove('delete-armed', 'swipe-open');
  }

  function closeActivitySwipes(except = null) {
    document.querySelectorAll('.activity-swipe-row').forEach(row => {
      if (row !== except) resetActivitySwipe(row);
    });
  }

  function activitySwipeStart(event) {
    if (screenSwipe?.pointerId === event.pointerId) return;
    if (event.button != null && event.button !== 0) return;
    if (event.target.closest('button,input,select,textarea')) return;
    const surface = event.target.closest('.activity-swipe-surface');
    if (!surface) return;
    const row = surface.closest('.activity-swipe-row');
    closeActivitySwipes(row);
    activitySwipe = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      dx: 0,
      row,
      surface,
      id: row?.dataset.id || surface.dataset.entry,
      horizontal: false,
      cancelled: false
    };
    try { surface.setPointerCapture(event.pointerId); } catch (_) {}
  }

  function activitySwipeMove(event) {
    const gesture = activitySwipe;
    if (!gesture || gesture.pointerId !== event.pointerId || gesture.cancelled) return;
    const rawX = event.clientX - gesture.startX;
    const rawY = event.clientY - gesture.startY;
    if (!gesture.horizontal) {
      if (Math.abs(rawY) > 10 && Math.abs(rawY) > Math.abs(rawX)) {
        gesture.cancelled = true;
        return;
      }
      if (Math.abs(rawX) > 8 && Math.abs(rawX) > Math.abs(rawY)) gesture.horizontal = true;
      else return;
    }
    event.preventDefault();
    const rightCount = gesture.row?.querySelectorAll('.activity-swipe-actions-right .activity-swipe-action').length || 0;
    const leftCount = gesture.row?.querySelectorAll('.activity-swipe-actions-left .activity-swipe-action').length || 0;
    const rightDistance = rightCount * 84;
    const leftDistance = leftCount * 84;
    const dx = Math.max(-rightDistance, Math.min(leftDistance, rawX));
    gesture.rightDistance = rightDistance;
    gesture.leftDistance = leftDistance;
    gesture.dx = dx;
    gesture.surface.style.transition = 'none';
    gesture.surface.style.transform = `translateX(${dx}px)`;
    gesture.row.classList.remove('delete-armed');
  }

  function deleteEntryInline(id) {
    const entry = entryById(id);
    if (!entry) return;
    const parentId = entry.parentActivityId;
    state.entries = state.entries.filter(item => item.id !== id && item.parentActivityId !== id);
    if (parentId) {
      const parent = entryById(parentId);
      if (parent) recalculateNormalEntry(parent);
    }
    if (expandedEntryId === id) expandedEntryId = null;
    saveState();
    render();
    toast('Registratie verwijderd');
  }

  function activitySwipeEnd(event) {
    const gesture = activitySwipe;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    activitySwipe = null;
    if (gesture.cancelled || !gesture.horizontal) {
      resetActivitySwipe(gesture.row);
      return;
    }
    gesture.surface.dataset.suppressClick = '1';
    setTimeout(() => { if (gesture.surface) delete gesture.surface.dataset.suppressClick; }, 450);
    const target = gesture.dx >= 36 ? gesture.leftDistance : gesture.dx <= -36 ? -gesture.rightDistance : 0;
    if (target) {
      gesture.surface.style.transition = 'transform .18s cubic-bezier(.2,.8,.2,1)';
      gesture.surface.style.transform = `translateX(${target}px)`;
      gesture.row.classList.add('swipe-open');
      return;
    }
    resetActivitySwipe(gesture.row);
  }

  function activitySwipeCancel() {
    if (activitySwipe) resetActivitySwipe(activitySwipe.row);
    activitySwipe = null;
  }

  function modalIsOpen() {
    return !$('#modalBackdrop')?.classList.contains('hidden');
  }

  function screenSwipeStart(event) {
    if (event.button != null && event.button !== 0) return;
    const width = Math.max(document.documentElement.clientWidth || 0, window.innerWidth || 0);
    const x = event.clientX;
    const direction = !modalIsOpen() && x >= width - SCREEN_EDGE_SWIPE_ZONE
      ? 'left'
      : modalIsOpen() && x <= SCREEN_EDGE_SWIPE_ZONE
        ? 'right'
        : null;
    if (!direction) return;
    if (event.target.closest('input,select,textarea,[contenteditable="true"]')) return;
    screenSwipe = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      dx: 0,
      dy: 0,
      direction,
      horizontal: false,
      cancelled: false
    };
  }

  function screenSwipeMove(event) {
    const gesture = screenSwipe;
    if (!gesture || gesture.pointerId !== event.pointerId || gesture.cancelled) return;
    const dx = event.clientX - gesture.startX;
    const dy = event.clientY - gesture.startY;
    gesture.dx = dx;
    gesture.dy = dy;
    if (!gesture.horizontal) {
      if (Math.abs(dy) > 12 && Math.abs(dy) > Math.abs(dx)) {
        gesture.cancelled = true;
        return;
      }
      if (Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy) * 1.15) gesture.horizontal = true;
      else return;
    }
    const correct = gesture.direction === 'left' ? dx < 0 : dx > 0;
    if (!correct) {
      if (Math.abs(dx) > 18) gesture.cancelled = true;
      return;
    }
    if (event.cancelable) event.preventDefault();
  }

  function screenSwipeEnd(event) {
    const gesture = screenSwipe;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    screenSwipe = null;
    if (gesture.cancelled || !gesture.horizontal) return;
    const correct = gesture.direction === 'left'
      ? gesture.dx <= -SCREEN_EDGE_SWIPE_DISTANCE
      : gesture.dx >= SCREEN_EDGE_SWIPE_DISTANCE;
    if (!correct || Math.abs(gesture.dx) < Math.abs(gesture.dy) * 1.2) return;
    if (gesture.direction === 'left' && currentView === 'home') openSettings();
    else if (gesture.direction === 'right' && currentView === 'settings') closeSettings();
    else closeModal();
  }

  function screenSwipeCancel() {
    screenSwipe = null;
  }

  function applyHomeLayout() {
    if (applying) return;
    applying = true;
    try {
      const main = document.querySelector('#main');
      if (!main) return;

      if (state.timer.status !== 'inactive' && panelMode === 'task') panelMode = 'overview';
      if ((state.timer.status !== 'active' || state.timer.interruption) && panelMode === 'interruption') panelMode = 'overview';
      if (state.timer.status !== 'pending' && panelMode === 'stop') panelMode = 'overview';

      const action = main.querySelector(':scope > .suggestion, :scope > .active-card');
      const period = main.querySelector(':scope > .period-nav, :scope > .period-overview');
      const summary = main.querySelector(':scope > .summary');
      const undo = main.querySelector(':scope > .undo-completion');

      if (action && main.firstElementChild !== action) main.insertBefore(action, main.firstElementChild);
      if (action && undo && action.nextElementSibling !== undo) action.after(undo);
      compactAction(action);

      if (panelMode === 'task' && period) renderTaskPanel(period);
      else if (panelMode === 'interruption' && period) renderInterruptionPanel(period);
      else if (panelMode === 'stop' && period) renderStopPanel(period);
      else if (panelMode === 'period-chooser' && period) renderPeriodChooser(period);
      else setupPeriodOverview(period, summary);

      enhanceEntries(main);
    } finally {
      applying = false;
    }
  }

  document.addEventListener('pointerdown', screenSwipeStart);
  document.addEventListener('pointermove', screenSwipeMove);
  document.addEventListener('pointerup', screenSwipeEnd);
  document.addEventListener('pointercancel', screenSwipeCancel);
  document.addEventListener('pointerdown', activitySwipeStart);
  document.addEventListener('pointermove', activitySwipeMove);
  document.addEventListener('pointerup', activitySwipeEnd);
  document.addEventListener('pointercancel', activitySwipeCancel);
  document.addEventListener('touchstart', periodTouchStart, { passive: true });
  document.addEventListener('touchmove', periodTouchMove, { passive: false });
  document.addEventListener('touchend', periodTouchEnd, { passive: true });
  document.addEventListener('touchcancel', () => { periodGesture = null; }, { passive: true });
  document.addEventListener('dblclick', event => {
    if (event.target.closest?.('.period-overview') && panelMode === 'overview' && !event.target.closest?.('button,input,select,textarea')) resetCurrentPeriod();
  });

  document.addEventListener('DOMContentLoaded', () => {
    const main = document.querySelector('#main');
    if (!main) return;
    applyHomeLayout();

    let queued = false;
    const observer = new MutationObserver(() => {
      if (queued || applying) return;
      queued = true;
      queueMicrotask(() => {
        queued = false;
        applyHomeLayout();
      });
    });
    observer.observe(main, { childList: true, subtree: false });
  });
})();
