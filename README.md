# web-kit

Wiederverwendbarer, konfigurationsgetriebener Website-Baukasten für GitHub Pages.

Der versionierte Generator liegt unter [`generator/`](generator/). Er erzeugt aus einer kanonischen `site.json` v2 eine eigenständige Website; CLI, Wizard, ZIP-Ausgabe und eine fiktive Demo werden mit Node-Tests geprüft. Herkunft und importierter Quellstand sind in [`generator/UPSTREAM.md`](generator/UPSTREAM.md) dokumentiert.

```sh
npm --prefix generator test
node generator/scripts/create.mjs generator/examples/demo-site.json /tmp/web-kit-demo
```

Die Implementierung wird ausschliesslich über Pull Requests ergänzt.

## Neue Website aus einem Kurzbriefing

Ein kurzer Auftrag mit Zweck und Zielgruppe genügt für eine lokale Vorschau.
Aus dem Auftrag ein JSON mit `purpose` und `audience` erstellen. Für eine
passendere erste Fassung können ein kurzer `title`, eine passende Akzentfarbe
als `color` sowie relevante Abschnitte unter `content.sections` ergänzt werden.
Keine Termine, Adressen oder Angebote ohne Grundlage als Tatsachen ausgeben.

```sh
node generator/scripts/create.mjs --brief generator/examples/demo-brief.json /tmp/web-kit-vorschau
npm --prefix /tmp/web-kit-vorschau test
python3 -m http.server 8765 --bind 127.0.0.1 --directory /tmp/web-kit-vorschau
```

Die Vorschau ist danach lokal unter `http://127.0.0.1:8765/` erreichbar. Der
Generator setzt Projekt-ID, Sprache, Vorlage und passende Module vor. Standard
ist eine Infoseite auf Deutsch (Schweiz) mit Offline-Unterstützung. Für eine
Reise `category: travel` mit bestätigtem Zeitraum und Orten im bestehenden
Schema angeben. Die erzeugte `site.json` lässt sich zur weiteren Bearbeitung in
den Wizard importieren. Der Zielordner muss neu sein. Der Ablauf legt lokal
Dateien an. Eine Veröffentlichung erfolgt separat.

### Eine App aus dem Kurzbriefing

Aus dem Auftrag den Modus anhand des Hauptziels wählen und als `mode` setzen.
Die vorhandene `site.json` v2 bleibt die Konfigurationsquelle.

| Modus | Geeignet für | Erste Vorschau |
| --- | --- | --- |
| `website` (Standard) | Lesen, entdecken, Reisetage nachschlagen | Bestehende Website-Vorlage |
| `hybrid` | Öffentliche Information mit persönlichem Werkzeug | Infoseite mit Sprunglink zum gerätelokalen Werkzeug |
| `app` | Wiederkehrende persönliche Aufgabe | Werkzeug als Startansicht, lokal oder mit serverseitigem Zugriffsschutz |

Beispiel für ein fiktives Kurzbriefing in `brief.json`:

```json
{
  "purpose": "Ideen sammeln und Aufgaben abschliessen.",
  "audience": "Eine Person im Alltag",
  "mode": "app",
  "title": "Mein Ideenplaner",
  "color": "#225e4a"
}
```

```sh
node generator/scripts/create.mjs --brief brief.json /tmp/mein-ideenplaner
python3 -m http.server 8765 --bind 127.0.0.1 --directory /tmp/mein-ideenplaner
```

Für persönliche und kombinierte Apps stehen der Ideen- und Aufgabenplaner
und das Profil «Persönliche Sammlung» zur Verfügung. Die persönliche App
startet direkt mit der Erfassung. Für eine kombinierte Seite ergänze
öffentliche Abschnitte unter `content.sections`.

**Sammlung aus einem Satz.** «Ich möchte meine Bücher sammeln und wiederfinden.»
Im Wizard öffnet das Bücher-Beispiel nach der Übernahme eine bedienbare
Vorschau. Für den CLI-Generator genügt diese Briefing-Konfiguration:

```json
{"purpose":"Bücher sammeln und wiederfinden.","plannerProfile":"collection"}
```

Das Profil setzt die persönliche App als Standard und aktiviert Titel,
Kategorie, Notiz, Suche, Kategoriefilter und Backup. Titel, Farben und bis
zu fünf weitere Felder über `plannerFields` bleiben konfigurierbar. Dieselbe
Sammlung kann zum Beispiel für Rezepte, Ausrüstung oder Bücher verwendet
werden. Ein Ablauf mit anderen Aktionen, etwa einer Ausleihe mit Rückgabe
und Fristen, braucht eigene fachliche Logik.

