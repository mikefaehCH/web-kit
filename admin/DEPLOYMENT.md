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

Edge Function: `web-kit-whatsapp-send`. Die Gruppe ist serverseitig fixiert. Datenbankmigrationen `web_kit_whatsapp_dispatch_control` und `web_kit_whatsapp_dispatch_finish` sind auf Projekt `qoensghjemruqafrbmjd` angewendet. Pro Admin und Stunde höchstens zehn angenommene Versandversuche. Jeder Request erhält eine UUID; Wiederholungen werden blockiert. Bei Timeout gilt ein Versand als **unklar** und wird nicht automatisch wiederholt. Die Tabelle speichert nur Hash, Status, Benutzer-ID, Request-ID und gegebenenfalls Provider-ID, nicht den Nachrichtentext.

**Noch zu prüfen:** Browser-E2E, tatsächliche Admin-Rolle, Auth-Redirect, echte GREEN-API-Bestätigung, unabhängiges Review und produktive Pages-URL. Ohne diese Nachweise kein Merge und keine Live-Freigabe.
