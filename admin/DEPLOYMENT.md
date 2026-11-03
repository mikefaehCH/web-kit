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

Supabase Auth verwendet die E-Mail-Adresse als Benutzername und `signInWithPassword`. Zusätzlich ist TOTP-MFA vorgeschrieben: Ohne bestätigten Authenticator oder ohne AAL2 wird das Cockpit nicht angezeigt. Die Edge Function prüft AAL2 serverseitig erneut, bevor Datenbank- oder Provider-Aufrufe möglich sind. TOTP-MFA ist laut aktueller Supabase-Dokumentation auf allen Projekten verfügbar und kostenlos. Es wird kein Passwort oder TOTP-Geheimnis protokolliert; das Einrichtungsschlüsselmaterial erscheint nur während der Ersteinrichtung im persönlichen Browser. Die Admin-Rolle stammt ausschliesslich aus `app_metadata.web_kit_admin === true`; Nicht-Admins werden abgemeldet. Öffentliche Registrierung wird nicht angeboten. Der Passwort-Reset erfolgt über den Supabase Auth-E-Mail-Flow. PKCE, persistente Supabase-Session, automatische Token-Erneuerung und Logout bleiben aktiv.

Mike bestätigte am 03.11.2026, dass Admin-Login mit TOTP und ein echter WhatsApp-Versand erfolgreich waren. Diese Bestätigung stammt vom Betreiber; bei dieser späteren Bestandsprüfung wurde kein Login durchgeführt und keine Nachricht versendet. Die projektweite Supabase-Warnung zur Prüfung kompromittierter Passwörter wurde wegen des gemeinsam genutzten Camino-Auth-Projekts nicht geändert.

## WhatsApp

Versand läuft ausschliesslich über `web-kit-whatsapp-send`. Die bestehende Admin-Prüfung, feste Empfängergruppe, Rate-Limits, Idempotenz und Auditierung bleiben in Kraft. In Tests ausschliesslich Antworten simulieren. Keine echte Nachricht ohne separate ausdrückliche Freigabe.

## Render-Plattform

Laut Render-Abfrage vom 03.11.2026 ist `web-kit-admin` eine Static Site (Service-ID `srv-dbkagf1srm7s739t6230`) für `main`. Der Service zeigt `autoDeployTrigger=checksPass`; seine Quelle ist aber eine öffentliche Git-Repository-URL. [Render dokumentiert](https://render.com/docs/deploys), dass Dienste mit öffentlicher Git-URL manuell deployed werden müssen. Daher belegt `checksPass` bei dieser Service-Quelle allein keinen automatischen Deploy nach dem Merge.

Der geprüfte Ablauf ist: Pflichtchecks auf dem exakten Merge-Commit erfolgreich ausführen, den Render-Deploy auslösen und danach den tatsächlichen Deployment-Commit sowie Produktions-Smokes prüfen. Ein neuer GitHub-Integrationszugriff könnte automatische Deploys ermöglichen, wurde hier aber nicht eingerichtet oder autorisiert.

## Daten und Änderungen

Für diese Dokumentationskorrektur wurden keine Secrets, Render-Dienste, Supabase-Schemata oder produktiven Daten geändert. Es war keine SQL-Migration nötig.

Das Cockpit vergleicht den aktuellen Main-Commit mit dem letzten gefundenen Pages-Build beziehungsweise dem Commit der ausgelieferten Render-Buildmetadaten. Abweichungen erscheinen unter «Zu prüfen»; fehlende Daten bleiben unbekannt. Für Pages wird nur der letzte in den 100 abgefragten Main-Läufen gefundene `pages build and deployment`-Lauf ausgewertet. Für Render belegt die Buildmetadatei den ausgelieferten Commit, nicht den Zustand aller Render-Deployversuche. Der CI-Indikator bleibt auf den letzten gefundenen Main-Push-Lauf beschränkt; ein Erfolg für einen anderen Commit wird nicht grün angezeigt. Eine vollständige Prüfung sämtlicher Workflows und Deployversuche ist dies nicht.
Die Übersicht meldet zusätzlich den jüngsten gefundenen Lauf je Workflow für den aktuellen Main-Commit. Für offene PRs werden die jüngsten gefundenen PR-Läufe mit dem aktuellen PR-Commit abgeglichen; fehlen passende Läufe oder erreicht der Abruf seine Grenze, erscheint ein unbekannter Zustand. Wenn im begrenzten Abruf keine passenden Läufe enthalten sind, gilt die Einzelprüfung als unbekannt.