**Daten und Zugriff.** Einträge liegen in IndexedDB, getrennt nach Installation,
Projekt-ID und App-Profil. Ein Backup gehört zur gleichen Projekt-ID und zum
gleichen Profil. Bisherige Aufgabenplaner-Backups bleiben im Aufgabenplaner
lesbar. Exportiere vor dem Gerätewechsel in der App über «Daten und Backup»
und importiere die Datei auf dem neuen Gerät in dasselbe Projekt. Das
Browserprofil bestimmt, welche Einträge beim Öffnen sichtbar sind. Löschungen
der Browserdaten können sie entfernen. In einer kombinierten Website sind
die ausgelieferten Inhalte und der Werkzeug-Code öffentlich. Für eine online
erreichbare persönliche App den Zugriff auf die Auslieferung serverseitig
beschränken. Die Online-Veröffentlichung eines konkreten Projekts ist ein
eigener Schritt.

**Startbildschirm und Offline.** Für einen Gerätetest einen HTTPS-Zugang mit
Zugriffsschutz verwenden. Auf dem iPhone in Safari über das Teilen-Menü
«Zu Home-Bildschirm hinzufügen» und «Als Web-App öffnen» wählen.
Auf Android in Chrome das Menü zur Installation der Web-App öffnen.
Einmal online öffnen und auf «Offline verfügbar» warten. Danach die
installierte App im Flugmodus öffnen, einen fiktiven Eintrag mit Kategorie
und Notiz speichern, neu starten und ihn über die Suche wiederfinden. Gerät,
Browser und Ergebnis separat von der Browser-Emulation festhalten.

## KI-Assistent einbetten

Das KI-Modul lässt sich pro Seite konfigurieren. Die fiktiven Etappen
(`generator/ai/etappe-1.html` und `etappe-2.html`) und der Wizard verwenden
dieselbe Komponente. [Einbau und Live-Betrieb](docs/AI_MODULE.md).

## Entwicklungs- und Releaseprozess

- Verbindliche Zusammenarbeit: [AGENTS.md](AGENTS.md).
- Sicherheit, automatischer Merge und Qualitätsprüfungen: [RELEASE_POLICY.md](RELEASE_POLICY.md).
- Generator- und Workflow-Änderungen bleiben reviewpflichtig. Die Pages-Veröffentlichung des Wizards und die nötige Plattformaktivierung sind in [docs/GENERATOR_PUBLISHING.md](docs/GENERATOR_PUBLISHING.md) beschrieben; bis zum erfolgreichen Live-Deployment gilt der Wizard als nicht veröffentlicht.
- Verbindliche Merge-Voraussetzungen sind die im GitHub-Ruleset `Protect main` geforderten Checks (`repository`, `static-check`, `edge-function`, `database`). Claude-Reviews sind zusätzliche, nicht blockierende Prüfungen und gelten nicht als GitHub-Approval.

## Verbesserungen im Website-Portfolio

