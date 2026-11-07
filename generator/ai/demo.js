import { demoContext } from './demo-context.js';
import { mountPageAssistants } from './embed.js';

const pages = Object.fromEntries(['etappe-1', 'etappe-2'].map(id => {
  const page = demoContext(id);
  return [id, { context: page.title, demoRequest: page.request }];
}));
mountPageAssistants({
  defaults: {
    title: 'Frag zur Etappe',
    examples: ['Wo endet die Etappe und wo ist die GPX-Datei?', 'Wie viele Kilometer sind es?'],
  },
  pages,
});
