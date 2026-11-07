import { createAssistantRequest, mountAssistant } from './widget.js';

/** Configure shared presentation once, then opt in with data-web-kit-ai per page. */
export function mountPageAssistants({ defaults, pages, getToken }, documentRoot = document) {
  for (const root of documentRoot.querySelectorAll('[data-web-kit-ai]')) {
    const page = root.dataset.webKitAi;
    if (!Object.hasOwn(pages, page)) {
      root.textContent = 'Für diese Seite ist kein Assistent eingerichtet.';
      continue;
    }
    const options = { ...defaults, ...pages[page] };
    try {
      const request = options.demoRequest ?? createAssistantRequest({
        endpoint: options.endpoint,
        project: options.project,
        page,
        getToken: () => getToken({ project: options.project, page }),
      });
      mountAssistant(root, {
        ...options, request,
        mode: options.demoRequest ? 'Demo mit fiktiven Inhalten' : 'OpenAI live · Eingabe wird gesendet',
      });
    } catch {
      root.textContent = 'Der Assistent ist gerade nicht verfügbar.';
    }
  }
}
