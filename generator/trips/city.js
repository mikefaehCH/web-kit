export default {
  id: 'demo-city',
  title: 'Ein Wochenende in der Stadt',
  description:
    'Fiktive Beispielreise. Orte und Termine dienen ausschliesslich zum Testen der Vorlage.',
  locale: 'de-CH',
  color: '#28594f',
  start: '2028-05-12',
  end: '2028-05-14',
  modules: { places: true, map: true, favorites: true, planning: true, offline: true },
  places: [
    {
      id: 'museum',
      name: 'Beispielmuseum',
      category: 'Kultur',
      description: 'Ein ruhiger Vormittag mit Kunst und Architektur.',
      coordinates: [47.37, 8.54],
    },
    {
      id: 'park',
      name: 'Beispielpark',
      category: 'Draussen',
      description: 'Zeit für einen Spaziergang und ein Picknick.',
      coordinates: [47.375, 8.545],
    },
    {
      id: 'market',
      name: 'Beispielmarkt',
      category: 'Genuss',
      description: 'Gemeinsam Neues entdecken und etwas Kleines essen.',
      coordinates: [47.38, 8.53],
    },
  ],
};
