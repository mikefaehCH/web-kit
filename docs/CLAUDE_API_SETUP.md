# Claude-API und GitHub-App: sichere Einrichtung

## Status und Voraussetzungen

Das Gate ist **nicht aktiviert**, solange der App-Check nicht erfolgreich live getestet und im `Protect main`-Ruleset mit genau dieser App als Quelle erforderlich ist. Der Ruleset muss die Basis aktuell halten (`strict_required_status_checks_policy: true`). Die vier vorhandenen CI-Checks bleiben erforderlich. Es gibt keinen Bypass.

Vor einem bezahlten Aufruf muss in Anthropic ein tatsächlich wirksames Workspace-Ausgabenlimit von höchstens CHF 10 pro Monat (oder der tiefere Betrag mit Sicherheitsmarge in der Abrechnungswährung) eingerichtet und verifiziert sein. `CLAUDE_REVIEW_BUDGET_APPROVED=true` ist nur ein Workflow-Opt-in, kein Provider-Limit. Der Runner vermeidet Wiederholungsaufrufe für denselben erfolgreichen PR-HEAD und dieselbe Basis-SHA; jeder neue HEAD kann Kosten verursachen. Drafts werden übersprungen.

## Secrets in einem geschützten Environment

Die privaten Schlüssel dürfen **keine Repository-Secrets** sein. `pull_request`-Workflows aus Branches desselben Repositories können Repository-Secrets erhalten und damit einen App-Check fälschen oder den Anthropic-Schlüssel ausgeben.

1. In `Settings → Environments` ein Environment `claude-review` anlegen.
2. Unter Deployment branches and tags ausschliesslich den Branch `main` zulassen. Keine PR-Refs oder Feature-Branches ergänzen.
3. Diese **Environment-Secrets** anlegen: `ANTHROPIC_API_KEY` und `CLAUDE_REVIEW_APP_PRIVATE_KEY`.
4. Diese **Environment-Variablen** anlegen: `CLAUDE_REVIEW_APP_CLIENT_ID`, `CLAUDE_REVIEW_APP_ID`, `CLAUDE_REVIEW_ENABLED` und `CLAUDE_REVIEW_BUDGET_APPROVED`.
5. Gleichnamige Repository-Secrets `ANTHROPIC_API_KEY` und `CLAUDE_REVIEW_APP_PRIVATE_KEY` entfernen. Repository-Variablen mit denselben Gate-Namen ebenfalls entfernen, damit die Werte eindeutig aus dem Environment kommen.

Der vertrauenswürdige `pull_request_target`-Job läuft auf der Basis-Ref `main` und darf daher das Environment verwenden. Normale `pull_request`-Workflows laufen auf `refs/pull/...` und werden durch die Branch-Regel vom Environment ausgeschlossen. PR-Code wird nie ausgecheckt oder ausgeführt. Diese Grenze schützt vor Zugriff durch nicht gemergte PR-Workflows; Änderungen, die bereits in `main` liegen, gehören weiterhin zum vertrauenswürdigen Repository-Code.

## Dedizierte GitHub-App

1. Die App gehört `mikefaehCH`, hat keine aktiven Webhooks und nur Repository-Berechtigung **Checks: Read and write**.
2. Die Installation umfasst ausschliesslich `mikefaehCH/web-kit`.
3. Die Client ID und App ID kommen als Environment-Variablen `CLAUDE_REVIEW_APP_CLIENT_ID` und `CLAUDE_REVIEW_APP_ID` hinein. Der private Schlüssel kommt ausschliesslich als Environment-Secret `CLAUDE_REVIEW_APP_PRIVATE_KEY` hinein.
4. Der Workflow verlangt beim Check-Run die konfigurierte App-ID. Im Ruleset ist `Claude review` als erforderlicher Check mit genau dieser App als Quelle auszuwählen. Ein gleichnamiger Check von GitHub Actions reicht nicht.

## Workflow-Schutz und vollständiger Diff

- Workflow und Skript werden aus dem vertrauenswürdigen Basis-Commit ausgeführt. Die Berechtigungen des Workflow-Tokens sind auf `contents: read` und `pull-requests: read` begrenzt; der App-Token ist nur für dieses Repository und `checks: write` bestimmt.
- Der Runner liest jede geänderte Datei über die paginierte Pull-Request-Files-API. Fehlt bei einer Datei ein Text-Patch (z. B. binär oder zu gross), stimmt die Dateizahl nicht oder wird das Gesamtlimit überschritten, blockiert er als unvollständige Review.
- Der serialisierte Diff wird als nicht vertrauenswürdiger Inhalt an Claude gesendet. Claude erhält keine Tools oder Zugangsdaten.
- Der Runner überspringt Draft-PRs und cached einen erfolgreichen App-Check nur für identische PR-, HEAD-, Basis- und App-IDs. Ein neuer HEAD oder eine neue Basis-SHA erfordert eine neue Prüfung.
- Unerwartete Antwortformen, HTTP-/JSON-/Timeout-Fehler und sonstige Ausnahmen führen fail-closed zu einem fehlgeschlagenen App-Check; geheime Werte und Modellantworten werden nicht geloggt.
- Die Modell-ID `claude-sonnet-5` ist gültig. Die API unterstützt `output_config.format` mit JSON Schema und Union-Typen. Ein echter Live-Aufruf bleibt dennoch Voraussetzung für die Abnahme.

## Abnahme

1. Provider-Ausgabenlimit, Environment-Branch-Regel, Environment-Secrets/-Variablen, App-Installation und App-ID prüfen.
2. Unit-, Integrations- und adversariale Tests ausführen.
3. Nach Merge des vertrauenswürdigen Workflows kontrollierte Test-PRs verwenden: einen gültigen PASS nachweisen und einen absichtlich blockierenden FAIL nachweisen. Keine echten Nachrichten, produktiven Daten oder sonstigen Seiteneffekte verwenden.
4. Einen namensgleichen Check von einer anderen Quelle versuchen; er darf den erwarteten App-Check nicht erfüllen.
5. `Protect main` erneut auslesen: alle vier CI-Checks plus App-gebundener `Claude review`, erwartete App-Quelle, aktuelle Basis, null Approval-Anforderung im Solo-Maintainer-Modell, keine Bypass-Akteure.
6. Gate erst nach diesen Nachweisen als aktiv dokumentieren.

Ein LLM kann durch adversariale Inhalte beeinflusst werden; strukturierte Ausgabe und Prompt-Injection-Abwehr reduzieren das Risiko, beweisen aber keine Unfehlbarkeit. Für Änderungen am Gate, Validator, Ruleset oder an Berechtigungen sind separate Claude- und ChatGPT-Reviews am exakten HEAD und die ausdrückliche Merge-Entscheidung des alleinigen Maintainers erforderlich. Das sind technische Reviews, keine GitHub-Approvals.

Referenzen:
- https://platform.claude.com/docs/en/about-claude/models/model-ids-and-versions
- https://platform.claude.com/docs/en/build-with-claude/structured-outputs
- https://docs.github.com/en/actions/reference/workflows-and-actions/deployments-and-environments
- https://docs.github.com/en/actions/reference/security/securely-using-pull_request_target
