# Datenbankgrundlage für gemeinsame Reiseplanung

Status: Migration vorbereitet und mit einer isolierten PostgreSQL-Engine getestet.
**Nicht auf eine bestehende Instanz angewendet.** Keine Konten, Mitgliedschaften oder
Reisedaten werden durch diese Migration angelegt.

## Dateien und Herkunft

`supabase/migrations/20261031210013_reusable_project_backend.sql` wurde mit
`supabase@2.122.0 migration new reusable_project_backend --workdir starter/backend`
angelegt. Die Datei ist eine additive Migration mit eigener Transaktion; sie bricht bei
Namenskollisionen ab und ersetzt keine vorhandenen Tabellen oder Funktionen.
Sie liegt bewusst getrennt von den bestehenden Sommer2027-Migrationen.

## Datenmodell

| Tabelle | Zweck | Clientrechte |
| --- | --- | --- |
| `travel_projects` | Projekt-UUID, Reise-Slug und erlaubter Zeitraum | Nur für Mitglieder lesen |
| `travel_project_places` | Erlaubte Orts-IDs je Projekt | Nur für Mitglieder lesen |
| `travel_project_members` | Verifizierte Auth-UUID und Rolle (`viewer`/`editor`) | Nur eigene Mitgliedschaften lesen |
| `travel_project_plans` | Gemeinsamer Plan mit fortlaufender Revision | Mitglieder lesen; Editor anlegen/ändern |

Projekt-, Orts- und Mitgliedschaftsdaten werden ausschliesslich durch vertrauenswürdige
Administration provisioniert. Das Frontend darf weder Mitgliedschaften vergeben noch
die kanonischen Reisedaten ändern. Es gibt keine Browser-Löschrechte für Pläne.

RLS ist für alle vier Tabellen aktiv. Tabellenprivilegien werden ausdrücklich widerrufen
und minimal neu vergeben, auch wenn zuvor breite Standardprivilegien bestanden.
Anonyme Supabase-Konten mit der Rolle `authenticated` erhalten durch den
`is_anonymous`-Claim ebenfalls keinen Zugriff. Die Mitgliedschaft wird aus der Tabelle
gelesen, nicht aus benutzerveränderbaren Metadaten.

Ein Trigger im nicht exponierten Schema `travel_private` läuft als **Security Invoker**.
Keine Security-Definer-Funktion, keine View und kein öffentliches RPC umgehen RLS.
Der Trigger prüft Projektzuordnung, initiale Revision 1, genau einen Versionsschritt,
Payload-Struktur, höchstens 5000 Einträge, maximal 1 MB JSON, bekannte Orts-IDs,
gültige Tage innerhalb des Zeitraums und Duplikate. `project_id` kann der Client
auch als Editor mehrerer Projekte nicht ändern.

Der Adapter aus `../modules/shared-plan.js` filtert UPDATE zusätzlich nach der geladenen
Revision. Ein veralteter Schreibversuch betrifft null Zeilen und löst einen Konflikt aus.
Die Datenbank erzwingt die Revisionsschritte auch bei manipulierten direkten Requests.

## Bereits ausgeführte Tests

Im übergeordneten Repository führt `npm run check` auch `tests/project-database.cjs` aus.
Die gepinnte Entwicklungsabhängigkeit `@electric-sql/pglite@0.5.14` stellt dafür eine
flüchtige PostgreSQL-Engine bereit; sie ist keine Browser-Laufzeitabhängigkeit.

52 Prüfungen führen echte SQL-Statements mit Rollenwechsel aus: Projekttrennung ohne
Frontend-Filter, Nichtmitglied/Viewer/Editor, nicht angemeldete und anonyme Konten,
entzogene Freigabe, unzulässige Selbstfreischaltung, Löschung/TRUNCATE, Projektwechsel,
Versionskonflikte, ungültige Payloads und unveränderte bestehende Testtabellen.
Die Tests simulieren breite Supabase-Standardprivilegien vor der Migration.

Nur `auth.users`, `auth.uid()` und `auth.jwt()` werden als lokale Supabase-Testfixtures
bereitgestellt. Es werden keine produktiven Identitäten oder Tokens verwendet.
RLS und Trigger werden tatsächlich ausgeführt, Auth-Gateway/JWT-Signaturprüfung und
PostgREST werden durch diesen Test jedoch nicht geprüft. PGlite hat nur eine Verbindung:
Die Versionskonflikte prüfen zwei geladene Stände nacheinander, keine parallelen Transaktionen.

## Nächster Aktivierungsschritt

1. Eine eindeutig isolierte Supabase-Testinstanz festlegen. Keine Sommer2027-/Camino-Datenbank
   automatisch auswählen und keine bestehende Instanz migrieren.
2. Bestehendes Schema und Security-/Performance-Advisors prüfen; Namenskollisionen ausschliessen.
   Vorhandene Provider-/Domainkonfiguration prüfen. Keine kostenpflichtige Instanz ohne Freigabe erstellen.
3. Die geprüfte Migration über den regulären Prozess der Testinstanz anwenden. Diese Datei
   nicht ungeprüft in die bestehende Sommer2027-Migrationshistorie kopieren.
4. Synthetische Testprojekte, erlaubte Orte und verifizierte Testkonten provisionieren.
   Projekt-UUID und `trip_id` müssen zur Adapterkonfiguration passen. Keine echten Familiendaten verwenden.
5. Über die tatsächliche Data API mit Nichtmitglied, Viewer und Editor in getrennten Projekten
   zulässige/verbotene Requests testen, einschliesslich Manipulation und paralleler Schreibvorgänge.
   Danach Advisors erneut prüfen.
6. Erst danach Login-Anbieter, Callback und Oberfläche verbinden und auf Geräten prüfen.

Diese Schritte sind noch offen. Die lokale SQL-Abnahme ist keine Bestätigung einer
produktiven Supabase-Konfiguration. Merge und Veröffentlichung bleiben bei Mike.