Das [Projektinventar](platform/projects.json) definiert den Startpunkt. Die [Arbeitsübersicht #12](https://github.com/mikefaehCH/web-kit/issues/12) koordiniert laufende Aufgaben. Stand, Übernahme und Abnahme stehen im jeweiligen Issue oder PR.

### Ein Auftrag bis zur Produktion

Mike gibt Ziel und Grenzen vor. Der Entwicklungslauf leitet daraus ein prüfbares Ergebnis ab, trifft reversible Detailentscheide und übernimmt auch die dafür nötigen kleinen Korrekturen. Für Routineverbesserungen an den bestehenden Abläufen in der Tabelle gilt der bereits freigegebene Rahmen.

1. **Auswählen.** Zuerst Produktions- und Sicherheitsfehler, dann freigegebene Arbeiten mit offenen Prüfungen oder Releases fortsetzen. Sonst selbst den nächsten belegten Routinebefund mit dem grössten Nutzen auswählen. Vor der Übernahme Projektregeln, Main-Commit, Issues, PRs und Branch-Aktivität prüfen. Zuständigkeit, Ausgangscommit, Branch und Abnahmekriterium am bestehenden Issue oder PR festhalten. Ein neues Issue nur anlegen, wenn noch keines passt oder die Projektregeln es verlangen.
2. **Liefern.** Eine zusammenhängende Verbesserung umsetzen und prüfen. Reproduzierbare Fehler, gescheiterte Checks und Merge-Konflikte selbst beheben. Über Aufgabenbranch und PR arbeiten. Nach grünen Pflichtchecks am aktuellen PR-Commit und erfüllten Schutzregeln den erlaubten Merge und den bestehenden Deployment-Ablauf selbst ausführen. Falls ein freigegebener Release einen separaten Dispatch braucht, diesen auslösen und den ausgelieferten Stand am betroffenen Nutzerablauf prüfen.
3. **Fortsetzen.** Ist CI, Hosting oder eine Entscheidung noch offen, den konkreten nächsten Schritt im PR festhalten und unabhängige Arbeit weiterführen. Beim nächsten Lauf zuerst prüfen, ob die eigene offene Arbeit wieder aufgenommen werden kann. Bei aktiver Bearbeitung durch andere am bestehenden Vorgang koordinieren. Nur produktiv geprüfte Ergebnisse, relevante Abweichungen und Entscheidungen mit Handlungsbedarf berichten.

Separate Entscheide von Mike sind bei wesentlichen Produktänderungen, neuen Kosten, produktiven SQL-Migrationen oder destruktiven Datenoperationen, echten Reise-, Buchungs- oder Finanzdaten, echtem Nachrichtenversand sowie erheblichen Sicherheits- oder Datenschutzrisiken nötig. Solche Entscheide gebündelt und mit konkreter Option vorlegen. Projektregeln, geschützte Pfade und bestehende Freigabegrenzen gelten bei jedem Release.

| Projekt | Produktziel und wichtigste Abläufe | Geeignete Routineverbesserungen |
| --- | --- | --- |
| [Camino](https://mikefaehch.github.io/camino/) | Unterwegs den richtigen Tag finden, Route und GPX öffnen und den Plan offline lesen. | Navigation, sichtbare Offline-Zustände, Bedienung und Regressionstests bestehender Abläufe. |
| [Sommer2027](https://mikefaehch.github.io/Sommer2027/) | Familienferien entdecken, Ideen filtern und im bestehenden Familienplan wiederfinden. | Karten, Filter, mobile Navigation und Fehlerzustände der bestehenden Oberfläche. |
| [Zürich](https://mikefaehch.github.io/zuerich/) | Auf Spanisch Orte und Tagesideen finden und einen eigenen Plan zusammenstellen. | Suche, Filter, Ortsdetails, Planbedienung und Zugänglichkeit mit bestehenden Inhalten. |
| [Edinburgh](https://mikefaehch.github.io/edinburgh/) | Tagesprogramm, Treffpunkte und ÖV-Links schnell nachschlagen. | Sprunglinks, Tastaturbedienung, Lesbarkeit und Touch-Flächen. |
| [Valencia](https://mikefaehch.github.io/Valencia/) | Pablos Paella- und Tapas-Empfehlungen finden und auf der Karte öffnen. | Abschnittsnavigation, Lesbarkeit und Bedienung bestehender Kartenlinks. |
| web-kit | Im Wizard eine Website konfigurieren und exportieren. In der geschützten Verwaltung den Projektstand und freigegebene Funktionen nutzen. | Verständliche Formular- und Exportzustände, reproduzierbare Tests sowie bessere Hinweise zu CI und Produktionsstand. |

## Release-Nachweis nach automatischem Merge

Nach einem Merge durch `GITHUB_TOKEN` startet der Release-Runner die Workflows
`quality.yml` und `whatsapp-check.yml` ausdrücklich über `workflow_dispatch` auf
`main`. Zur Abnahme müssen beide Läufe erfolgreich sein und ihren `head_sha` auf
den tatsächlichen Merge-Commit beziehen. PR-Checks allein belegen diesen Ablauf
nicht. Falls `main` inzwischen weitergezogen ist, bleibt der Nachweis für den
ursprünglichen Merge-Commit offen.

Die README-only-Freigabe veröffentlicht keine Wizard-Änderung. Für eine
Veröffentlichung sind zusätzlich der Pages-Lauf und die ausgelieferte Version
zu prüfen; der bestehende manuelle Pages-Dispatch prüft dafür zuerst die
erforderlichen Main-Checks. Der isolierte Admin auf Render hat einen eigenen
Release- und Produktionsnachweis gemäss seiner Hosting-Dokumentation.
