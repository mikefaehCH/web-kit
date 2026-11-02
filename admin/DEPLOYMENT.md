# Admin und WhatsApp

Admin-Einstieg: `admin/whatsapp.html` auf einer dedizierten Render-Origin. **GitHub Pages ist dafür nicht zulässig**, da Pages-Projekte desselben Kontos dieselbe Browser-Origin teilen.

Status: `render.yaml` ist nur ein Blueprint. Es existiert noch kein bestätigter Render-Service bzw. keine produktive Admin-Origin. Nicht für Liveversand verwenden.

## Voraussetzungen für produktiven Betrieb

1. Eine tatsächliche HTTPS-Origin des Render-Service einrichten. Erst dann genau `https://<render-origin>/whatsapp.html` in Supabase Auth als Redirect URL zulassen.
2. Bereits existierendes Supabase Auth-Konto verwenden. E-Mail Magic Link erstellt ausdrücklich **keine** neuen Benutzer.
3. Admin-Rechte ausschliesslich serverseitig durch berechtigte Projektadministratoren in `auth.users.raw_app_meta_data.web_kit_admin = true` setzen. Nicht über `user_metadata` und nicht aus dem Browser.
4. `GREEN_API_TOKEN` muss in Edge Function Secrets gesetzt sein. Niemals in GitHub, JavaScript oder Logs kopieren.
5. Vor Livegang Test mit einem berechtigten Admin durchführen; CORS- und JWT-Konfiguration prüfen.
6. Keine GitHub-Pages-Origin als Admin freigeben. Für den statischen Render-Deploy publiziert `render.yaml` nur `admin/dist`, das mit `node admin/build-static.mjs` erstellt wird.

## Versand und Schutz

Edge Function: `web-kit-whatsapp-send`. Die Gruppe ist serverseitig fixiert. Sicherheitsentscheide und Tests: [`supabase/SECURITY.md`](../supabase/SECURITY.md). Migrationen liegen versioniert unter `supabase/migrations/`.

Pro Admin und Stunde höchstens zehn Versandversuche. Jeder Request erhält eine UUID; Wiederholungen werden blockiert. Bei Timeout gilt ein Versand als **unknown** und wird nicht automatisch wiederholt. Die Tabelle speichert nur Hash, Status, Benutzer-ID, Request-ID, Zeitpunkte und gegebenenfalls Provider-ID, nicht den Nachrichtentext.

## Ausrollen der Härtung (Befund A) – Reihenfolge verbindlich

**Historischer Betreiberbericht vom 02.11.2026, 07:15 (nicht unabhängig verifiziert):** Schritte 1–3 seien damals erledigt gewesen. Vor weiteren Änderungen den tatsächlichen Plattformstatus erneut prüfen.

1. Die Migration `20261102061405_web_kit_whatsapp_service_role_only` ist laut produktiver Migrationsliste bereits angewendet. Vor Änderungen die Liste erneut prüfen; diese Migration nicht erneut ausführen.
   Solange die gehärtete Funktion v3 nicht bestätigt aktiv ist, antwortet die alte Funktion v2 fail-closed mit 503 und versendet nichts.
2. Edge Function aus `supabase/functions/web-kit-whatsapp-send/` (`index.ts` **und** `handler.ts`) deployen, `verify_jwt = true`.
3. `get_advisors(security)`: Die beiden Warnungen `0029` müssen verschwunden sein; `0008` (RLS ohne Policies) bleibt bewusst.
4. Smoke-Tests ohne echten Versand: ohne JWT → 401, Nicht-Admin → 403, ungültiger Body → 400.
5. Ein Admin-Konto mit `raw_app_meta_data.web_kit_admin = true` einrichten (Stand 02.11.2026: **kein** Konto hat dieses Flag) und nur nach separater Freigabe einen Testversand durchführen.

Rollback: Edge Function v2 erneut deployen **und** alte Grants wiederherstellen ist bewusst nicht vorgesehen (würde Befund A wieder öffnen). Bei Problemen bleibt der Versand fail-closed, bis v3 läuft.

**Noch zu prüfen:** tatsächliche Render-Origin, `WEB_KIT_ADMIN_ORIGIN`, Browser-E2E auf Desktop und Mobile, tatsächliche Admin-Rolle, Auth-Redirect, unabhängiges Review und Konfiguration der Edge Function aus PR #11. Ohne diese Nachweise kein Merge und keine Live-Freigabe.
