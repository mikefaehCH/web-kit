import { COLLECTION_PROFILE } from '../modules/planner-profiles.js';

export function briefFromSentence(input) {
  const purpose = input.trim().replace(/\s+/g, ' ');
  if (!purpose || purpose.length > 500) throw Error('Beschreibe dein Vorhaben in einem Satz (bis 500 Zeichen).');
  const collection = /\b(sammeln|sammlung|katalog|inventar|bibliothek|wiederfinden)\b/i.test(purpose);
  const planner = /\b(planer|aufgaben|checkliste|erfassen|protokollieren|tracker|verwalten)\b/i.test(purpose);
  const publicSite = /\b(website|webseite|homepage|landingpage|portfolio|landing page|vereinsseite)\b/i.test(purpose);
  const app = /\bapp\b/i.test(purpose);
  const mode = publicSite ? (app || planner ? 'hybrid' : 'website') : (app || planner || collection ? 'app' : 'website');
  const subject = purpose.replace(/^(?:ich möchte|ich will|erstelle mir|mach mir|baue mir)\s+/i, '');
  const short = subject.replace(/[.!?]+$/, '').slice(0, 76).replace(/[\uD800-\uDBFF]$/, '').trimEnd();
  const title = short ? short[0].toLocaleUpperCase('de-CH') + short.slice(1) : 'Mein Entwurf';
  const content = mode === 'app' ? undefined : {
    sections: [
      { heading: 'Überblick', text: purpose },
      { heading: 'Angebot', text: 'Beispieltext · Beschreibe hier, was Besucher auf der Website finden.' },
      { heading: 'Kontakt', text: 'Beispieltext · Ergänze hier eine Kontaktmöglichkeit.' },
    ],
  };
  return {
    purpose,
    title,
    audience: mode === 'app' ? 'Für mich' : 'Besucher der Website',
    mode,
    ...(content ? { content } : {}),
    ...(collection && mode !== 'website' ? { plannerProfile: COLLECTION_PROFILE } : {}),
  };
}
