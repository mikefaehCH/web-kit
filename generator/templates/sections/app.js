import { site } from './config.js';
document.documentElement.lang = site.locale;
document.documentElement.style.setProperty('--accent', site.color);
document.title = site.title;
document.querySelector('#title').textContent = site.title;
document.querySelector('#description').textContent = site.description;
for (const item of site.content.sections) {
  const section = document.createElement('section');
  const heading = document.createElement('h2');
  const paragraph = document.createElement('p');
  heading.textContent = item.heading;
  paragraph.textContent = item.text;
  section.append(heading, paragraph);
  document.querySelector('#sections').append(section);
}
if (site.modules.offline && 'serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js', { scope: './' }).catch(() => {
    document.querySelector('#offline-status').textContent =
      'Offline-Nutzung konnte nicht vorbereitet werden.';
  });
}
