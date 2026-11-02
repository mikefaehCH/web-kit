# Admin und WhatsApp

Admin-Einstieg: [https://web-kit-admin.onrender.com/whatsapp.html](https://web-kit-admin.onrender.com/whatsapp.html) auf einer dedizierten Render-Origin. **GitHub Pages ist dafür nicht zulässig**, da Pages-Projekte desselben Kontos dieselbe Browser-Origin teilen.

## Aktueller Produktionsstatus (02.11.2026)

- Render Static Site `web-kit-admin`, Service-ID `srv-dbkagf1srm7s739t6230`; Live-Deploy aus `main` bei Commit `76fb18d8bc00ff808206e84c6d16f80105f74e95`.
- Build: `node admin/build-static.mjs`; Publish-Pfad: `admin/dist`. Render Auto-Deploy ist auf **After CI Checks Pass** gesetzt. Blueprint Auto-Sync bleibt pausiert; Blueprint-Änderungen werden manuell geprüft.
- `WEB_KIT_ADMIN_ORIGIN` ist auf `https://web-kit-admin.onrender.com` gesetzt. Supabase Auth erlaubt exakt `https://web-kit-admin.onrender.com/whatsapp.html`; der veraltete Web-Kit-GitHub-Pages-Callback wurde entfernt. Die Site-URL und Camino-Redirects bleiben unverändert.
- Edge Function `web-kit-whatsapp-send`: Version 6, `verify_jwt = true`.
- Verifizierte Produktions-Smokes: Admin-HTML und Assets HTTP 200; Sicherheitsheader vorhanden; Supabase OPTIONS von der Render-Origin 204, fremde Origin 403, Request ohne JWT 401.
- Das bestehende Betreiberkonto ist serverseitig mit `raw_app_meta_data.web_kit_admin = true` berechtigt. **Der Magic-Link-Login und die vollständige Admin-Oberfläche sind noch nicht end-to-end abgenommen.** Ein authentifizierter Nicht-Admin-Test und Tests auf iPhone/Safari/390 px stehen noch aus.
- Keine echte WhatsApp-Nachricht wurde versendet. Keine produktive SQL-Migration wurde ausgeführt.

## Voraussetzungen für den Betrieb

1. Magic-Link-Login nur für ein bereits registriertes Konto verwenden. `shouldCreateUser: false` verhindert die Kontoerstellung.
2. Admin-Rechte ausschliesslich serverseitig über `auth.users.raw_app_meta_data.web_kit_admin = true` vergeben. Nie `user_metadata` oder Browserdaten für Berechtigungsentscheide verwenden.
3. `GREEN_API_TOKEN` muss in Edge Function Secrets gesetzt sein. Niemals in GitHub, JavaScript oder Logs kopieren.
4. Die Edge Function prüft die konfigurierte Admin-Origin vor Authentifizierung und Versand. Keine GitHub-Pages-Origin als Admin freigeben.
5. Render publiziert ausschliesslich `admin/dist`, erstellt mit `node admin/build-static.mjs`.

## Versand und Schutz

Edge Function: `web-kit-whatsapp-send`. Die Gruppe ist serverseitig fixiert. Sicherheitsentscheide und Tests: [`supabase/SECURITY.md`](../supabase/SECURITY.md). Migrationen liegen versioniert unter `supabase/migrations/`.

Pro Admin und Stunde höchstens zehn Versandversuche. Jeder Request erhält eine UUID; Wiederholungen werden blockiert. Bei Timeout gilt ein Versand als **unknown** und wird nicht automatisch wiederholt. Die Tabelle speichert nur Hash, Status, Benutzer-ID, Request-ID, Zeitpunkte und gegebenenfalls Provider-ID, nicht den Nachrichtentext.

## Historische Rollout-Notizen zur Härtung (Befund A)

**Historischer Betreiberbericht vom 02.11.2026, 07:15 (nicht unabhängig verifiziert):** Schritte 1–3 seien damals erledigt gewesen. Diese Notizen sind kein aktueller Plattformnachweis.

1. Die Migration `20261102061405_web_kit_whatsapp_service_role_only` darf nicht erneut ausgeführt werden.
2. Die Edge Function muss mit `index.ts` und `handler.ts` sowie `verify_jwt = true` deployt sein.
3. Beim Security Advisor bleiben `0029`-Warnungen zu bereinigen; `0008` (RLS ohne Policies) bleibt bewusst.
4. Tests ohne echten Versand: ohne JWT → 401, Nicht-Admin → 403, ungültiger Body → 400.
5. Admin-Testkonto ist eingerichtet. Bis zur erfolgreichen Login- und Berechtigungsabnahme keinen echten Versand auslösen.

Rollback: Edge Function v2 erneut deployen **und** alte Grants wiederherstellen ist bewusst nicht vorgesehen (würde Befund A wieder öffnen). Bei Problemen bleibt der Versand fail-closed, bis die gehärtete Version läuft.

## Noch offene Abnahme

Magic-Link im gleichen Browserprofil öffnen, in dem der Login angefordert wurde, und danach Login, Admin-Zugriff sowie Logout prüfen. Zusätzlich authentifizierten Nicht-Admin mit 403 testen, Nachrichtenvorbereitung ohne Versand verifizieren und Mobile/Safari/390-px- sowie Accessibility-Checks durchführen.