import '../vendor/leaflet/leaflet.js';
export function mountMap(container, places) {
  const map = globalThis.L.map(container, { scrollWheelZoom: false });
  const layer = globalThis.L.layerGroup().addTo(map);
  globalThis.L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    maxZoom: 19,
  }).addTo(map);
  const status = document.createElement('p');
  status.textContent = 'Kartenkacheln benötigen Internet. Die Ortsliste bleibt offline verfügbar.';
  container.after(status);
  function update(visible) {
    layer.clearLayers();
    for (const place of visible) {
      const label = document.createElement('span');
      label.textContent = place.name;
      globalThis.L.marker(place.coordinates, {
        title: place.name,
        icon: globalThis.L.divIcon({ className: 'place-pin', html: '', iconSize: [20, 20] }),
      })
        .bindPopup(label)
        .addTo(layer);
    }
    if (visible.length)
      map.fitBounds(
        visible.map((place) => place.coordinates),
        { maxZoom: 14, padding: [24, 24] },
      );
    else map.setView([0, 0], 2);
  }
  update(places);
  return { update, destroy: () => map.remove() };
}
