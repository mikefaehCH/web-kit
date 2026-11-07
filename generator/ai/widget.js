/** Mount one assistant in a host element. Each mount owns its own conversation. */
export function mountAssistant(root, { title, context, examples = [], mode, request, apply }) {
  root.classList.add('wk-assistant');
  const element = (tag, text) => Object.assign(document.createElement(tag), { textContent: text });
  const heading = element('h2', title);
  const contextLine = element('p', context + ' · ' + mode);
  const form = document.createElement('form');
  const label = element('label', 'Deine Frage oder dein Auftrag');
  const input = document.createElement('textarea');
  input.rows = 3;
  input.maxLength = 1200;
  input.required = true;
  label.append(input);
  const actions = document.createElement('div');
  actions.className = 'wk-ai-actions';
  for (const example of examples) {
    const button = element('button', example);
    button.type = 'button';
    button.addEventListener('click', () => { input.value = example; input.focus(); });
    actions.append(button);
  }
  const send = element('button', 'Senden');
  send.type = 'submit';
  actions.append(send);
  const status = document.createElement('p');
  status.setAttribute('role', 'status');
  const output = document.createElement('div');
  form.append(label, actions, status);
  root.replaceChildren(heading, contextLine, form, output);

  form.addEventListener('submit', async event => {
    event.preventDefault();
    const question = input.value.trim();
    if (!question || send.disabled) return;
    send.disabled = true;
    status.textContent = 'Anfrage läuft …';
    try {
      const result = await request(question);
      const reply = element('p', result.answer);
      output.replaceChildren(reply);
      if (result.sources?.length) {
        const links = document.createElement('ul');
        for (const source of result.sources) {
          const url = new URL(source.url, location.href);
          if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) continue;
          const li = document.createElement('li');
          const link = element('a', source.label);
          link.href = url.href;
          li.append(link);
          links.append(li);
        }
        if (links.childElementCount) output.append(links);
      }
      if (result.proposal && apply) {
        const button = element('button', 'Vorschlag übernehmen');
        button.type = 'button';
        button.addEventListener('click', async () => {
          if (button.disabled || send.disabled) return;
          button.disabled = true;
          send.disabled = true;
          try {
            await apply(result.proposal);
            status.textContent = 'Vorschlag übernommen.';
          } catch (error) {
            status.textContent = error.message;
          } finally {
            send.disabled = false;
          }
        });
        output.append(button);
      }
      status.textContent = 'Antwort bereit.';
    } catch (error) {
      status.textContent = error.message;
    } finally {
      send.disabled = false;
    }
  });
}

/** getToken must obtain a short-lived grant for the signed-in user from the host. */
export function createAssistantRequest({ endpoint, project, page, getToken }) {
  const url = new URL(endpoint, location.href);
  if (url.username || url.password || (url.protocol !== 'https:' &&
      !(url.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(url.hostname))))
    throw Error('Die Live-KI benötigt einen sicheren Endpunkt.');
  let previous = '';
  return async (question, draft) => {
    const token = await getToken();
    if (!token) throw Error('Für die Live-KI ist eine Anmeldung erforderlich.');
    const response = await fetch(url, {
      method: 'POST',
      credentials: 'omit',
      redirect: 'error',
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ project, page, question, previous, ...(draft ? { draft } : {}) }),
      signal: AbortSignal.timeout(22000),
    });
    if (!response.ok) {
      if (response.status === 429) throw Error('Nutzungslimit erreicht. Bitte versuche es später erneut.');
      if ([401, 403].includes(response.status)) throw Error('Für diese KI-Anfrage fehlt die Berechtigung.');
      throw Error('Die KI ist gerade nicht verfügbar. Bitte versuche es später erneut.');
    }
    const result = await response.json();
    if (typeof result.answer !== 'string') throw Error('Die Antwort konnte nicht gelesen werden.');
    previous = question;
    return result;
  };
}
