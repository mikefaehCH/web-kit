# WhatsApp-Composer (Admin)

Wiederverwendbare Oberfläche unter `admin/whatsapp.html`. Empfänger ist serverseitig fest auf die Camino-Gruppe `120363431174972238@g.us` zu begrenzen; der Browser darf keine Gruppen-ID frei vorgeben.

**Noch kein Live-Versand:** Der Web-Kit-Admin-Wizard und der serverseitige Adapter sind derzeit nicht im Repository. Die Oberfläche verweigert den Versand, solange beides nicht sicher verbunden ist.

Ein authentifizierter Admin-Shell muss vor Laden des Moduls `window.WEB_KIT_WHATSAPP_ENDPOINT` auf die HTTPS-URL der geschützten Supabase Edge Function setzen und `window.WEB_KIT_GET_ACCESS_TOKEN` als asynchrone Funktion bereitstellen, die das aktuelle Supabase-Access-Token liefert. Diese Werte sind keine GREEN-API-Secrets.

Die Edge Function muss: JWT serverseitig prüfen; Admin-Rolle aus vertrauenswürdigen Daten (nicht user_metadata) prüfen; nur POST akzeptieren; Nachricht validieren (1–4000 Zeichen); Rate-Limit und Versandprotokoll verwenden; ausschliesslich die feste Gruppen-ID an GREEN-API senden; API-Token ausschliesslich aus Supabase Secrets lesen. Nicht direkt von GitHub Pages an GREEN-API senden.

Vor Freigabe: Admin-Zugriff, 390-px-Darstellung, fehlender Token, doppelte Klicks, Serverfehler und erfolgreiche Sendung mit Testgruppe prüfen. Keine Credentials in GitHub einchecken.
