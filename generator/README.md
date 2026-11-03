# Wiederverwendbare Reisevorlage

Eigenständige, statische Vorlage ohne Build und ohne Laufzeit-Abhängigkeit von der Sommer-Webseite.
Die beiden Reisen sind **fiktive Testdaten**, keine Reiseempfehlungen oder Buchungen.

## Neue Webseite starten

Vom übergeordneten Repository aus:

```sh
node starter/scripts/create.mjs city /absoluter/neuer/ordner meine-reise-2028
```

Alternativ `walking` verwenden. Das Ziel darf nicht existieren. Die Projekt-ID muss eindeutig sein.
Der Generator übernimmt ausschliesslich Dateien aus der Vorlage, keine Familien-, Buchungs-,
Finanzdaten, Backend-Konfiguration oder Git-Metadaten. Er aktiviert genau eine Beispielreise.
Danach `trips/city.js` beziehungsweise `trips/walking.js` bearbeiten und alle Beispieldaten ersetzen.
Im erzeugten Projekt: `npm test` (Node 22+, keine Installation nötig).
Lokal über einen statischen HTTP-Server starten, zur Veröffentlichung HTTPS verwenden.

## Konfiguration

`config.js` wählt die Reise. In der mitgelieferten Demo wechselt `?trip=city` oder `?trip=walking`
zwischen zwei Konfigurationen. Eine neue Reise enthält:

| Feld | Bedeutung |
| --- | --- |
| `id` | Stabile, eindeutige Projektkennung; kleine Buchstaben, Ziffern und Bindestriche |
| `title`, `description` | Titel und Einleitung; sicher als Text dargestellt |
| `locale` | Datumsformat (`de-CH`, `en`, `es`); Bedienoberfläche vorerst auf Deutsch |
| `start`, `end` | ISO-Kalendertage, maximal 367 Tage inklusive Start/Ende |
| `color` | Akzentfarbe als Hexwert; bei Änderung Kontrast prüfen |
| `modules` | `places`, `map`, `favorites`, `planning`, `offline`: jeweils `true`/`false` |
| `places` | Orte/Aktivitäten mit `id`, `name`, `category`, `description`, `coordinates: [lat, lon]` |

`manifest.webmanifest` (Name/Farben), `index.html` (Metadaten) und Symbole vor Veröffentlichung anpassen.
Die generischen PNG-Symbole erlauben eine Installation; echte iPhone-/Android-Installation separat testen.

## Herkunft und Modulgrenzen

| Modul | Übernommenes Muster | Umsetzung |
| --- | --- | --- |
| Orte | Sommer2027: Aktivitäts-IDs; Zürich: Filter | Einheitliches Datenformat und reine Filterfunktion in `modules/places.js` |
| Favoriten/Plan | Sommer2027: ID-Referenzen, Normalisierung, JSON-Backup | `modules/state.js`; keine Kopie reisespezifischer Daten oder Cloud-Tabellen |
| Karte | Zürich: lokal vendortes Leaflet 1.9.4, Marker und Text-Popups | `modules/map.js`, eigenes Markerdesign ohne Bildabhängigkeit |
| Offline | Camino/Zürich/Sommer2027: eigener Cache-Namensraum | `sw.js`: Cache pro Installationspfad; nur explizite öffentliche Dateien |
| Oberfläche | Bestehende Such-/Planungsabläufe | `app.js` verbindet Module mit der mitgelieferten HTML-Struktur |

HTML und `app.js` bilden zusammen eine Oberfläche; die reinen Daten-/Zustandsmodule sind unabhängig davon.
Die bestehenden Webseiten werden durch diese Vorlage nicht umgestellt. Verbesserungen werden nicht
automatisch in bestehende Kopien verteilt; dafür ist später eine versionierte Paketpflege nötig.
Leaflet-Lizenz und unveränderte Bibliotheksdateien liegen unter `vendor/leaflet/` (BSD-2-Clause).

## Speicherung und Offline-Grenzen

- Favoriten und Plan liegen nur auf diesem Gerät. Schlüssel trennen Seitenpfad und Projekt-ID.
- Import prüft Format, Reise-ID, Orte, Tage und Duplikate. Übernahme erst nach explizitem Ersetzen.
- Bei gesperrtem/vollen Speicher bleibt die Sitzung nutzbar, mit Hinweis zum Export.
- Nach erfolgreicher Service-Worker-Installation stehen App-Dateien, Orte und lokaler Plan offline bereit.
- Kartenkacheln werden nicht gespeichert. Keine Offline-Routenberechnung oder Cloud-Synchronisation.
- Cache-Löschung betrifft nur den eigenen Scope. Keine Auth-APIs oder beliebigen Same-Origin-Antworten cachen.
- Bei Änderung von App-Dateien `CACHE`-Version in `sw.js` erhöhen und `ASSETS` vollständig halten.
- Modulschalter blenden Funktionen aus; sie sind keine Sicherheits- oder Zugriffskontrollen.
- `offline: false` registriert keinen neuen Worker. Einen zuvor installierten Worker beim Umstellen separat entfernen.

Login und gemeinsame Planung sind als getestete Adapter vorbereitet; Integration und Backend-Vertrag
stehen in [`CLOUD_MODULES.md`](CLOUD_MODULES.md). Sie werden noch nicht in der Oberfläche geladen.
Push, Reisekasse, GPX und Briefings sind weiterhin keine aktivierbaren Module.
Es wird kein Supabase-Projekt eingerichtet und kein gemeinsamer Datenzugriff verändert.

## Admin-Wizard (Prototyp)

