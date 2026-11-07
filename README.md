# web-kit

Wiederverwendbarer, konfigurationsgetriebener Website-Baukasten für GitHub Pages.

Der versionierte Generator liegt unter [`generator/`](generator/). Er erzeugt aus einer kanonischen `site.json` v2 eine eigenständige Website; CLI, Wizard, ZIP-Ausgabe und eine fiktive Demo werden mit Node-Tests geprüft. Herkunft und importierter Quellstand sind in [`generator/UPSTREAM.md`](generator/UPSTREAM.md) dokumentiert.

```sh
npm --prefix generator test
node generator/scripts/create.mjs generator/examples/demo-site.json /tmp/web-kit-demo
```

Die Implementierung wird ausschliesslich über Pull Requests ergänzt.

## Entwicklungs- und Releaseprozess

- Verbindliche Zusammenarbeit: [AGENTS.md](AGENTS.md).
- Sicherheit, automatischer Merge und Qualitätsprüfungen: [RELEASE_POLICY.md](RELEASE_POLICY.md).
- Generator- und Workflow-Änderungen bleiben reviewpflichtig. Die Pages-Veröffentlichung des Wizards und die nötige Plattformaktivierung sind in [docs/GENERATOR_PUBLISHING.md](docs/GENERATOR_PUBLISHING.md) beschrieben; bis zum erfolgreichen Live-Deployment gilt der Wizard als nicht veröffentlicht.
- Verbindliche Merge-Voraussetzungen sind die im GitHub-Ruleset `Protect main` geforderten Checks (`repository`, `static-check`, `edge-function`, `database`). Claude-Reviews sind zusätzliche, nicht blockierende Prüfungen und gelten nicht als GitHub-Approval.

## Verbesserungen im Website-Portfolio

Das [Projektinventar](platform/projects.json) definiert den Startpunkt. Die [Arbeitsübersicht #12](https://github.com/mikefaehCH/web-kit/issues/12) koordiniert laufende Aufgaben. Stand, Übernahme und Abnahme stehen im jeweiligen Issue oder PR.

| Projekt | Produktziel und wichtigste Abläufe | Geeignete Routineverbesserungen |
| --- | --- | --- |
| [Camino](https://mikefaehch.github.io/camino/) | Unterwegs den richtigen Tag finden, Route und GPX öffnen und den Plan offline lesen. | Navigation, sichtbare Offline-Zustände, Bedienung und Regressionstests bestehender Abläufe. |
| [Sommer2027](https://mikefaehch.github.io/Sommer2027/) | Familienferien entdecken, Ideen filtern und im bestehenden Familienplan wiederfinden. | Karten, Filter, mobile Navigation und Fehlerzustände der bestehenden Oberfläche. |
| [Zürich](https://mikefaehch.github.io/zuerich/) | Auf Spanisch Orte und Tagesideen finden und einen eigenen Plan zusammenstellen. | Suche, Filter, Ortsdetails, Planbedienung und Zugänglichkeit mit bestehenden Inhalten. |
| [Edinburgh](https://mikefaehch.github.io/edinburgh/) | Tagesprogramm, Treffpunkte und ÖV-Links schnell nachschlagen. | Sprunglinks, Tastaturbedienung, Lesbarkeit und Touch-Flächen. |
| [Valencia](https://mikefaehch.github.io/Valencia/) | Pablos Paella- und Tapas-Empfehlungen finden und auf der Karte öffnen. | Abschnittsnavigation, Lesbarkeit und Bedienung bestehender Kartenlinks. |
| web-kit | Im Wizard eine Website konfigurieren und exportieren. In der geschützten Verwaltung den Projektstand und freigegebene Funktionen nutzen. | Verständliche Formular- und Exportzustände, reproduzierbare Tests sowie bessere Hinweise zu CI und Produktionsstand. |

Im bestehenden regelmässigen Entwicklungslauf zuerst Produktions- und Sicherheitsfehler, fehlgeschlagene Prüfungen und freigegebene offene Arbeiten berücksichtigen. Danach einen belegten, reversiblen Routinebefund aus der Tabelle selbst auswählen. Vor der Übernahme Main-Commit, jüngste Branch-/PR-Aktivität und Projektregeln prüfen. Bei aktiver Bearbeitung oder einem Blocker die nächste unabhängige Aufgabe wählen. Befund, Ausgangscommit, Branch und Abnahmekriterium im passenden Issue festhalten. Eine einfache Verbesserung soll im selben Lauf bis zur Produktionskontrolle gelangen, wenn Prüfungen, Rechte und Release-Regeln dies erlauben.

Die Tabelle dient der Aufgabenauswahl. Repository-Regeln, geschützte Pfade und bestehende Freigabegrenzen gelten für jeden PR. Grössere Produktentscheidungen, Kosten, Änderungen an echten Reise-, Buchungs- oder Finanzdaten sowie erhebliche Sicherheits- oder Datenschutzrisiken separat eskalieren. Den ausgelieferten Stand über den Produktionscheck oder eine gezielte Live-Prüfung belegen und offene Nachweise im PR festhalten.

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
