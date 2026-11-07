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
