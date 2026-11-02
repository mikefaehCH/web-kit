# Entwicklungs- und Freigaberegeln – web-kit

GitHub ist die verbindliche Quelle. Dieses Repository ist derzeit ein Gerüst auf `main`; der Website-Generator und dessen Tests sind noch nicht produktiv integriert. Bestehende PRs (insbesondere WhatsApp-Admin) sind unabhängige Arbeiten und dürfen nicht ungeprüft gemergt werden.

## Autonome Umsetzung
- ChatGPT/Codex implementiert auf Aufgabenbranches und per PR. Claude und ChatGPT/Codex liefern getrennte technische Reviews am exakten HEAD; sie sind keine GitHub-Approvals. Mike ist alleiniger Maintainer und entscheidet ausdrücklich über den Merge. Ein App-gebundener Claude-Pflichtcheck kann eine zusätzliche menschliche Approval erst ersetzen, wenn das Gate live PASS und blockierenden FAIL nachgewiesen hat und mit festgelegter App-Quelle, aktueller Basis und ohne Bypass verbindlich geschützt ist. Bis dahin gilt die dokumentierte Bootstrap-Ausnahme nur für PR #9, den ausdrücklich autorisierten Gate-PR: zwei getrennte technische Reviews, keine offenen Findings, grüne Checks und Mikes bewusste Merge-Entscheidung. Sie erlischt mit dem Merge von PR #9.
- Vor Arbeitsbeginn `main`, offene Issues/PRs, Branches, bestehende Regeln und CI überprüfen. Doppelarbeit vermeiden.
- Ein durch den Product Owner freigegebener Auftrag deckt Implementierung, Tests, Korrekturen, PR, Review, Merge und Deployment **innerhalb des vereinbarten Umfangs** ab. Keine erneute Freigabeschleife für technische Zwischenschritte.
- Kein direkter Push auf `main`, kein Force-Push, keine Umgehung von Branchschutz oder Pflichtchecks.
- Sicherheits-, Finanz-, Buchungs- und produktive Personendaten sowie kostenpflichtige Dienste benötigen bei wesentlicher Änderung eine gesonderte Entscheidung. Keine Secrets im öffentlichen Repo.
- Wiederverwendung, Sicherheit, Accessibility, Responsive Design und reproduzierbare Tests sind verbindlich. Neue Apps dürfen erst nach geeigneten Build-, Unit-/Integration- und Browserchecks automatisch veröffentlicht werden.

## Release
Die Details stehen in [RELEASE_POLICY.md](RELEASE_POLICY.md). Nur freigegebene, geprüfte PRs mit dem exakten Opt-in `Autonomy-Release: true` kommen für einen autonomen Merge infrage. **Solange das Repository nur ein Gerüst ist, gilt die automatische Freigabe ausschliesslich für reine README.md-Änderungen mit grüner Gerüst-CI.** App-Code, GitHub-Workflows und Regeln benötigen die Reviews und Abnahmen gemäss RELEASE_POLICY.md; die Bootstrap-Ausnahme ist kein Auto-Merge. Die Workflow-Automatisierung muss GitHubs Schutzregeln respektieren. Ohne ausreichende Prüf-Infrastruktur bleibt ein Release blockiert.

## Kommunikation
PRs nennen Agent, Ausgangs- und HEAD-Commit, Änderungen, Prüfung, Risiken und nächsten Schritt. Fortschritt ergebnisorientiert kommunizieren.
