# web-kit

Wiederverwendbarer, konfigurationsgetriebener Website-Baukasten für GitHub Pages.

Die Implementierung wird ausschliesslich über Pull Requests ergänzt.

## Entwicklungs- und Releaseprozess

- Verbindliche Zusammenarbeit: [AGENTS.md](AGENTS.md).
- Sicherheit, automatischer Merge und Qualitätsprüfungen: [RELEASE_POLICY.md](RELEASE_POLICY.md).
- Bis der Website-Generator mit eigener Build- und Browser-CI integriert ist, dürfen nur **reine README-Änderungen** nach erfolgreicher Gerüst-CI autonom gemergt werden. App-Code und Workflow-Änderungen bleiben reviewpflichtig.
- Verbindliche Merge-Voraussetzungen sind die im GitHub-Ruleset `Protect main` geforderten Checks (`repository`, `static-check`, `edge-function`, `database`). Claude-Reviews sind zusätzliche, nicht blockierende Prüfungen und gelten nicht als GitHub-Approval.

Autonomie-Pilot vom 03.11.2026: harmlose README-Änderung zur Verifikation des Opt-in-Merge-Ablaufs.