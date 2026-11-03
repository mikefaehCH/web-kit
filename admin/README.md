# Persönliches Admin-Cockpit

Die Admin-Oberfläche liegt unter `admin/whatsapp.html` und wird als statische Render-Site aus `admin/dist` veröffentlicht. Das Cockpit zeigt öffentliche GitHub-Daten der sechs konfigurierten Repositories. GitHub wird anonym und ausschliesslich lesend abgefragt; kein GitHub-Token gelangt in den Browser.

Der Login verwendet Supabase Auth mit Benutzername = registrierte E-Mail-Adresse und Passwort. Es gibt keine Registrierungsfunktion. Der Zugriff wird bei jeder Sitzung gegen `app_metadata.web_kit_admin === true` geprüft. Die WhatsApp-Kommunikation nutzt weiterhin ausschliesslich die bestehende geschützte Edge Function.

Projektlinks und Betriebsgrenzen stehen in [`DEPLOYMENT.md`](./DEPLOYMENT.md). Tests zum statischen Admin und Dashboard: `node --test tests/whatsapp-static.mjs tests/admin-dashboard.test.mjs`.
