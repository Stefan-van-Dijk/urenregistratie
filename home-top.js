(function () {
  'use strict';

  const APP_VERSION = '0.4.3';

  function dateVersionText() {
    const date = new Intl.DateTimeFormat('nl-NL', {
      weekday: 'long',
      day: 'numeric',
      month: 'long'
    }).format(new Date());
    return `${date} · v${APP_VERSION}`;
  }

  function taskCount() {
    return Array.isArray(state?.entries)
      ? state.entries.filter(entry => entry.activityType !== 'interruption').length
      : 0;
  }

  function syncHeader() {
    const date = document.querySelector('#appDateVersion');
    const count = document.querySelector('#appTaskCount');
    const dateText = dateVersionText();
    const total = taskCount();
    const countText = count?.dataset.navigationView === 'settings'
      ? 'Tijdsregistratie'
      : `${total} ${total === 1 ? 'taak' : 'taken'} geregistreerd`;

    if (date && date.textContent !== dateText) date.textContent = dateText;
    if (count && count.textContent !== countText) count.textContent = countText;
  }

  function syncPrimaryAction() {
    const button = document.querySelector('#registerTaskInline');
    if (!button) return;
    const preparing = Boolean(document.querySelector('#cancelInlineTask'));
    const label = preparing ? 'Annuleer taak' : 'Taak registreren';
    if (button.textContent !== label) button.textContent = label;
    button.classList.toggle('primary', !preparing);
    button.classList.toggle('task-cancel-button', preparing);
  }

  function sync() {
    syncHeader();
    syncPrimaryAction();
  }

  document.addEventListener('click', event => {
    const button = event.target.closest?.('#registerTaskInline');
    if (!button) return;

    const cancel = document.querySelector('#cancelInlineTask');
    if (cancel) {
      event.preventDefault();
      event.stopImmediatePropagation();
      cancel.click();
      return;
    }

    requestAnimationFrame(() => {
      document.querySelector('.period-entry-mode')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
  }, true);

  document.addEventListener('DOMContentLoaded', () => {
    sync();
    const main = document.querySelector('#main');
    if (!main) return;
    let queued = false;
    const observer = new MutationObserver(() => {
      if (queued) return;
      queued = true;
      queueMicrotask(() => {
        queued = false;
        sync();
      });
    });
    observer.observe(main, { childList: true, subtree: true });
  });
})();
