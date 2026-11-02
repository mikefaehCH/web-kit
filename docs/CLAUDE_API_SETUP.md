# Claude API für GitHub-Code-Reviews: Einrichtung (noch nicht aktiviert)

## Kostenkontrolle

Genehmigt ist **Vorbereitung** mit Zielbudget maximal CHF 10/Monat, **keine kostenpflichtige Aktivierung**. Anthropic rechnet in der Kontowährung ab; CHF 10 sind nicht automatisch USD 10. Vor Aktivierung den entsprechenden niedrigeren Betrag als Monatslimit festlegen. Das aktuell aktive GitHub-Ruleset verlangt keine Statuschecks; daher ist das Gate derzeit nicht durchgesetzt.

1. https://platform.claude.com/settings/workspaces öffnen und einen **eigenen, nicht-default Workspace** `web-kit-reviews` erstellen.
2. In diesem Workspace unter **Spend limits → Monthly limit** einen Betrag festlegen, der CHF 10/Monat nicht überschreitet (Währungsumrechnung mit Sicherheitsmarge). Zusätzlich Kostenwarnung einrichten.
3. Workspace-spezifischen API-Schlüssel erstellen. **Nicht** in Chat, Issues, PRs, Dateien oder Logs einfügen.
4. GitHub `mikefaehCH/web-kit` → Settings → Secrets and variables → Actions → New repository secret → Name `ANTHROPIC_API_KEY`; Wert direkt dort eintragen.
5. Offizielle Claude GitHub App bei https://github.com/apps/claude für **nur dieses Repository** installieren. Die erforderlichen Berechtigungen prüfen.

## Implementierter Workflow und Sicherheitsanforderungen

- Der Aufgabenbranch pinnt `anthropics/claude-code-action` und `actions/checkout` auf Commit-SHAs. Kein `pull_request_target`; Fork-PRs werden abgelehnt. Die Workflow-Berechtigungen sind `contents: read` und `pull-requests: read`.
- Claude erhält einen festen Prompt, den vollständigen Diff und relevante Projektregeln. PR-Dateien gelten als untrusted data. Zulässige Werkzeuge sind nur lesend und auf Git-Leseoperationen begrenzt.
- Das JSON-Schema verlangt Verdict, geprüften SHA, Zusammenfassung, allgemeine Findings und Security-Findings. Nur PASS ohne Findings und mit identischem aktuellen SHA kann erfolgreich sein.
- Bei fehlenden Variablen, Credentials, API-/Netzwerkfehlern, Timeout, ungültigem JSON oder geändertem HEAD gibt es **kein grünes Freigabesignal**.
- `--max-turns`, Workflow-Concurrency und Zeitlimits begrenzen einzelne Läufe, **ersetzen aber kein serverseitiges Ausgabenlimit**.

Aktivierung benötigt `CLAUDE_REVIEW_ENABLED=true` und `CLAUDE_REVIEW_BUDGET_APPROVED=true` als Repository-Variablen. Diese Variablen prüfen das Provider-Ausgabenlimit nicht technisch; sie dürfen erst nach dessen unabhängiger Kontrolle gesetzt werden. Danach muss GitHub das beobachtete Check-Ergebnis als Pflichtstatus verlangen. Das aktuelle Ruleset hat keine erforderlichen Statuschecks. Bis echte PASS-/FAIL-Läufe und die Ruleset-Konfiguration belegt sind, bleibt die unabhängige Approval gemäss `RELEASE_POLICY.md` verbindlich.
- Vor produktiver Verwendung Testfälle für gefährliche Änderungen, untrusted PR-Inhalte, neuen HEAD und Fehlerfälle durchführen.
- Ein Claude-Review ersetzt **nicht automatisch** die unabhängige GitHub-Approval. `RELEASE_POLICY.md` und Branch Rules bleiben unverändert, bis ein gesonderter geprüfter Änderungs-PR genehmigt wurde.

Referenzen:
- https://github.com/anthropics/claude-code-action/blob/main/docs/setup.md
- https://support.claude.com/en/articles/9796807-create-and-manage-workspaces-in-the-claude-console
