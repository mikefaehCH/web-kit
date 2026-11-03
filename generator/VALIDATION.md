# Prüfstand 31.10.2026

Agent: Codex. Ausgangspunkt: Sommer2027 `c2ca7bbdcb9d13a2f3dfb5d32d403269a5eca9dc`.

## Ergebnis

- Eigenständige Vorlage und Generator für neue Projekte; zwei fiktive Beispielreisen.
- Keine Änderungen an der laufenden App, Reisedaten, Fotoentscheidungen, Backend oder Familiendaten.
- Keine automatische Migration bestehender Webseiten; gemeinsame Module werden zunächst in der Vorlage gepflegt.
- Lokal vendortes Leaflet 1.9.4 einschliesslich BSD-Lizenz aus dem bestehenden Zürich-Projekt.

## Lokal validiert

- `npm ci`: erfolgreich.
- `npm run format:check`: erfolgreich.
- `npm run check`: bestehende statische/Sicherheitsprüfungen sowie neun neue Vorlagenprüfungen erfolgreich.
- `npm run verify:sri`: drei bestehende CDN-Dateien erfolgreich verifiziert.
- `node tests/service-worker.cjs`: erfolgreich.
- Browser-QA im Sites-Preview: beide Reisen, drei Kartenmarker, Suchfilter, Favoriten,
  Einplanen, Persistenz nach Neuladen, getrennte Pläne, abgeschaltetes Favoritenmodul und Desktopdarstellung geprüft.
- `git diff --check`: erfolgreich.

## Noch nicht lokal bestätigt

`npx playwright install chromium webkit` scheitert beim Chromium-Download (ungültiges ZIP).
`npm test` sowie der neue Browser-Test können daher lokal keine Chromium-/WebKit-Instanz starten.
Die vorhandene sechs-Job-CI-Matrix führt den neuen Test über `npm test` mit aus.
Keine Freigabe zum Merge, solange die CI nicht am tatsächlichen PR-HEAD grün ist.

Die Vorschau läuft über HTTP auf `terminal.local`; dort unterstützt der Browser keinen Service Worker.
Offline wurde deshalb lokal im Worker-Verhalten und der Dateiliste geprüft, jedoch nicht als kompletter
Browserablauf. Der Chromium-CI-Test deckt diesen Ablauf zusätzlich ab.
Installation und OAuth/Push auf echten Mobilgeräten sind nicht Teil dieser Abnahme.

Nächster Schritt: unabhängige PR-Prüfung und vollständige CI; Merge und Deployment durch Mike.

## Ergänzung: Login und gemeinsame Planung vorbereiten

Aufbauend auf Vorlagen-Commit `e7ee6ac0c0addfa2ccee5200017b4fcdeabcb947` (PR #31):

- `project-auth.js` und `shared-plan.js` ergänzen die Vorlage als explizit aufzurufende Adapter.
- Kein Import in der laufenden Oberfläche, keine produktiven Auth-/Datenbankaufrufe und keine Migration.
- `npm run check`: bestehende Prüfungen und insgesamt 26 Vorlagen-/Adaptertests erfolgreich.
- `tests/project-sdk.cjs`: Vertragstest gegen das bestehende, SRI-geprüfte Supabase JS 2.57.0
  erfolgreich; alle HTTP-Antworten simuliert, keine Netzwerkverbindung zur Produktion.
- Geprüft: Anbieteraktivierung, Callback, Mitgliedschaft, Viewer/Editor, verweigerter Zugriff,
  Entzug, Sitzungswechsel, paralleles Anlegen/Aktualisieren und fehlende Speicherbestätigung.
- Lokale vollständige Browserprüfung weiter durch fehlende Playwright-Binaries begrenzt.
  Der neue SDK-Test läuft zusätzlich in der vorhandenen sechs-Job-CI-Matrix.
- Backend-Vertrag und Integration stehen in `CLOUD_MODULES.md`; der Generator liefert die Anleitung mit.
- Keine Aussage über produktive RLS- oder Provider-Konfiguration. Diese müssen vor Aktivierung
  in einer isolierten Umgebung und auf echten Geräten separat geprüft werden.

## Review-Korrektur vom 01.11.2026

- Initiale Sitzung und Token-Refresh desselben Kontos erhalten geladene Pläne; Konto-Wechsel und Logout invalidieren weiter.
- Regressionen für INITIAL_SESSION, Refresh, ersten Kontowechsel, Logout und neutrale E-Mail-Antwort.
- Echter SDK-Vertragstest zusätzlich mit gespeicherter Sitzung und Refresh über simulierte HTTP-Antworten.
- Fehlende SDK-Prüfung, Generator-Anleitung und Dokumentation aus #32 übernommen.
- Lokal: 26 Tests und SDK-Vertragstest erfolgreich. Erneute CI und unabhängiges Review des Korrekturcommits bleiben erforderlich.
