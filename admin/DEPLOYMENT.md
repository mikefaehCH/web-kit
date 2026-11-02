# Admin und WhatsApp

Admin-Einstieg: `admin/whatsapp.html` (nach GitHub Pages Deployment).

## Voraussetzungen für produktiven Betrieb

1. In Supabase Auth unter URL Configuration `https://mikefaehch.github.io/web-kit/admin/whatsapp.html` als Redirect URL zulassen.
2. Bereits existierendes Supabase Auth-Konto verwenden. E-Mail Magic Link erstellt ausdrücklich **keine** neuen Benutzer.
3. Admin-Rechte ausschliesslich serverseitig durch berechtigte Projektadministratoren in `auth.users.raw_app_meta_data.web_kit_admin = true` setzen. Nicht über `user_metadata` und nicht aus dem Browser.
4. `GREEN_API_TOKEN` muss in Edge Function Secrets gesetzt sein. Niemals in GitHub, JavaScript oder Logs kopieren.
5. Vor Livegang Test mit einem berechtigten Admin durchführen; CORS- und JWT-Konfiguration prüfen.
6. GitHub Pages für `main` aktivieren, sofern noch nicht geschehen.

## Versand und Schutz

Edge Function: `web-kit-whatsapp-send`. Die Gruppe ist serverseitig fixiert. Sicherheitsentscheide und Tests: [`supabase/SECURITY.md`](../supabase/SECURITY.md). Migrationen liegen versioniert unter `supabase/migrations/`.

Pro Admin und Stunde höchstens zehn Versandversuche. Jeder Request erhält eine UUID; Wiederholungen werden blockiert. Bei Timeout gilt ein Versand als **unknown** und wird nicht automatisch wiederholt. Die Tabelle speichert nur Hash, Status, Benutzer-ID, Request-ID, Zeitpunkte und gegebenenfalls Provider-ID, nicht den Nachrichtentext.

## Ausrollen der Härtung (Befund A) – Reihenfolge verbindlich

1. Migration `20261102090000_web_kit_whatsapp_service_role_only` auf `qoensghjemruqafrbmjd` anwenden.
   Ab jetzt antwortet die alte Funktion v2 mit 503 (fail-closed), es wird nichts versendet.
2. Edge Function aus `supabase/functions/web-kit-whatsapp-send/` (index.ts **und** handler.ts) deployen, `verify_jwt` = true.
3. `get_advisors(security)`: Die beiden Warnungen `0029` müssen verschwunden sein; `0008` (RLS ohne Policies) bleibt bewusst.
4. Smoke-Tests ohne echten Versand: ohne JWT → 401, Nicht-Admin → 403, ungültiger Body → 400.
5. Ein Admin-Konto mit `raw_app_meta_data.web_kit_admin = true` einrichten (Stand 2.11.2026: **kein** Konto hat dieses Flag) und einen freigegebenen Testversand durchführen.

Rollback: Edge Function v2 erneut deployen **und** alte Grants wiederherstellen ist bewusst nicht vorgesehen (würde Befund A wieder öffnen). Bei Problemen bleibt der Versand fail-closed, bis v3 läuft.

**Noch zu prüfen:** Browser-E2E, tatsächliche Admin-Rolle, Auth-Redirect, echte GREEN-API-Bestätigung, unabhängiges Review und produktive Pages-URL. Ohne diese Nachweise kein Merge und keine Live-Freigabe.
