const demoPages = {
  'etappe-1': { title: 'Etappe 1 · Birkenhafen', destination: 'Birkenhafen', url: './etappe-1.html#gpx', distance: '14 km' },
  'etappe-2': { title: 'Etappe 2 · Lindenbrück', destination: 'Lindenbrück', url: './etappe-2.html#gpx', distance: '18 km' },
};
export function demoContext(page) {
  if (!Object.hasOwn(demoPages, page)) throw Error('Für diese Seite ist kein Demo-Kontext hinterlegt.');
  const context = demoPages[page];
  let lastTopic;
  return {
    title: context.title,
    async request(question) {
      const normalized = question.toLowerCase();
      if (/gpx|datei|download/.test(normalized)) {
        lastTopic = 'route';
        return {
          answer: 'Die Etappe endet in ' + context.destination + '. Der GPX-Hinweis steht unter «Route und GPX».',
          sources: [{ label: 'Route und GPX', url: context.url }],
        };
      }
      if (/endet|ziel|wohin/.test(normalized)) {
        lastTopic = 'route';
        return { answer: 'Die Etappe endet in ' + context.destination + '.' };
      }
      if (/distanz|kilometer|wie lang/.test(normalized) || (lastTopic === 'route' && /wie weit/.test(normalized)))
        return { answer: 'Die Etappe bis ' + context.destination + ' ist ' + context.distance + ' lang.' };
      return { answer: 'Dazu enthält diese fiktive Etappe keine freigegebene Angabe.' };
    },
  };
}
