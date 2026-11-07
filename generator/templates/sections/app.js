import { site } from './config.js';
document.documentElement.lang = site.locale;
document.documentElement.style.setProperty('--accent', site.color);
document.title = site.title;
document.querySelector('#title').textContent = site.title;
document.querySelector('#description').textContent = site.description;
const navigation = document.querySelector('#section-navigation');
const sections = document.querySelector('#sections');
const hybrid = site.mode === 'hybrid';
const showNavigation = site.content.sections.length > 1 || hybrid;
for (const [index, item] of site.content.sections.entries()) {
  const section = document.createElement('section');
  const heading = document.createElement('h2');
  const paragraph = document.createElement('p');
  section.id = 'abschnitt-' + (index + 1);
  section.tabIndex = -1;
  if (showNavigation) {
    const link = document.createElement('a');
    link.href = '#' + section.id;
    link.textContent = item.heading;
    navigation.append(link);
  }
  heading.textContent = item.heading;
  paragraph.textContent = item.text;
  section.append(heading, paragraph);
  sections.append(section);
}
if (hybrid) {
  const link = document.createElement('a');
  link.href = '#planner';
  link.textContent = 'Mein Planer';
  navigation.append(link);
}
navigation.hidden = !showNavigation;
if (site.mode) {
  document.body.classList.add('with-planner');
  const planner = document.querySelector('#planner');
  planner.hidden = false;
  import('./modules/planner.js')
    .then(({ mountPlanner }) => mountPlanner(planner, site.id))
    .catch(() => {
      planner.querySelector('#planner-status').textContent = 'Der Planer konnte nicht geladen werden.';
    });
}
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
