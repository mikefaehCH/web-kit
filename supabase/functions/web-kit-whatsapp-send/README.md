# Web-Kit WhatsApp sender

`index.ts` verdrahtet Supabase-Clients und `Deno.serve`; die Logik liegt in `handler.ts` (Tests: `tests/edge-handler.test.ts`). Beim Deploy beide Dateien hochladen, `verify_jwt` = true.

Secrets (Edge Function): `GREEN_API_TOKEN`, optional `GREEN_API_INSTANCE_ID`, `GREEN_API_HOST`, `WEB_KIT_ADMIN_ORIGIN`. Von Supabase bereitgestellt: `SUPABASE_URL`, `SUPABASE_ANON_KEY` (Token-Prüfung), `SUPABASE_SERVICE_ROLE_KEY` (nur für `web_kit_whatsapp_claim`/`_finish`). Nie committen.

Antworten: 200 accepted · 400 Eingabe · 401 Session · 403 Origin/kein Admin · 429 Duplikat/Limit · 502 Provider lehnt ab (nicht gesendet) · 503 nicht konfiguriert/Versandkontrolle nicht verfügbar · 504 Status unklar (nicht erneut senden, Gruppe prüfen).

Details und Restrisiken: [`supabase/SECURITY.md`](../../SECURITY.md). Provider-Annahme garantiert keine Zustellung.
