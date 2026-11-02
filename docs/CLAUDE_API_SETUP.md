# Claude-API und GitHub-App: Einrichtung

## Kostenkontrolle

Vor kostenpflichtigen Reviews muss in Anthropic ein Workspace-spezifisches Monatslimit eingerichtet und geprüft sein. Das Zielbudget aus der früheren Dokumentation beträgt höchstens CHF 10 pro Monat; den entsprechenden tieferen Betrag in der Abrechnungswährung mit Sicherheitsmarge verwenden. Warnung aktivieren. Das Actions-Opt-in `CLAUDE_REVIEW_BUDGET_APPROVED=true` ersetzt dieses Provider-Limit nicht.

Der API-Schlüssel wird als Repository-Secret `ANTHROPIC_API_KEY` in GitHub Actions gespeichert. Nie in Chat, Issues, PRs, Dateien oder Logs einfügen. `CLAUDE_REVIEW_ENABLED` und `CLAUDE_REVIEW_BUDGET_APPROVED` bleiben bis zur vollständigen Verifikation auf `false`.

## GitHub-App für nicht fälschbare Check-Quelle

Der Check darf nicht nur über seinen Namen identifiziert werden: PR-Workflows können gleichnamige Statussignale erzeugen. Deshalb braucht das Gate eine eigene GitHub-App.

1. Eine GitHub-App für `mikefaehCH` erstellen. Nur Repository-Berechtigung **Checks: Read and write** erteilen. Keine Berechtigungen zum Schreiben von Inhalten, PRs, Actions-Workflows oder Statuskommentaren.
2. Die App ausschliesslich auf `mikefaehCH/web-kit` installieren.
3. Client ID als Actions-Variable `CLAUDE_REVIEW_APP_CLIENT_ID` und privaten Schlüssel direkt als Actions-Secret `CLAUDE_REVIEW_APP_PRIVATE_KEY` speichern. Den Schlüssel nie an ChatGPT oder Claude schicken.
4. Im aktiven `Protect main`-Ruleset einen erforderlichen Statuscheck `Claude review` auswählen und als erwartete Quelle genau diese App einstellen. Zusätzlich PR-Pflicht, `repository`, `static-check`, `edge-function`, `database` und aktuelle Basis erzwingen. Keinen Bypass einrichten.

Der Workflow verwendet die App nur, um einen Check-Run auf dem geprüften Commit zu erstellen und abzuschliessen. Die App ist keine zweite Person und gibt keine GitHub-Approval ab.

## Laufzeit-Schutz

- `pull_request_target` lädt den Workflow aus dem vertrauenswürdigen Basisbranch. Es wird nur der Basis-Commit ausgecheckt; PR-Code wird als API-Diff verarbeitet, nicht ausgeführt.
- Der Diff ist nicht vertrauenswürdiger Inhalt. Die Messages-API erhält keine Werkzeuge und keine GitHub-/Anthropic-Zugangsdaten.
- Der Workflow-`GITHUB_TOKEN` ist auf `contents: read` und `pull-requests: read` begrenzt. Der separate App-Token ist auf das einzelne Repository und `checks: write` begrenzt.
- Nur ein strukturierter, fehlerfreier PASS für den exakten HEAD kann den App-Check erfolgreich abschliessen. FAIL, INCONCLUSIVE, Findings, API-Fehler, ungültiges JSON, Timeout, fehlende Aktivierung, zu grosser Diff oder geänderte PR-/Main-SHAs blockieren.
- Der Workflow-Job muss in allen Fehlerfällen fehlschlagen. Kann ein App-Check nicht angelegt oder aktualisiert werden, bleibt der erforderliche App-Check fehlend oder unvollständig und blockiert den Merge.
- Concurrency und Zeitlimits begrenzen einzelne Läufe, ersetzen aber kein Provider-Ausgabenlimit.

## Abnahme vor der Aktivierung

1. Workflow, App-Berechtigungen und Ruleset am aktuellen Stand prüfen.
2. Lokale Unit-, Integrations- und adversariale Tests durchführen.
3. Variablen nur für kontrollierte Live-Tests aktivieren und einen echten PASS sowie einen blockierten FAIL nachweisen.
4. App-Quelle und required check in `Protect main` verifizieren; absichtlich gleichnamige PR-Statuschecks dürfen die App-Prüfung nicht erfüllen.
5. Erst nach erfolgreicher Abnahme das Gate als aktiv dokumentieren. Bis dahin bleibt jede bisherige Schutzregel bestehen.

Referenzen:
- https://platform.claude.com/docs/en/build-with-claude/structured-outputs
- https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/available-rules-for-rulesets
- https://github.com/actions/create-github-app-token/releases
