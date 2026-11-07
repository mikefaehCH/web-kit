import { site } from './config.js';
import { renderSections } from './modules/sections-renderer.js';
document.documentElement.lang = site.locale;
document.documentElement.style.setProperty('--accent', site.color);
document.title = site.title;
if (site.mode) document.body.classList.add('with-planner');
renderSections(document, site);
if (site.modules.offline && 'serviceWorker' in navigator) {
  const offlineStatus = document.querySelector('#offline-status');
  navigator.serviceWorker.register('./sw.js', { scope: './' })
    .then(() => navigator.serviceWorker.ready)
    .then(() => {
      if (site.mode) offlineStatus.textContent = 'Offline verfügbar.';
    })
    .catch(() => {
      offlineStatus.textContent = 'Offline-Nutzung konnte nicht vorbereitet werden.';
    });
}
