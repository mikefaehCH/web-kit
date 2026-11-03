export default {
  id: 'demo-walking',
  title: 'Drei Tage zu Fuss',
  description:
    'Fiktive Wanderreise zum Testen. Die Marker sind Beispiele und keine geprüfte Wanderroute.',
  locale: 'de-CH',
  color: '#80512f',
  start: '2028-06-03',
  end: '2028-06-05',
  modules: { places: true, map: true, favorites: false, planning: true, offline: true },
  places: [
    {
      id: 'start',
      name: 'Beispielstart am Fluss',
      category: 'Etappe',
      description: 'Ein kurzer Einstieg am ersten Tag.',
      coordinates: [41.15, -8.61],
    },
    {
      id: 'forest',
      name: 'Beispielrast im Wald',
      category: 'Pause',
      description: 'Eine längere Pause im Schatten.',
      coordinates: [41.17, -8.62],
    },
    {
      id: 'finish',
      name: 'Beispielziel am Hügel',
      category: 'Etappe',
      description: 'Ankommen und den Tag gemeinsam ausklingen lassen.',
      coordinates: [41.19, -8.6],
    },
  ],
};
