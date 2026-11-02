# Sicherheitsentscheide Web-Kit WhatsApp

Versandkette: **Browser → Supabase Auth → Edge Function `web-kit-whatsapp-send` → Datenbank (service_role) → GREEN-API**

| Thema | Entscheid |
|---|---|
| Authentifizierung | Gateway prüft JWT (`verify_jwt=true`), die Funktion prüft das Token zusätzlich mit `auth.getUser()` (abgelaufene/widerrufene Sessions → 401). |
| Autorisierung | Nur `app_metadata.web_kit_admin === true` (vom Nutzer nicht änderbar), nie `user_metadata`. Die Datenbank prüft das Flag in `web_kit_whatsapp_claim` nochmals, inkl. gesperrter/gelöschter Konten. |
| Empfänger | Fest im Server (`GROUP_ID`). Felder wie `chatId` im Request werden ignoriert. |
| Secrets | `GREEN_API_TOKEN` nur als Edge-Function-Secret; `SUPABASE_SERVICE_ROLE_KEY` wird von Supabase bereitgestellt und verlässt die Funktion nie. Logs enthalten weder Token, JWT, User-ID noch Nachrichtentext (nur die ersten 8 Zeichen der Request-ID). |
| Versandkontrolle (Befund A) | `web_kit_whatsapp_claim` und `_finish` sind `SECURITY DEFINER` und **nur für `service_role`** ausführbar; zusätzlich prüfen sie intern `auth.role() = 'service_role'`. `anon`, `authenticated` und `PUBLIC` haben kein EXECUTE. Ein angemeldeter Benutzer kann den Versandstatus damit nicht mehr selbst setzen. |
| Idempotenz | Jeder Versand braucht eine UUID-v4-Request-ID; `unique(actor_id, request_key)` + Advisory-Lock pro Admin. Wiederholung derselben ID → 429, kein Versand. Getestet mit 8 parallelen Verbindungen. |
| Rate-Limit | 10 Versandversuche pro Admin und Stunde, atomar im selben Lock (auch parallel getestet). |
| Status | `pending` → genau einmal `accepted` (nur mit gültiger Provider-ID) / `failed` (Provider-4xx) / `unknown` (Timeout, Netzwerkfehler, Provider-5xx, Antwort ohne ID). `unknown` wird nie automatisch wiederholt; die Oberfläche fordert zur Kontrolle in der Gruppe auf. |
| Audit | Append-only: Tabellenrechte nur `SELECT` für service_role, Schreiben ausschliesslich über die Funktionen; Trigger verhindert Ändern von Endstatus/Kernfeldern und Löschen. Kein Nachrichtentext, nur SHA-256-Hash. |
| RLS ohne Policies (Befund B) | **Bewusst.** RLS ist aktiv, es gibt keine Policies und keine Tabellenrechte für `anon`/`authenticated` → kein direkter Client-Zugriff. Der Linter-Hinweis `0008 rls_enabled_no_policy` (INFO) ist erwartet; eine Policy würde nur Zugriff öffnen. |
| Leaked Password Protection (Befund C) | Für Web-Kit nicht relevant: Login ist passwortlos (E-Mail-Code/Magic Link, `shouldCreateUser:false`). Die Einstellung ist projektweit und betrifft auch andere Apps im selben Projekt; Aktivierung ist risikolos und wird empfohlen, falls dort Passwörter genutzt werden (laut Supabase-Doku ab Pro-Plan). Nicht durch diesen PR geändert. |
| CORS | Nur `WEB_KIT_ADMIN_ORIGIN` (Standard `https://mikefaehch.github.io`); fremde Origins → 403. Requests ohne Origin brauchen trotzdem ein gültiges Admin-JWT. |

## Bekannte Restrisiken
- Ein Funktionsabbruch zwischen `claim` und `finish` hinterlässt `pending`; der Eintrag zählt zum Rate-Limit und blockiert die Request-ID (sicher, aber manuell zu prüfen).
- Dieselbe Nachricht mit **neuer** Request-ID (bewusste neue Bestätigung) wird erneut gesendet. Das ist gewollt.
- GREEN-API erwartet das Token im URL-Pfad; es wird nirgends geloggt.

## Tests
`supabase/tests/run.sh` (Postgres 16, Supabase-Rollen nachgebildet): Rechte, direkte RPC-Aufrufe als anon/authenticated, interne Rollenprüfung, Statusmanipulation, Replay, Rate-Limit, Append-only, Parallelität.
`tests/edge-handler.test.ts`: Auth, Admin, CORS, Eingaben, Duplikat, fail-closed, Timeout/unknown, Provider-Fehler, keine Secrets in Antworten/Logs. Kein echter Versand.
