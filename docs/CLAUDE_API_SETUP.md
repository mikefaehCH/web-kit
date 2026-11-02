# Claude API für GitHub-Code-Reviews: Einrichtung (noch nicht aktiviert)

## Kostenkontrolle

Genehmigt ist **Vorbereitung** mit Zielbudget maximal CHF 10/Monat, **keine kostenpflichtige Aktivierung**. Anthropic rechnet in der Kontowährung ab; CHF 10 sind nicht automatisch USD 10. Vor Aktivierung den entsprechenden niedrigeren Betrag als Monatslimit festlegen.

1. https://platform.claude.com/settings/workspaces öffnen und einen **eigenen, nicht-default Workspace** `web-kit-reviews` erstellen.
2. In diesem Workspace unter **Spend limits → Monthly limit** einen Betrag festlegen, der CHF 10/Monat nicht überschreitet (Währungsumrechnung mit Sicherheitsmarge). Zusätzlich Kostenwarnung einrichten.
3. Workspace-spezifischen API-Schlüssel erstellen. **Nicht** in Chat, Issues, PRs, Dateien oder Logs einfügen.
4. GitHub `mikefaehCH/web-kit` → Settings → Secrets and variables → Actions → New repository secret → Name `ANTHROPIC_API_KEY`; Wert direkt dort eintragen.
5. Offizielle Claude GitHub App bei https://github.com/apps/claude für **nur dieses Repository** installieren. Die erforderlichen Berechtigungen prüfen.

## Workflow-Entwurf und Sicherheitsanforderungen

- Erst nach verifizierter Kostenbegrenzung und ausdrücklicher Aktivierung `anthropics/claude-code-action@v1` einrichten, möglichst auf unveränderlichen Commit-SHA pinnen.
- `pull_request`-Trigger für `opened`, `synchronize`, `reopened`; keine Secrets für ungeprüften Fork-Code exponieren. Nur Repository-PRs zulassen, wenn die sichere Verarbeitung externer PRs nicht nachgewiesen ist.
- Claude erhält ein festes Review-Prompt und minimale GitHub-Berechtigungen. Keine Schreibrechte am Quellcode. Ausgaben: Review-Check und Kommentar mit PR-HEAD, Befunden, Tests und PASS/FAIL/INCONCLUSIVE.
- Fehlende Credentials, API-/Netzwerkfehler, Timeout, unvollständige Ausgabe oder neuer HEAD: **kein grünes Freigabesignal**.
- Token-/Turn-Limits sowie Workflow-Concurrency setzen, um API-Verbrauch zu begrenzen. Dies **ersetzt kein serverseitiges Ausgabenlimit**.
- Vor produktiver Verwendung Testfälle für gefährliche Änderungen, untrusted PR-Inhalte, neuen HEAD und Fehlerfälle durchführen.
- Ein Claude-Review ersetzt **nicht automatisch** die unabhängige GitHub-Approval. `RELEASE_POLICY.md` und Branch Rules bleiben unverändert, bis ein gesonderter geprüfter Änderungs-PR genehmigt wurde.

Referenzen:
- https://github.com/anthropics/claude-code-action/blob/main/docs/setup.md
- https://support.claude.com/en/articles/9796807-create-and-manage-workspaces-in-the-claude-console
