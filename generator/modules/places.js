export function filterPlaces(places, { query = '', category = '', favorites = null } = {}) {
  const needle = query.trim().toLocaleLowerCase();
  return places.filter(
    (place) =>
      (!category || place.category === category) &&
      (!favorites || favorites.includes(place.id)) &&
      `${place.name} ${place.description} ${place.category}`.toLocaleLowerCase().includes(needle),
  );
}
