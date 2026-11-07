# KI-Modul für Websites und Wizard

## Demo öffnen

Lokal im Repository `python3 -m http.server 8765 --bind 127.0.0.1 --directory generator`
ausführen. Im Browser `/ai/etappe-1.html` öffnen und nach Ziel und GPX fragen.
Auf Etappe 2 liefert dieselbe Komponente Antworten aus dem zweiten Kontext.

Unter `/admin/#ki-entwurf` «Ich möchte meine Padel-Trainings erfassen.» wählen,
senden und übernehmen. In der Vorschau ein fiktives Training erfassen. Danach
«Ergänze die Trainingsart.» senden und übernehmen. Rückgängig nimmt den letzten
Vorschlag zurück. Einträge und Werte bleiben im lokalen Vorschauspeicher, auch
wenn ein Feld vorübergehend ausgeblendet ist. Die Vorschau zeigt den letzten
übernommenen KI-Entwurf. Der Export verwendet die aktuelle Wizard-Konfiguration.
Der ZIP-Export enthält die Felddefinitionen. Einträge bleiben im Browserprofil
und lassen sich über das vorhandene Planer-Backup sichern.

Beide Demos arbeiten mit vorbereiteten Antworten im Browser.

## Auf einer weiteren Website einbauen

Kopiere `generator/ai/widget.js`, `widget.css` und `embed.js` gemeinsam in einen
Ordner `ai/` der Website. Positioniere den Assistenten auf jeder gewünschten Seite.

```html
<link rel="stylesheet" href="/ai/widget.css">
<section data-web-kit-ai="etappe-1"></section>
<script type="module" src="/ai/ai-config.js"></script>
```

Bei GitHub Pages unter einem Repository-Pfad verwende pfadrelative URLs oder
ergänze den Repository-Pfad. Lege eine gemeinsame `ai-config.js` an und registriere
pro Unterseite nur die benötigten Seitenschlüssel. Bei clientseitiger Navigation
mit neuem Kontext ersetze das Einbauelement und mounte es erneut. Jede Instanz
behält ihren eigenen Gesprächskontext. Die zuletzt beantwortete Frage bleibt
bis zur nächsten Antwort im Speicher dieser Instanz.

```js
import { mountPageAssistants } from './embed.js';

mountPageAssistants({
  defaults: {
    title: 'Frag zur Route',
    project: 'demo',
    endpoint: 'https://ai.example.com/api/ai',
    examples: ['Wo endet die Etappe?'],
  },
  pages: {
    'etappe-1': { context: 'Etappe 1 · Birkenhafen' },
    'etappe-2': { context: 'Etappe 2 · Lindenbrück', title: 'Frag zur zweiten Etappe' },
  },
  async getToken({ project, page }) {
    const response = await fetch('/session/ai-grant', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ project, page }),
    });
    return response.ok ? (await response.json()).token : null;
  },
});
```

`/session/ai-grant` steht für den Grant-Endpunkt des jeweiligen geschützten Hosts.
Die Einbettung funktioniert auch ohne Live-Server, wenn für eine Seite ein
`demoRequest` bereitgestellt wird. Die CSS-Variablen `--wk-ai-background`,
`--wk-ai-border`, `--wk-ai-text` und `--wk-ai-radius` passen die Darstellung an
das Farbschema der Website an. Für einen externen Live-Endpunkt erlaube in
`connect-src` genau dessen Origin. Die Demo auf GitHub Pages nutzt den vorhandenen
Same-Origin-Schutz.

## Live-Betrieb vorbereiten

1. Übernimm `ai/projects.example.json` als private Serverkonfiguration.
   Registriere exakte Origins und erlaubte Seitenschlüssel. Hinterlege geprüfte,
   veröffentlichte Ausschnitte und Links. Der Seitentyp `page` erlaubt Fragen
   zu diesen Ausschnitten. `wizard` erlaubt Konfigurationsvorschläge. Ein
   bestehender Entwurf gibt nur Modus und Zusatzfelddefinitionen frei, wenn
   `shareDraft` gesetzt ist und die Person im Wizard zustimmt.
2. Hinterlege `WEB_KIT_AI_PROJECTS` als Pfad zur Konfiguration,
   `OPENAI_API_KEY` und ein zufälliges separates `WEB_KIT_AI_GRANT_SECRET` von
   mindestens 32 Bytes im Server-Secret-Store. Starte mit Node 22+ über
   `node ai/server.mjs`. Standard ist Loopback auf Port 8787. Für einen
   freigegebenen Host `PORT` und `WEB_KIT_AI_BIND` passend setzen und HTTPS am
   vorgeschalteten Server terminieren. Die API verwendet OpenAI Responses mit
   Structured Outputs und `gpt-4.1-mini`.
3. Der Host hinter `/session/ai-grant` prüft die bestehende Anmeldung,
   den CSRF-Schutz und den Projekt- und Seitenzugriff. Erst danach erzeugt er
   mit `issueGrant({ project, page, origin, subject }, secret)` aus
   `ai/endpoint.mjs` einen fünf Minuten gültigen Grant. Der Betreff kommt aus
   der geprüften Sitzung. Sende Grants nur über HTTPS mit `Cache-Control:
   no-store`. Verwende für private Projekte einen eigenen geschützten Origin.
   Die Origin-Prüfung dient der Browser-Einbettung. Die Berechtigung ergibt
   sich aus dem Grant.
4. Für einen geschützten Wizard exportiere in der dort ausgelieferten
   `admin/wizard-ai-settings.js` ein Objekt mit `endpoint`, `project`, `page`
   und `getToken`. Die statische Pages-Fassung enthält die Demokonfiguration.
5. Vor Aktivierung freigegebenen API-Zugang und Kostenrahmen prüfen. Der
   Endpunkt begrenzt Nutzlast, Laufzeit, parallele Anfragen sowie Anfragen pro
   Account und Serverinstanz. Betreibe den Pilot auf einer Instanz. Bei
   mehreren Instanzen braucht die gemeinsame Quote einen geteilten Limiter.
   Die App speichert serverseitig keine Gesprächsinhalte. Die API-Anfrage
   setzt `store: false`.

Die Live-Version setzt einen authentifizierten Host mit Grant-Endpunkt voraus.
Für einen öffentlichen Assistenten ohne Anmeldung ist eine separat geprüfte
Freigabe mit Missbrauchsschutz und Kostenrahmen erforderlich.

[OpenAI-Dokumentation zu Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs)
