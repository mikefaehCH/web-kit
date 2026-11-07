import { site } from './config.js';
document.documentElement.lang = site.locale;
document.documentElement.style.setProperty('--accent', site.color);
document.title = site.title;
document.querySelector('#title').textContent = site.title;
document.querySelector('#description').textContent = site.description;
const navigation = document.querySelector('#section-navigation');
const sections = document.querySelector('#sections');
const showNavigation = site.content.sections.length > 1;
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
navigation.hidden = !showNavigation;
if (site.modules.offline && 'serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js', { scope: './' }).catch(() => {
    document.querySelector('#offline-status').textContent =
      'Offline-Nutzung konnte nicht vorbereitet werden.';
  });
}
