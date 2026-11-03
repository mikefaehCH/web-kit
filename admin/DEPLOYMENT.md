# Admin-Cockpit und Betrieb

Admin-Einstieg: <https://web-kit-admin.onrender.com/whatsapp.html>. Render veröffentlicht nur `admin/dist`, gebaut mit `node admin/build-static.mjs`. Die CSP erlaubt zusätzlich `https://api.github.com`, damit das Cockpit öffentliche Repository-Metadaten laden kann. Alle weiteren Sicherheitsheader bleiben gesetzt.

## Datenquellen und Aussagekraft

- Projektliste: `admin/dashboard-data.js`, anhand der öffentlichen Repositories unter `mikefaehCH` geprüft (Stand 03.11.2026): `web-kit`, `Sommer2027`, `camino`, `zuerich`, `Valencia`, `edinburgh`.
- Offene Issues und Pull Requests: GitHub REST API, öffentlich und ohne Token.
- CI: letzter Push-Workflow-Lauf auf `main` (nicht notwendigerweise der vollständige Satz aller Pflichtchecks). Er ist kein Deployment-Nachweis. Nur `success` wird grün, `failure` rot; laufende und unbekannte Ergebnisse werden separat angezeigt. Für den Gesamtstatus die Actions-Seite öffnen.
- Website-Erreichbarkeit wird nicht live geprüft; Website- und Render-Links öffnen die jeweilige Plattform.
- Render stellt beim Build Commit-SHA und Branch bereit. `build-static.mjs` schreibt diese nicht geheimen Werte als `deployment.json` in die veröffentlichte Site. Das Cockpit zeigt den aktuell ausgelieferten Build-Commit, die Branch-Angabe und den Buildzeitpunkt an. Ausserhalb eines Render-Builds bleiben die Werte ausdrücklich unbekannt.
- GitHub-Antworten werden bis 15 Minuten im Arbeitsspeicher zwischengespeichert. Keine periodische Abfrage.

Ein fehlender, nicht lesbarer oder veralteter Status darf nicht als Erfolg interpretiert werden. API-Fehler werden sichtbar gemacht; Inhalte werden mit DOM-Textknoten dargestellt.

## Login

Supabase Auth verwendet die E-Mail-Adresse als Benutzername und `signInWithPassword`. Es wird kein Passwort in der Anwendung gespeichert oder protokolliert. Die Admin-Rolle stammt ausschliesslich aus `app_metadata.web_kit_admin === true`; Nicht-Admins werden abgemeldet. Öffentliche Registrierung wird nicht angeboten. Der Passwort-Reset erfolgt über den Supabase Auth-E-Mail-Flow. PKCE, persistente Supabase-Session, automatische Token-Erneuerung und Logout bleiben aktiv.

Laut Plattformprüfung vom 03.11.2026 existiert ein Web-Kit-Admin-Konto mit Passwort. Das bestehende Passwort wurde weder gelesen noch getestet. Ein echter Login bleibt daher bis zu einem autorisierten Anmeldetest unbestätigt. Die projektweite Supabase-Warnung zur Prüfung kompromittierter Passwörter ist noch offen; sie wurde wegen des gemeinsam genutzten Camino-Auth-Projekts nicht geändert.

## WhatsApp

Versand läuft ausschliesslich über `web-kit-whatsapp-send`. Die bestehende Admin-Prüfung, feste Empfängergruppe, Rate-Limits, Idempotenz und Auditierung bleiben in Kraft. In Tests ausschliesslich Antworten simulieren. Keine echte Nachricht ohne separate ausdrückliche Freigabe.

## Render-Plattform

Laut Render-Abfrage vom 03.11.2026: Static Site `web-kit-admin`, Service-ID `srv-dbkagf1srm7s739t6230`, HTTPS-URL oben, Deployment aus `main` nach erfolgreichen CI-Checks (`checksPass`), Starter-Plan. Ein Release ist erst bestätigt, wenn der konkrete Commit im Render-Dashboard als deployed angezeigt und die Produktions-Smokes durchgeführt wurden.

Es wurden für das Cockpit keine Secrets, Render-Dienste, Supabase-Schemata oder produktiven Daten geändert. Es ist keine SQL-Migration nötig.
