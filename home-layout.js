(function () {
  const applyHomeLayout = () => {
    const main = document.querySelector('#main');
    if (!main) return;

    const action = main.querySelector(':scope > .suggestion, :scope > .active-card');
    const period = main.querySelector(':scope > .period-nav');
    const summary = main.querySelector(':scope > .summary');

    if (action && main.firstElementChild !== action) {
      main.insertBefore(action, main.firstElementChild);
    }

    if (period) {
      period.classList.add('period-overview');
      if (summary && summary.parentElement === main) {
        summary.classList.add('period-summary');
        period.appendChild(summary);
      }
    }
  };

  document.addEventListener('DOMContentLoaded', () => {
    const main = document.querySelector('#main');
    if (!main) return;

    applyHomeLayout();

    let queued = false;
    const observer = new MutationObserver(() => {
      if (queued) return;
      queued = true;
      queueMicrotask(() => {
        queued = false;
        applyHomeLayout();
      });
    });

    observer.observe(main, { childList: true });
  });
})();