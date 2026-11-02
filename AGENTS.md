# Entwicklungs- und Freigaberegeln – web-kit

GitHub ist die verbindliche Quelle. Dieses Repository ist derzeit ein Gerüst auf `main`; der Website-Generator und dessen Tests sind noch nicht produktiv integriert. Bestehende PRs (insbesondere WhatsApp-Admin) sind unabhängige Arbeiten und dürfen nicht ungeprüft gemergt werden.

## Autonome Umsetzung
- ChatGPT/Codex implementiert auf Aufgabenbranches und per PR. Änderungen werden nach Urheberschaft gegengeprüft: Claude prüft die von ChatGPT/Codex verfassten Änderungen, ChatGPT/Codex prüft die von Claude verfassten Änderungen. Bei gemischter Autorenschaft prüft jeder Agent die jeweils vom anderen verfassten Teile am exakten aktuellen HEAD. Mike prüft den Gesamtstand und entscheidet ausdrücklich über den Merge. Diese technischen Reviews sind keine GitHub-Approvals. Mike ist alleiniger Maintainer und entscheidet ausdrücklich über den Merge. Ein App-gebundener Claude-Pflichtcheck kann eine zusätzliche menschliche Approval erst ersetzen, wenn das Gate live PASS und blockierenden FAIL nachgewiesen hat und mit festgelegter App-Quelle, aktueller Basis und ohne Bypass verbindlich geschützt ist. Bis dahin gilt die dokumentierte Bootstrap-Ausnahme nur für PR #9, den ausdrücklich autorisierten Gate-PR: Gegenprüfungen der jeweiligen Agentenbeiträge am selben aktuellen HEAD: Claude-geprüfte ChatGPT/Codex-Änderungen und ChatGPT/Codex-geprüfte Claude-Änderungen. Eine Selbstprüfung zählt nicht. Dazu kommen keine offenen Findings, grüne Checks und Mikes bewusste Merge-Entscheidung. Es ist kein zusätzlicher externer Reviewer erforderlich. Es wird keine GitHub-Approval vorgetäuscht. Die Ausnahme erlischt mit dem Merge von PR #9.
- Vor Arbeitsbeginn `main`, offene Issues/PRs, Branches, bestehende Regeln und CI überprüfen. Doppelarbeit vermeiden.
- Ein durch den Product Owner freigegebener Auftrag deckt Implementierung, Tests, Korrekturen, PR, Review, Merge und Deployment **innerhalb des vereinbarten Umfangs** ab. Keine erneute Freigabeschleife für technische Zwischenschritte.
- Kein direkter Push auf `main`, kein Force-Push, keine Umgehung von Branchschutz oder Pflichtchecks.
- Sicherheits-, Finanz-, Buchungs- und produktive Personendaten sowie kostenpflichtige Dienste benötigen bei wesentlicher Änderung eine gesonderte Entscheidung. Keine Secrets im öffentlichen Repo.
- Wiederverwendung, Sicherheit, Accessibility, Responsive Design und reproduzierbare Tests sind verbindlich. Neue Apps dürfen erst nach geeigneten Build-, Unit-/Integration- und Browserchecks automatisch veröffentlicht werden.

## Release
Die Details stehen in [RELEASE_POLICY.md](RELEASE_POLICY.md). Nur freigegebene, geprüfte PRs mit dem exakten Opt-in `Autonomy-Release: true` kommen für einen autonomen Merge infrage. **Solange das Repository nur ein Gerüst ist, gilt die automatische Freigabe ausschliesslich für reine README.md-Änderungen mit grüner Gerüst-CI.** App-Code, GitHub-Workflows und Regeln benötigen die Reviews und Abnahmen gemäss RELEASE_POLICY.md; die Bootstrap-Ausnahme ist kein Auto-Merge. Die Workflow-Automatisierung muss GitHubs Schutzregeln respektieren. Ohne ausreichende Prüf-Infrastruktur bleibt ein Release blockiert.

## Kommunikation
PRs nennen Agent, Ausgangs- und HEAD-Commit, Änderungen, Prüfung, Risiken und nächsten Schritt. Fortschritt ergebnisorientiert kommunizieren.