`admin/index.html` stellt eine Website im Browser zusammen und exportiert eine geprüfte `site.json`
(`version`, `category`, `id`, `title`, `description`, `color`, `modules`). Die Seite arbeitet nur lokal:
kein Login, keine Netzwerkanfragen (CSP `default-src 'none'`), keine Speicherung, keine Veröffentlichung.

- Kategorien entsprechen den Vorlagen des Generators (`city`, `walking`); Modulliste und ID-Regel stammen
  aus `modules/config.js`, damit Wizard, Oberfläche und Generator dieselben Regeln verwenden.
- Zusätzlich blockiert der Wizard Karte und Planung ohne Orte.
- `site.json` ist bewusst eine Teilkonfiguration: Sprache, Zeitraum und Orte fehlen noch, und
  `scripts/create.mjs` liest die Datei noch nicht ein. Die Anbindung folgt in einem separaten Schritt.
- Weil GitHub Pages das ganze Repository veröffentlicht, ist die Seite unter `…/starter/admin/` öffentlich
  erreichbar (nicht verlinkt, `noindex`). Sie enthält keine Daten und sendet nichts.

## Prüfung

`npm test` prüft beide Reisen, Schemafehler, Speicherfehler, Datenisolation, Import/Export,
Offline-Dateiliste und Generator. Im übergeordneten Repository ergänzt `tests/starter-browser.cjs`
die bestehende Chromium-/WebKit-Matrix um Suche, Planung, Modulschalter, Persistenz und Überlauf.
Chromium prüft zusätzlich tatsächliches Offline-Laden und die Cache-Isolation.
Browseremulation ersetzt keine Abnahme auf einem echten iPhone oder Android-Gerät.

## Website aus dem Wizard generieren

Der Wizard unter `admin/` erzeugt `site.json` Version 2: `travel` erfasst einen
Reisezeitraum und eigene Orte; `general` erfasst Textabschnitte ohne Reisedaten.
Alte city/walking-Exporte werden sichtbar migriert; fehlende Reisetermine müssen
ergänzt werden. Details stehen in [`docs/neue-kategorie.md`](docs/neue-kategorie.md).

```sh
node starter/scripts/create.mjs /pfad/site.json /absoluter/neuer/ordner
```

Wizard und CLI verwenden dieselbe Validierung. Die Ausgabe enthält die normalisierte
`site.json`, daraus abgeleitete Laufzeitkonfiguration und Metadaten, die erfassten Orte bzw. Abschnitte,
lokale Assets, Offline-Dateiliste, Lockfile und Tests. `npm ci --ignore-scripts` und
`npm test` funktionieren ohne zusätzliche Laufzeitpakete. Regenerierung erfolgt in
einen neuen Ordner; bestehende Ziele werden niemals überschrieben.

Noch offen: weitere Vorlagen und GitHub-Veröffentlichung.

## Website als ZIP

1. `admin/` über HTTPS oder localhost öffnen und alle Pflichtfelder ausfüllen.
2. «Konfiguration prüfen» wählen, danach «Website erstellen».
3. Das ZIP entpacken. Im Projektordner `npm ci --ignore-scripts` und `npm test`
   ausführen und die Website über einen statischen HTTP-Server öffnen.

CLI und Wizard verwenden `modules/site-generator.js` und dieselbe feste Dateiliste.
Das ZIP enthält lokale Assets und Lizenzen, site.json, Runtime-Konfiguration,
Generator/Wizard für spätere Neuerstellung, Lockfile und Projekttests. Es enthält
keine Beispielorte, Secrets, private Projektkonfiguration oder Git-Metadaten.
Die ZIP-Dateien sind sortiert, unkomprimiert und haben einen festen Zeitstempel;
identische Konfiguration und Vorlagendateien ergeben dieselben Bytes.

Nur die feste Vorlagenliste wird vom selben Webserver geladen, ohne Cookies und
ohne Weiterleitungen. Scheitert ein Abruf oder ändert sich die Konfiguration während
der Erstellung, wird kein ZIP ausgegeben. Pfadvalidierung, Grössenlimits und CRC32
schützen die Archivstruktur; CRC32 ist kein kryptografischer Herkunftsnachweis.

`starter/tests/zip.mjs` prüft CLI-/Browser-Parität, Reproduzierbarkeit, Entpacken,
Installation, Tests, erneute Generierung und unsichere Pfade. Die bestehende
sechsfache Browsermatrix lädt das ZIP tatsächlich im Wizard herunter, entpackt es,
installiert und prüft das Projekt und öffnet es lokal bei 375, 390 und 1280 px.
Python 3 wird nur vom Abnahmetest zum unabhängigen Entpacken verwendet.

GitHub-Anmeldung, automatische Repository-Erstellung und Veröffentlichung sind
weiterhin nicht Teil dieses Exports. Weitere Vorlagen und die GitHub-Anbindung stehen noch aus.

## Kategorien und Inhalte (Schema 2)

Der Wizard bietet nun `travel` (Vorlagen `city`, `walking`) und `general`
(Vorlage `info-page`) aus dem Kategorienverzeichnis an. Reisen erfassen Zeitraum
und Orte inklusive eigener Koordinaten. Allgemeine Seiten erfassen Überschriften
und Textabschnitte ohne Reisedatum. `site.json` kann importiert und erneut exportiert
werden; alte Version-1-Dateien werden mit sichtbarem Hinweis migriert.
Details, kanonisches Beispiel und Erweiterungsanleitung: [docs/neue-kategorie.md](docs/neue-kategorie.md).

Die bisherigen city/walking-Demos und produktiven Websites werden nicht migriert.
Sprache/Datumsformat werden erhalten, die Bedienoberfläche bleibt vorerst Deutsch.
