(function () {
  let panelMode = 'overview';
  let applying = false;

  const colleagueById = id => state.colleagues.find(c => c.id === id);

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

  function compactAction(action) {
    if (!action) return;

    if (state.timer.status === 'inactive') {
      const s = suggestion();
      action.classList.add('home-action');
      action.innerHTML = `
        <div class="kicker">${s ? 'Waarschijnlijk nu' : 'Nieuwe activiteit'}</div>
        <div class="home-action-row">
          <div class="home-action-copy">
            <h2>${safeText(s?.theme?.name || 'Wat ga je doen?')}</h2>
            ${s?.sub ? `<p>${safeText(s.sub.name)}</p>` : '<p>Kies een taak en start direct.</p>'}
            ${s?.locationName ? `<small>⌖ ${safeText(s.locationName)}</small>` : ''}
          </div>
          <button id="registerTaskInline" class="btn primary home-action-button">Taak registreren</button>
        </div>`;
      $('#registerTaskInline')?.addEventListener('click', () => {
        panelMode = 'task';
        const period = document.querySelector('#main > .period-nav, #main > .period-overview');
        if (period) renderTaskPanel(period);
      });
      return;
    }

    if (state.timer.status === 'active' && !state.timer.interruption) {
      const original = action.querySelector('#startInterruption');
      if (original && !original.dataset.inlineBound) {
        const replacement = original.cloneNode(true);
        replacement.dataset.inlineBound = '1';
        replacement.textContent = 'Tussenstop';
        original.replaceWith(replacement);
        replacement.addEventListener('click', () => {
          panelMode = 'interruption';
          const period = document.querySelector('#main > .period-nav, #main > .period-overview');
          if (period) renderInterruptionPanel(period);
        });
      }
    }
  }

  function setupPeriodOverview(period, summary) {
    if (!period) return;
    period.classList.add('period-overview');
    period.classList.remove('period-entry-mode');
    if (summary && summary.parentElement === document.querySelector('#main')) {
      summary.classList.add('period-summary');
      period.appendChild(summary);
    }
  }

  function renderTaskPanel(period) {
    panelMode = 'task';
    const s = suggestion();
    const selectedThemeId = s?.theme?.id || sortedByUsage(state.themes)[0]?.id || '';
    const selectedSubId = s?.sub?.id || '';

    period.classList.add('period-overview', 'period-entry-mode');
    period.innerHTML = `
      <div class="inline-register-head">
        <div>
          <div class="kicker">Taak registreren</div>
          <h2>Start je taak</h2>
        </div>
        <button id="cancelInlineTask" class="period-arrow inline-close" type="button" aria-label="Annuleren">×</button>
      </div>
      ${s ? `<div class="inline-proposal"><span>Voorstel</span><strong>${safeText(s.theme.name)}${s.sub ? ` · ${safeText(s.sub.name)}` : ''}</strong></div>` : ''}
      ${state.themes.length ? `
        <div class="inline-fields">
          <label class="inline-field"><span>Thema</span><select id="inlineTaskTheme">${themeOptions(selectedThemeId)}</select></label>
          <label class="inline-field"><span>Subthema</span><select id="inlineTaskSub">${selectedThemeId ? subthemeOptions(selectedThemeId, selectedSubId) : '<option value="">Geen subthema</option>'}</select></label>
          <label class="inline-field inline-field-wide"><span>Locatie <small>optioneel</small></span><input id="inlineTaskLocation" value="${safeText(s?.locationName || '')}" placeholder="Bijvoorbeeld kantoor"></label>
        </div>
        <button id="startInlineTask" class="btn primary full">Start taak</button>
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
      <button id="startInlineInterruption" class="btn primary full">Start tussenstop</button>`;

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
      const selected = new Set($$('#inlineInterruptPeople input:checked').map(i => i.value));
      const colleague = addColleague($('#inlineInterruptNewColleague').value);
      if (!colleague) return toast('Vul eerst een naam in');
      selected.add(colleague.id);
      renderInterruptionPanel(period);
      requestAnimationFrame(() => {
        $$('#inlineInterruptPeople input').forEach(i => { i.checked = selected.has(i.value); });
      });
      toast('Collega toegevoegd');
    });

    $('#startInlineInterruption')?.addEventListener('click', () => {
      const people = $$('#inlineInterruptPeople input:checked').map(input => {
        const c = colleagueById(input.value);
        if (!c) return null;
        c.usageCount = (c.usageCount || 0) + 1;
        return { id: c.id, name: c.name };
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

  function applyHomeLayout() {
    if (applying) return;
    applying = true;
    try {
      const main = document.querySelector('#main');
      if (!main) return;

      if (state.timer.status !== 'inactive' && panelMode === 'task') panelMode = 'overview';
      if ((state.timer.status !== 'active' || state.timer.interruption) && panelMode === 'interruption') panelMode = 'overview';

      const action = main.querySelector(':scope > .suggestion, :scope > .active-card');
      const period = main.querySelector(':scope > .period-nav, :scope > .period-overview');
      const summary = main.querySelector(':scope > .summary');

      if (action && main.firstElementChild !== action) main.insertBefore(action, main.firstElementChild);
      compactAction(action);

      if (panelMode === 'task' && period) {
        renderTaskPanel(period);
      } else if (panelMode === 'interruption' && period) {
        renderInterruptionPanel(period);
      } else {
        setupPeriodOverview(period, summary);
      }
    } finally {
      applying = false;
    }
  }

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
    observer.observe(main, { childList: true });
  });
})();