# Isoliertes Admin-Hosting – Release-Gate

Ziel: `admin/` auf einer separaten HTTPS-Origin hosten, **nicht** unter `mikefaehch.github.io`. Der Blueprint `render.yaml` ist nur die Konfiguration, kein Deployment. Keine kostenpflichtige Instanz ohne Freigabe wählen.

## Sicherheitsvoraussetzungen

1. Hosting-Service mit eigener Provider-Subdomain erstellen. Kosten und Tarif vor Aktivierung kontrollieren. GitHub-Repository anbinden; statisches Verzeichnis `admin/`; automatisches Deployment bleibt vorerst deaktiviert.
2. HTTPS-Origin festhalten, zum Beispiel die vom Anbieter tatsächlich zugewiesene Adresse. **Keine erfundene URL verwenden.**
3. Supabase Auth Redirect URL auf `https://<tatsächliche-admin-domain>/whatsapp.html` setzen und alte GitHub-Pages-Redirects für den Admin entfernen.
4. Edge Function Secret `WEB_KIT_ADMIN_ORIGIN` exakt auf diese Origin setzen. Anschliessend die aktuelle geprüfte Edge Function erneut deployen, damit CORS nur die neue Origin akzeptiert.
5. Browser-Smoke-Tests: E-Mail-Link/Redirect, Session-Wiederherstellung, Logout, Admin-/Nicht-Admin-Anzeige, Mobilansicht (390 px), Tastatur, 401/403/429/504. Ohne echten WhatsApp-Versand testen.
6. Branch Protection / Rulesets und unabhängige GitHub-Approval für sicherheitsrelevante PRs nach `RELEASE_POLICY.md` einrichten. Kein automatischer Merge ohne Approval.
7. Erst nach vollständigen Checks, unabhängigem Review und Freigabe deployen. Echten Gruppenversand nur nach separater ausdrücklicher Freigabe testen.

## Restrisiken

Eine separate Origin isoliert Web Storage und Auth-Sitzung von anderen GitHub-Pages-Sites, ersetzt aber keine serverseitige Admin-Autorisierung. Supabase-RPCs bleiben service_role-only. Tokens gehören niemals in HTML, Repository oder Build-Logs. `render.yaml` enthält keine Secrets.

## Build und Abhängigkeiten

- Der Admin verwendet `@supabase/supabase-js` 2.118.0 aus dem lokalen Bundle `admin/vendor/supabase.js`; es gibt zur Laufzeit keine JavaScript-Anfrage an ein CDN. `admin/package-lock.json` pinnt Build- und Laufzeit-Abhängigkeiten.
- Das Bundle wird reproduzierbar mit `npm ci --prefix admin --ignore-scripts` und `npm run --prefix admin build:vendor` erstellt. CI vergleicht das erzeugte Bundle mit der eingecheckten Datei.
- `node admin/build-static.mjs` kopiert nur die benötigten HTML/CSS/JS-Dateien und Lizenzhinweise nach `admin/dist`. Der Render-Blueprint veröffentlicht ausschliesslich dieses Verzeichnis.
- Die CSP erlaubt Skripte nur von `'self'`; `connect-src` ist auf das Supabase-Projekt begrenzt. `npm audit --prefix admin` meldete bei Prüfung am 2.11.2026 keine bekannten Schwachstellen.

## Nicht produktiv aktiviert

Der Render-Blueprint ist noch kein angelegter oder veröffentlichter Service. Bis eine echte Render-Origin eingerichtet, als `WEB_KIT_ADMIN_ORIGIN` gesetzt und die Edge Function aus PR #11 deployt wurde, bleibt der isolierte Admin nicht verfügbar. GitHub Pages darf nicht als Admin-Origin verwendet werden, weil dort gehostete Projekte dieselbe Origin teilen.

Vor Livegang weiterhin erforderlich: echte Render-URL, Supabase Redirect-URL, `WEB_KIT_ADMIN_ORIGIN`, unabhängige Approval und E2E-Tests mit PKCE. Es wurden keine echten Nachrichten versendet.
