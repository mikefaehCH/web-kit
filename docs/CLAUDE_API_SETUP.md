# Claude-API und GitHub-App: sichere Einrichtung

## Status und Voraussetzungen

Das Gate ist **nicht aktiviert**, solange der App-Check nicht erfolgreich live getestet und im `Protect main`-Ruleset mit genau dieser App als Quelle erforderlich ist. Der Ruleset muss die Basis aktuell halten (`strict_required_status_checks_policy: true`). Die vier vorhandenen CI-Checks bleiben erforderlich. Es gibt keinen Bypass.

Vor einem bezahlten Aufruf muss in Anthropic ein tatsächlich wirksames Workspace-Ausgabenlimit von höchstens USD 10 pro Monat (oder der tiefere Betrag mit Sicherheitsmarge in der Abrechnungswährung) eingerichtet und verifiziert sein. **Betreiberangabe vom 2026-11-02, nicht unabhängig verifiziert:** Organisationslimit USD 20, Workspace-Limit USD 10 für `web-kit-reviews`. `CLAUDE_REVIEW_BUDGET_APPROVED=true` ist nur ein Workflow-Opt-in, kein Provider-Limit. Der Runner bewertet denselben Review-Fingerprint auf derselben Basis-SHA nur einmal (First-Verdict-Wins); jeder neue Review-Kontext kann Kosten verursachen. Drafts werden übersprungen.

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
- Der Runner liest jede geänderte Datei über die paginierte Pull-Request-Files-API und lädt ihren vollständigen Inhalt aus dem exakten HEAD (gelöschte Dateien aus der Basis). Fehlt bei einer Datei ein Text-Patch oder Textinhalt (z. B. binär oder zu gross), stimmt die Dateizahl nicht oder wird das Kontextlimit überschritten, blockiert er als unvollständige Review.
- Der serialisierte Diff plus vollständige Dateiinhalte werden als nicht vertrauenswürdiger Inhalt an Claude gesendet. Claude erhält keine Tools oder Zugangsdaten.
- Der Runner überspringt Draft-PRs. Jede Bewertung ist an einen SHA-256-Fingerprint des vollständigen Review-Kontexts (Patches plus vollständige Dateiinhalte), die unveränderliche Basis-SHA und die konfigurierte App-ID gebunden und wird als App-eigener Ledger-Check `Claude review ledger` am Basis-Commit gespeichert. Details und Restrisiken: [CLAUDE_REVIEW_GATE.md](CLAUDE_REVIEW_GATE.md).
- Vor einem kostenpflichtigen Modellaufruf muss ein `in_progress`-Ledger-Eintrag nachweislich angelegt sein; sonst startet kein Aufruf.
- Requests mit Zugangsdaten (GitHub `Authorization`, Anthropic `x-api-key`) folgen keinen HTTP-Weiterleitungen. Jede 3xx-Antwort wird als Fehler behandelt; das Weiterleitungsziel wird nie angefragt und erhält keine Header. Bei GitHub-Aufrufen schlägt der Check fehl, beim Provider gilt die Weiterleitung als retrybarer Transportfehler ohne Modellausgabe.
- Der App-Check wird vor dem Einlesen der PR-Metadaten und Dateien erstellt. Fehler beim vollständigen Diff werden so als sichtbarer fehlgeschlagener Check abgeschlossen.
- Unerwartete Antwortformen, HTTP-/JSON-/Timeout-Fehler und sonstige Ausnahmen führen fail-closed zu einem fehlgeschlagenen App-Check; geheime Werte und Modellantworten werden nicht geloggt. Der Check-Output nennt nur Verdict, Severity, exakt geänderte Pfade (sonst `(other)`) und Zeilennummern, nie Modell-Freitext.
- Die Modell-ID `claude-sonnet-5` entspricht dem dokumentierten ID-Format; ihre aktuelle Verfügbarkeit ist nicht bestätigt. Die API unterstützt `output_config.format` mit JSON Schema und Union-Typen. Ein echter Live-Aufruf bleibt Voraussetzung für die Abnahme.

## Abnahme

1. Provider-Ausgabenlimit, Environment-Branch-Regel, Environment-Secrets/-Variablen, App-Installation und App-ID prüfen. **Betreiberangabe vom 2026-11-02, nicht unabhängig verifiziert:** Repository-Secrets und -Variablen wurden entfernt, alte App/API-Schlüssel widerrufen, das Workspace-Limit gesetzt und die Budgetfreigabe erteilt. Diese Punkte sind vor der Aktivierung durch Auslesen der GitHub- bzw. Anthropic-Konfiguration zu belegen. `CLAUDE_REVIEW_ENABLED` bleibt bis zur kontrollierten Aktivierung auf `false`.
2. Unit-, Integrations- und adversariale Tests ausführen.
3. Nach Merge des vertrauenswürdigen Workflows kontrollierte Test-PRs verwenden: einen gültigen PASS nachweisen und einen absichtlich blockierenden FAIL nachweisen. Keine echten Nachrichten, produktiven Daten oder sonstigen Seiteneffekte verwenden.
4. Einen namensgleichen Check von einer anderen Quelle versuchen; er darf den erwarteten App-Check nicht erfüllen.
5. `Protect main` erneut auslesen: alle vier CI-Checks plus App-gebundener `Claude review`, erwartete App-Quelle, aktuelle Basis, null Approval-Anforderung im Solo-Maintainer-Modell, keine Bypass-Akteure.
6. Gate erst nach diesen Nachweisen als aktiv dokumentieren. Aktuell ist der Gate-Workflow noch nicht auf `main`; `Protect main` verlangt noch nicht den App-gebundenen Claude-Check und erzwingt keine aktuelle Basis. Der Gate-Status bleibt inaktiv.

Ein LLM kann durch adversariale Inhalte beeinflusst werden; strukturierte Ausgabe und Prompt-Injection-Abwehr reduzieren das Risiko, beweisen aber keine Unfehlbarkeit. Gegenprüfungen erfolgen nach Urheberschaft am selben exakten HEAD: Claude prüft Änderungen von ChatGPT/Codex; ChatGPT/Codex prüft Änderungen von Claude. Bei gemischter Autorenschaft prüft jeder Agent die Teile des anderen. Mike prüft den Gesamtstand und entscheidet ausdrücklich über den Merge. Ein zusätzlicher externer Reviewer ist nicht erforderlich. Das sind technische Reviews, keine GitHub-Approvals.

Referenzen:
- https://platform.claude.com/docs/en/about-claude/models/model-ids-and-versions
- https://platform.claude.com/docs/en/build-with-claude/structured-outputs
- https://docs.github.com/en/actions/reference/workflows-and-actions/deployments-and-environments
- https://docs.github.com/en/actions/reference/security/securely-using-pull_request_target
