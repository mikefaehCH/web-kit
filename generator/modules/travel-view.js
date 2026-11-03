import { validateTrip, daysFor } from './config.js';
import { readState, writeState, exportState, importState } from './state.js';
import { filterPlaces } from './places.js';

export function mountTrip(trips, defaultTrip) {
  const $ = (selector) => document.querySelector(selector);
  const requested = new URL(location.href).searchParams.get('trip');
  const selected = Object.hasOwn(trips, requested) ? requested : defaultTrip;
  const trip = validateTrip(trips[selected]);
  let state;
  try {
    state = readState(localStorage, trip);
  } catch {
    state = { version: 1, favorites: [], plan: [] };
  }
  let pendingImport = null;
  let map = null;
  const report = (message) => {
    $('#feedback').textContent = message;
  };
  const node = (tag, text, className) => {
    const element = document.createElement(tag);
    if (text) element.textContent = text;
    if (className) element.className = className;
    return element;
  };
  const button = (text, action) => {
    const element = node('button', text);
    element.type = 'button';
    element.addEventListener('click', action);
    return element;
  };
  const dateLabel = (day) =>
    new Intl.DateTimeFormat(trip.locale, { dateStyle: 'medium', timeZone: 'UTC' }).format(
      new Date(day),
    );
  function save() {
    let saved = false;
    try {
      saved = writeState(localStorage, trip, state);
    } catch {}
    if (!saved)
      report(
        'Speichern auf diesem Gerät nicht möglich. Bitte den Plan exportieren, bevor du die Seite schliesst.',
      );
    return saved;
  }
  document.title = trip.title;
  document.documentElement.lang = trip.locale;
  document.documentElement.style.setProperty('--accent', trip.color);
  $('#title').textContent = trip.title;
  $('#description').textContent = trip.description;
  $('#dates').textContent = dateLabel(trip.start) + ' – ' + dateLabel(trip.end);
  $('#trip-id').textContent = trip.id;
  for (const [key, value] of Object.entries(trips)) {
    const option = node('option', value.title);
    option.value = key;
    option.selected = key === selected;
    $('#trip-select').append(option);
  }
  $('#trip-picker').hidden = Object.keys(trips).length < 2;
  $('#trip-select').addEventListener('change', (event) => {
    const url = new URL(location.href);
    url.searchParams.set('trip', event.target.value);
    url.hash = '';
    location.assign(url.href);
  });
  for (const category of [...new Set(trip.places.map((place) => place.category))]) {
    const option = node('option', category);
    option.value = category;
    $('#category').append(option);
  }
  for (const [module, selector] of [
    ['places', '#places'],
    ['places', '#places-link'],
    ['favorites', '#favorites-filter'],
    ['planning', '#planning'],
    ['planning', '#plan-link'],
    ['map', '#map-section'],
    ['map', '#map-link'],
    ['offline', '#offline-section'],
  ])
    $(selector).hidden = !trip.modules[module];
  function visiblePlaces() {
    return filterPlaces(trip.places, {
      query: $('#search').value,
      category: $('#category').value,
      favorites: trip.modules.favorites && $('#favorites-only').checked ? state.favorites : null,
    });
  }
  function renderPlaces() {
    const visible = visiblePlaces();
    $('#count').textContent = visible.length + ' von ' + trip.places.length + ' Orten';
    $('#place-list').replaceChildren();
    for (const place of visible) {
      const card = node('article', null, 'card');
      card.append(
        node('p', place.category, 'eyebrow'),
        node('h3', place.name),
        node('p', place.description),
      );
      const actions = node('div', null, 'actions');
      if (trip.modules.favorites) {
        const favorite = button(
          state.favorites.includes(place.id) ? 'Favorit entfernen' : 'Als Favorit merken',
          () => {
            state.favorites = state.favorites.includes(place.id)
              ? state.favorites.filter((id) => id !== place.id)
              : [...state.favorites, place.id];
            save();
            renderPlaces();
            $('#place-list').querySelector(`[data-favorite="${place.id}"]`)?.focus();
          },
        );
        favorite.dataset.favorite = place.id;
        favorite.setAttribute('aria-pressed', String(state.favorites.includes(place.id)));
        favorite.setAttribute('aria-label', favorite.textContent + ': ' + place.name);
        actions.append(favorite);
      }
      if (trip.modules.planning) {
        const label = node('label', 'Einplanen am');
        const select = node('select');
        select.setAttribute('aria-label', 'Tag für ' + place.name);
        for (const day of daysFor(trip)) {
          const option = node('option', dateLabel(day));
          option.value = day;
          select.append(option);
        }
        label.append(select);
        actions.append(
          label,
          button('Einplanen', () => {
            if (
              state.plan.some((entry) => entry.placeId === place.id && entry.day === select.value)
            ) {
              report('Dieser Ort ist an diesem Tag bereits eingeplant.');
              return;
            }
            state.plan.push({ placeId: place.id, day: select.value });
            if (save()) report(place.name + ' eingeplant.');
            renderPlan();
          }),
        );
      }
      card.append(actions);
      $('#place-list').append(card);
    }
    if (!visible.length)
      $('#place-list').append(node('p', 'Keine passenden Orte. Ändere die Suche oder die Filter.'));
    map?.update(visible);
  }
  function renderPlan() {
    $('#plan-list').replaceChildren();
    for (const day of daysFor(trip)) {
      const section = node('section', null, 'plan-day');
      section.append(node('h3', dateLabel(day)));
      const entries = state.plan.filter((entry) => entry.day === day);
      if (!entries.length) section.append(node('p', 'Noch nichts geplant.'));
      for (const entry of entries) {
        const place = trip.places.find((item) => item.id === entry.placeId);
        const row = node('div', null, 'plan-row');
        row.append(
          node('span', place.name),
          button('Entfernen: ' + place.name, () => {
            state.plan = state.plan.filter((item) => item !== entry);
            save();
            renderPlan();
            $('#plan-title').tabIndex = -1;
            $('#plan-title').focus();
          }),
        );
        section.append(row);
      }
      $('#plan-list').append(section);
    }
  }
  $('#search').addEventListener('input', renderPlaces);
  $('#category').addEventListener('change', renderPlaces);
  $('#favorites-only').addEventListener('change', renderPlaces);
  $('#export').addEventListener('click', () => {
    const url = URL.createObjectURL(
      new Blob([exportState(trip, state)], { type: 'application/json' }),
    );
    const link = node('a');
    link.href = url;
    link.download = trip.id + '-plan.json';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  $('#import').addEventListener('change', async (event) => {
    pendingImport = null;
    $('#confirm-import').hidden = true;
    $('#import-review').hidden = true;
    try {
      const file = event.target.files[0];
      if (!file) return;
      if (file.size > 1000000) throw new Error('Datei zu gross');
      pendingImport = importState(await file.text(), trip);
      $('#import-review').textContent =
        pendingImport.plan.length +
        ' Planeinträge und ' +
        pendingImport.favorites.length +
        ' Favoriten. Beim Übernehmen wird dein bisheriger lokaler Plan ersetzt.';
      $('#import-review').hidden = false;
      $('#confirm-import').hidden = false;
    } catch (error) {
      report(error.message);
    }
    event.target.value = '';
  });
  $('#confirm-import').addEventListener('click', () => {
    if (!pendingImport) return;
    state = pendingImport;
    pendingImport = null;
    if (save()) report('Plan importiert.');
    renderPlan();
    renderPlaces();
    $('#confirm-import').hidden = true;
    $('#import-review').hidden = true;
  });
  renderPlaces();
  renderPlan();
  if (trip.modules.map) {
    import('./map.js')
      .then(({ mountMap }) => {
        map = mountMap($('#map'), visiblePlaces());
      })
      .catch(() => {
        $('#map').textContent = 'Die Karte konnte nicht geladen werden. Nutze die Ortsliste.';
      });
  }
  if (trip.modules.offline) {
    const offlineStatus = $('#offline-status');
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker
        .register('./sw.js', { scope: './' })
        .then(async (registration) => {
          await navigator.serviceWorker.ready;
          const update = () => {
            offlineStatus.textContent = navigator.onLine
              ? 'Offline-Grundlage bereit. Orte und Plan bleiben auf diesem Gerät verfügbar.'
              : 'Du bist offline. Orte und lokale Planung sind verfügbar.';
          };
          if (registration.active) update();
          else navigator.serviceWorker.addEventListener('controllerchange', update, { once: true });
          window.addEventListener('online', update);
          window.addEventListener('offline', update);
        })
        .catch(() => {
          offlineStatus.textContent =
            'Offline-Nutzung konnte nicht vorbereitet werden. Bitte HTTPS oder localhost verwenden.';
        });
    } else offlineStatus.textContent = 'Dieser Browser unterstützt die Offline-Vorbereitung nicht.';
  }
}
