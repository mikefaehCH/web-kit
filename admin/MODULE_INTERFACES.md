# Admin: Schnittstellen zu Fachmodulen

Stand: main `a70433bd7df044de0182e1d3ddacc67e0cdc6fbd`, 04.11.2026. Der ausgelieferte Stand kann abweichen. Dieses Dokument beschreibt den verifizierten Stand und offene Integrationspunkte. Es definiert keine bereits implementierte neue API.

## Gemeinsame Verantwortung

Der Admin stellt Navigation, Anmeldung und Darstellung bereit. Die Fachmodule verantworten ihre Daten, Validierung, Zustände und Fehlerbehandlung. Änderungen an gemeinsam genutzten Dateien werden vorab über Issue #44 und den betroffenen PR abgestimmt. Die Oberfläche darf eine Funktion erst anbieten, wenn deren Backend und Berechtigungen verfügbar und geprüft sind.

Der bestehende Admin verlangt eine bestätigte Admin-Rolle (`app_metadata.web_kit_admin`) und TOTP mit AAL2. Eine Anzeige im Browser ist keine serverseitige Autorisierung. Authentifizierungs-, MFA- und Origin-Schutz bleiben bestehen; Tokens und Geheimnisse gehören nicht in Dokumentation oder Logs.

## WhatsApp

Auf main ist die manuelle Versandoberfläche vorläufig ausgeblendet; die Kommunikationsseite meldet, dass der Versand nicht verfügbar ist. Ausgewählter Versand wird serverseitig gesperrt (#51). Die produktive Render-Version kann älter sein: vor einer Aussage zur Verfügbarkeit den ausgelieferten Commit prüfen. Der bestehende Legacy-Endpunkt für die Camino-Gruppe ist separat von der neuen Empfängerauswahl zu beurteilen. Eine Provider-Annahme bestätigt keine Zustellung. Keine echten Nachrichten ohne separate Freigabe testen.

Die Arbeiten an Empfängerauswahl und Mehrfachversand sind in #49 gebündelt. Teile wurden bereits gemergt, sind aber nicht produktionsreif. PR #65 entfernt eine versehentlich gemergte unvollständige Auftragserstellung; seinen aktuellen Status vor einem Deployment prüfen. Der Vertrag für Empfänger, Zustände, Wiederaufnahme und Projektbezug bleibt mit dem WhatsApp-Arbeitsbereich abzustimmen. Keine parallele Fachimplementierung.

## Reisekasse

Auf main exportiert `generator/modules/trip-ledgers.js` die reine Funktion `summarizeTrips(ledger, trips)`. Sie benötigt einen Ledger-Adapter mit `normalize` und `summarize` sowie Reisen mit eindeutiger ID, Personen und Einträgen; Speicherung und Autorisierung sind ausdrücklich nicht enthalten. Diese Funktion stellt keine Admin-Seite und keinen sicheren Datenzugriff bereit.

Private Speicherung, Datenzugriff und eine isolierte Ansicht wurden auf main vorbereitet (#43, #50, #53, #55 und #58). Die Ansicht ist noch nicht in den Admin eingebunden; Datenbankentwürfe unter supabase/pending sind kein Nachweis einer produktiven Migration. Der Integrations- und Freigabestand wird in #42 geführt. Bevor die Verwaltung eine Reisekasse anzeigt, müssen Modulverantwortliche den Daten- und Fehlervertrag, Projektreferenz, Eigentümerprüfung, Konfliktbehandlung und Freigabestand dokumentieren und die Integration testen. Keine bestehenden Reise- oder Finanzdaten für Tests verwenden.
