const links = [...document.querySelectorAll('nav a[href="#cockpit"], nav a[href="#communication"]')];
const sections = ['cockpit', 'communication'];
function showPage() {
  const page = location.hash === '#communication' ? 'communication' : 'cockpit';
  for (const id of sections) document.getElementById(id).hidden = id !== page;
  for (const link of links) {
    if (link.getAttribute('href') === '#' + page) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  }
  document.title = page === 'cockpit' ? 'Web-Kit · Cockpit' : 'Web-Kit · Kommunikation';
}
window.addEventListener('hashchange', showPage);
showPage();
