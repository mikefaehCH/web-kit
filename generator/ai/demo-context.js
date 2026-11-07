const demoPages = {
  'etappe-1': { title: 'Etappe 1 · Birkenhafen', destination: 'Birkenhafen', url: './etappe-1.html', distance: '14 km' },
  'etappe-2': { title: 'Etappe 2 · Lindenbrück', destination: 'Lindenbrück', url: './etappe-2.html', distance: '18 km' },
};
export function demoContext(page) {
  if (!Object.hasOwn(demoPages, page)) throw Error('Für diese Seite ist kein Demo-Kontext hinterlegt.');
  const context = demoPages[page];
  let lastTopic;
  return {
    title: context.title,
    async request(question) {
      const normalized = question.trim().toLowerCase();
      const overview = { label: 'Etappenübersicht', url: context.url + '#etappeninfo' };
      const route = { label: 'Route und GPX', url: context.url + '#gpx' };
      const asksForGpx = /\bgpx\b/.test(normalized) ||
        (lastTopic === 'route' && /^(?:und )?(?:wo finde ich die datei|kann ich (?:sie|die datei) herunterladen)[?!.]*$/.test(normalized));
      const asksForDestination = /wo (?:genau )?endet|wo (?:liegt|ist) (?:das )?ziel|was ist (?:das )?ziel|wie hei(?:ss|ß)t (?:der )?zielort|wohin/.test(normalized);
      if (asksForGpx) {
        lastTopic = 'route';
        const hint = 'Unter «Route und GPX» steht der Hinweis zur fiktiven Route. Diese Demo bietet keine GPX-Datei zum Download.';
        return {
          answer: asksForDestination ? 'Die Etappe endet in ' + context.destination + '. ' + hint : hint,
          sources: asksForDestination ? [overview, route] : [route],
        };
      }
      if (asksForDestination) {
        lastTopic = 'route';
        return { answer: 'Die Etappe endet in ' + context.destination + '.', sources: [overview] };
      }
      if (/wie viele kilometer|wie lang|wie gross ist die distanz|^distanz[?!.]*$/.test(normalized) ||
          (lastTopic === 'route' && /wie weit/.test(normalized))) {
        return {
          answer: 'Die Etappe bis ' + context.destination + ' ist ' + context.distance + ' lang.',
          sources: [overview],
        };
      }
      return { answer: 'Dazu enthält diese fiktive Etappe keine freigegebene Angabe.' };
    },
  };
}
