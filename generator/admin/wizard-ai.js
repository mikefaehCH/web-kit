import { mountAssistant, createAssistantRequest } from '../ai/widget.js';
import { applyWizardProposal } from '../ai/wizard-contract.js';
import { renderSections } from '../modules/sections-renderer.js';
import liveSettings from './wizard-ai-settings.js';

const initialFields = [
  { id: 'datum', label: 'Datum', type: 'date' },
  { id: 'dauer', label: 'Dauer in Minuten', type: 'number' },
  { id: 'notiz', label: 'Notiz', type: 'text' },
];
const trainingField = { id: 'trainingsart', label: 'Trainingsart', type: 'text' };
const examples = [
  'Ich möchte meine Padel-Trainings erfassen.',
  'Ergänze die Trainingsart.',
];

async function demoRequest(question, draft) {
  const prompt = question.toLowerCase();
  if (!draft && prompt.includes('padel')) {
    return {
      answer: 'Eine persönliche App mit Datum, Dauer und Notiz. Nach der Übernahme kannst du ein Training erfassen.',
      proposal: {
        brief: {
          title: 'Padel-Trainings',
          purpose: 'Trainings erfassen und wiederfinden',
          audience: 'Für mich',
          mode: 'app',
        },
        fields: initialFields,
      },
    };
  }
  if (draft?.mode && prompt.includes('trainingsart')) {
    return {
      answer: 'Ich ergänze das Feld «Trainingsart». Deine Einträge bleiben erhalten.',
      proposal: { brief: null, fields: [trainingField] },
    };
  }
  return { answer: 'Diese Demo unterstützt die beiden Beispielaufträge. Starte mit dem Padel-Auftrag.' };
}

export function mountWizardAi({ read, load, capture, restore, revision }) {
  const root = document.querySelector('#ki-entwurf');
  const widget = root.querySelector('[data-assistant]');
  const preview = root.querySelector('[data-ai-preview]');
  const undo = root.querySelector('[data-ai-undo]');
  const status = root.querySelector('[data-ai-status]');
  const liveRequest = liveSettings ? createAssistantRequest(liveSettings) : null;
  let active = false;
  let previous = null;
  let appliedAt;
  let template;

  async function buildPreview(site) {
    if (!site || site.category !== 'general') return null;
    if (!template) {
      const response = await fetch(new URL('../templates/sections/index.html', import.meta.url), {
        credentials: 'omit',
      });
      if (!response.ok) throw Error('Die Vorschauvorlage konnte nicht geladen werden.');
      template = new DOMParser().parseFromString(await response.text(), 'text/html');
    }
    const content = document.createElement('div');
    content.className = 'wk-ai-preview';
    const header = document.importNode(template.querySelector('body > header'), true);
    const main = document.importNode(template.querySelector('main'), true);
    const wrapper = document.createElement('div');
    wrapper.append(...main.children);
    content.append(header, wrapper);
    // Isolate preview entries from published apps and from other installation paths.
    await renderSections(content, site, { scope: new URL('.', location.href).pathname + ':wizard-ai' });
    return content;
  }

  undo.addEventListener('click', async () => {
    if (undo.disabled || revision() !== appliedAt) {
      status.textContent = 'Der Entwurf wurde inzwischen manuell geändert.';
      return;
    }
    undo.disabled = true;
    try {
      const rendered = await buildPreview(previous.active ? previous.site : null);
      if (revision() !== appliedAt) throw Error('Der Entwurf wurde inzwischen manuell geändert.');
      restore(previous.form);
      active = previous.active;
      preview.replaceChildren(...(rendered ? [rendered] : []));
      status.textContent = 'Letzten KI-Vorschlag rückgängig gemacht.';
    } catch (error) {
      status.textContent = error.message;
      undo.disabled = false;
    }
  });

  mountAssistant(widget, {
    title: 'Mit KI entwerfen',
    context: 'Website-Wizard',
    mode: liveRequest ? 'OpenAI live · Eingabe wird gesendet' : 'Lokale Demo',
    examples,
    request: async question => {
      const startedAt = revision();
      const current = read();
      const draft = active || current?.mode ? current : null;
      const form = capture();
      if (liveRequest && draft && !root.querySelector('[data-ai-consent]').checked)
        throw Error('Bitte erlaube zuerst das Senden der Entwurfskonfiguration.');
      // Existing titles, descriptions and test entries are unnecessary for additive changes.
      const sharedDraft = draft ? { mode: draft.mode ?? 'website', fields: draft.plannerFields ?? [] } : null;
      const result = liveRequest ? await liveRequest(question, sharedDraft) : await demoRequest(question, draft);
      if (result.proposal) result.proposal = { change: result.proposal, current, form, draft, startedAt };
      return result;
    },
    apply: async ({ change, current, form, draft, startedAt }) => {
      if (revision() !== startedAt) throw Error('Der Entwurf wurde geändert. Bitte sende den Auftrag erneut.');
      const site = applyWizardProposal(change, draft);
      const rendered = await buildPreview(site);
      if (revision() !== startedAt) throw Error('Der Entwurf wurde geändert. Bitte sende den Auftrag erneut.');
      previous = { site: current, form, active };
      load(site);
      active = true;
      appliedAt = revision();
      preview.replaceChildren(rendered);
      undo.disabled = false;
      status.textContent = 'Vorschau des zuletzt übernommenen KI-Entwurfs. Der Export verwendet die aktuellen Wizard-Eingaben.';
    },
  });
  if (liveRequest) root.querySelector('[data-ai-consent]').parentElement.hidden = false;
}
