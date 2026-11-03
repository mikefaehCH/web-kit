# Entwicklungs- und Freigaberegeln – web-kit

GitHub ist die verbindliche Quelle. Der Generator und seine Tests sind integriert. Vor Arbeiten den aktuellen Stand, offene PRs und Projektregeln prüfen.

## Autonome Umsetzung und Review
- Ein vom Product Owner freigegebener Auftrag umfasst Implementierung, Tests, PR, Merge, Deployment und Produktionskontrolle innerhalb seines Umfangs. Keine manuelle Freigabe jedes technischen Zwischenschritts.
- Claude ist ein zusätzlicher, nicht blockierender Reviewer. Seine Hinweise werden dokumentiert und fachlich geprüft; ein fehlender, fehlerhafter oder nicht unterstützter Claude-Lauf blockiert einen Merge nicht. Claude-Kommentare sind keine GitHub-Approval und werden nicht als solche ausgegeben.
- Die verbindlichen Merge-Bedingungen sind erfolgreiche, zum aktuellen HEAD gehörende Pflichtchecks, keine ungelösten kritischen oder hohen Befunde sowie die tatsächlich geltenden GitHub-Schutzregeln.
- Auto-Merge darf nur für ausdrücklich freigegebene Routineaufträge mit exaktem Opt-in `Autonomy-Release: true` verwendet werden. Das Opt-in ist kein Ersatz für Tests oder Schutzregeln.
- Änderungen an Sicherheitskontrollen, Authentifizierung, Berechtigungen, Datenbankmigrationen, Deploy-Infrastruktur oder diesen Regeln selbst sind keine Routineänderungen. Sie benötigen gezielte Prüfung und dürfen nicht allein durch einen generischen Opt-in automatisch freigegeben werden.
- Kein direkter Push auf `main`, kein Force-Push und keine Umgehung fehlgeschlagener Pflichtchecks, Branchschutzregeln oder erforderlicher Approvals.
- Keine neuen Kosten, produktiven SQL-Migrationen, destruktiven Datenänderungen oder echten WhatsApp-Nachrichten ohne separate ausdrückliche Freigabe.
- Secrets gehören nicht ins Repository. Sicherheit, Accessibility, responsive Darstellung und reproduzierbare Tests sind verbindlich.

## Release
Die Details stehen in [RELEASE_POLICY.md](RELEASE_POLICY.md). GitHub muss den Merge anhand des aktuellen PR-HEADs und der konfigurierten Pflichtchecks durchsetzen. Der autonome Runner darf die Merge-API verwenden, aber weder Admin-Bypass noch Status- oder Review-Umgehungen. Falls Branchschutz oder Rechte den Merge verhindern, wird der konkrete Blocker dokumentiert; Schutzregeln werden nicht eigenmächtig gelockert.

## Kommunikation
PRs nennen Agent, Ausgangs- und HEAD-Commit, Änderungen, Prüfungen, Risiken und nächsten Schritt. Ergebnisse und Plattformkonfigurationen nur als verifiziert bezeichnen, wenn sie tatsächlich ausgelesen wurden.
