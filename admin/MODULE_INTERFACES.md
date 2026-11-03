# Admin: Schnittstellen zu Fachmodulen

Stand: main `1468e5e9ed4ade37fed56ee5d8ed55e873104eac`, 03.11.2026. Dieses Dokument beschreibt den verifizierten Stand und offene Integrationspunkte. Es definiert keine bereits implementierte neue API.

## Gemeinsame Verantwortung

Der Admin stellt Navigation, Anmeldung und Darstellung bereit. Die Fachmodule verantworten ihre Daten, Validierung, Zustände und Fehlerbehandlung. Änderungen an gemeinsam genutzten Dateien werden vorab über Issue #44 und den betroffenen PR abgestimmt. Die Oberfläche darf eine Funktion erst anbieten, wenn deren Backend und Berechtigungen verfügbar und geprüft sind.

Der bestehende Admin verlangt eine bestätigte Admin-Rolle (`app_metadata.web_kit_admin`) und TOTP mit AAL2. Eine Anzeige im Browser ist keine serverseitige Autorisierung. Authentifizierungs-, MFA- und Origin-Schutz bleiben bestehen; Tokens und Geheimnisse gehören nicht in Dokumentation oder Logs.

## WhatsApp

Auf main zeigt `whatsapp.html#communication` den manuellen Versand an die feste Camino-Gruppe. `auth.js` stellt `WEB_KIT_WHATSAPP_ENDPOINT` und `WEB_KIT_GET_ACCESS_TOKEN()` bereit. `whatsapp.js` zeigt die Vorschau und sendet nach Bestätigung einen POST mit `{ message, requestKey }` und Bearer-Token an `web-kit-whatsapp-send`. Der Server prüft die Berechtigung; die Annahme durch den Provider bestätigt keine Zustellung. Keine echten Nachrichten ohne separate Freigabe testen.

Die geplante Empfängerauswahl, Projektzuordnung und Mehrfachversand liegen in Draft-PR #39 und sind nicht als produktiv verfügbar anzusehen. Dieser PR ändert gemeinsame Admin-Dateien. Der verbindliche Vertrag für Empfänger, Status, Wiederholungen und Projektbezug ist mit dem WhatsApp-Arbeitsbereich anhand dessen aktuellem HEAD abzustimmen, bevor der Admin eine Integration übernimmt. Keine parallele Fachimplementierung.

## Reisekasse

Auf main exportiert `generator/modules/trip-ledgers.js` die reine Funktion `summarizeTrips(ledger, trips)`. Sie benötigt einen Ledger-Adapter mit `normalize` und `summarize` sowie Reisen mit eindeutiger ID, Personen und Einträgen; Speicherung und Autorisierung sind ausdrücklich nicht enthalten. Diese Funktion stellt keine Admin-Seite und keinen sicheren Datenzugriff bereit.

Die private Speicherung und der Datenzugriff werden in #40, #42 und Draft-PR #43 bearbeitet. Der dortige Datenbankentwurf ist noch nicht produktiv angewandt; Entwurfs-APIs können sich ändern. Bevor die Verwaltung eine Reisekasse anzeigt, müssen Modulverantwortliche den Daten- und Fehlervertrag, Projektreferenz, Eigentümerprüfung, Konfliktbehandlung und Freigabestand dokumentieren und die Integration testen. Keine bestehenden Reise- oder Finanzdaten für Tests verwenden.
