# Claude-Review-Gate und Solo-Maintainer-Freigabe

Status: **nicht produktiv aktiviert**. Die Workflow-Implementierung, grüne CI oder ein manuelles Claude-Ergebnis allein ersetzen weder den erforderlichen App-Check noch seine Durchsetzung im Ruleset.

## Freigabemodell

- Mike ist der alleinige Maintainer und trifft die ausdrückliche Merge-Entscheidung. Es wird keine menschliche GitHub-Approval vorgetäuscht.
- ChatGPT und Claude liefern getrennte technische Prüfungen am exakten HEAD. Für Änderungen an Gate, Validator, Regeln oder Berechtigungen sind beide Prüfungen nötig.
- Eine menschliche Approval wird bei regulären PRs erst ersetzt, wenn der App-Check live PASS und blockierenden FAIL nachgewiesen hat und im Ruleset mit festgelegter App-Quelle, aktueller Basis und ohne Bypass verbindlich erzwungen wird. Bis dahin gilt die Approval-Regel. Für den ausdrücklich autorisierten Bootstrap-PR, der das Gate einführt, gilt die eng begrenzte Ausnahme aus `RELEASE_POLICY.md`: zwei getrennte technische Reviews, keine offenen Findings, grüne CI und Mikes bewusste Merge-Entscheidung bei null erforderlichen Approvals.
- Das Modell kann durch adversariale Inhalte fehlgeleitet werden. Das Gate reduziert dieses Risiko, beseitigt es aber nicht; ein PASS ist kein Beweis menschlicher Unfehlbarkeit oder unabhängiger menschlicher Prüfung.

## Technischer Ablauf

1. `pull_request_target` führt den Workflow aus dem vertrauenswürdigen Basis-Branch aus. Er checkt ausschliesslich den Basis-Commit aus, mit `persist-credentials: false`; PR-Code wird weder ausgeführt noch ausgecheckt.
2. Das Workflow-Token hat nur `contents: read` und `pull-requests: read`. Ein dediziertes App-Token hat nur `checks: write` auf `web-kit`.
3. API-Metadaten müssen Repository, Basisbranch, PR-Status, HEAD und Basis-SHA bestätigen. Der paginierte Files-Endpunkt muss exakt alle `changed_files` liefern und für jede Datei einen Text-Patch enthalten. Zusätzlich werden die vollständigen Inhalte aller geänderten Dateien am exakten HEAD geladen; gelöschte Dateien werden aus der geprüften Basis geladen. Binärdateien, fehlende/trunkierte Patches oder Inhalte, unvollständige Paginierung oder ein überschrittenes Kontextlimit blockieren.
4. Vollständige Dateiinhalte und Diff werden JSON-kodiert als feindlicher, nicht vertrauenswürdiger Text zusammen mit den vertrauenswürdigen Regeln an Claude übergeben. Claude hat keine Tools oder Secrets.
5. Nur vollständiges strukturiertes `PASS`, leere Findings, korrekter HEAD und aktueller Basis-/Main-Stand erlauben Erfolg. `FAIL`, `INCONCLUSIVE`, Findings, ungültige Antwort, jeder Laufzeitfehler oder veraltete Revisionen blockieren. Auch unerwartete Ausnahmen versuchen, den App-Check auf `failure` zu setzen.
6. Der `Claude review` Check-Run muss von der explizit konfigurierten GitHub-App-ID stammen. Gleicher Name oder ein GitHub-Actions-Status genügt nicht.
7. Ein erfolgreicher Check wird nur bei identischem PR, HEAD, Basis-SHA und App-ID wiederverwendet. Ein nicht-passendes strukturiertes Ergebnis wird mit SHA-256 des vollständigen Review-Kontexts als App-eigener Failure-Ledger-Check auf dem unveränderlichen Basis-Commit gespeichert. Derselbe Inhalt auf derselben Basis kann dadurch nicht durch Reopen, einen leeren Commit oder eine neue PR erneut bewertet werden. Drafts werden übersprungen.

## Notwendige Plattformkonfiguration

- Ein GitHub Environment `claude-review` muss Deployment ausschliesslich von `main` erlauben. `ANTHROPIC_API_KEY` und `CLAUDE_REVIEW_APP_PRIVATE_KEY` gehören nur als Environment-Secrets hinein. Gleichnamige Repository-Secrets müssen entfernt werden. Client ID, App-ID und Gate-Opt-ins gehören als Environment-Variablen hinein.
- Die App hat keine aktiven Webhooks, nur Repository-Berechtigung `Checks: Read and write` und ist nur auf `mikefaehCH/web-kit` installiert.
- Der aktive Ruleset `Protect main` muss alle bestehenden CI-Pflichtchecks sowie `Claude review` mit exakt dieser App als Quelle erfordern. «Require branches to be up to date» muss an sein; es gibt keine Bypass-Akteure. Im Solo-Maintainer-Modell ist die erforderliche Approval-Anzahl null.
- Ein verifiziertes Anthropic-Workspace-Ausgabenlimit von höchstens CHF 10 pro Monat ist unabhängig vom Workflow-Opt-in erforderlich. Jeder neue HEAD kann einen kostenpflichtigen Aufruf auslösen; derselbe erfolgreiche HEAD/Basis-Stand wird nicht erneut berechnet.

Letzter ausgelesener Ruleset-Stand: `Protect main` ist aktiv, verlangt null Approvals und weiterhin `repository`, `static-check`, `edge-function` und `database`; die Basis-Aktualität ist **nicht** strikt erzwungen. `require_last_push_approval` ist aktiv. `Claude review` ist nicht erforderlich. Damit ist das Gate weiterhin **nicht verbindlich**.

## Nachweise und Grenzen

Mock-Tests belegen Validator- und Fehlerlogik, aber keine Live-API-Kompatibilität, App-Identität, Environment-Branch-Beschränkung oder Ruleset-Durchsetzung. Diese Punkte brauchen nach Merge des vertrauenswürdigen Workflows kontrollierte Test-PRs und anschliessendes Auslesen der GitHub-Konfiguration. Bis dahin bleibt das Gate inaktiv.

Keine produktiven Daten, echten WhatsApp-Nachrichten, automatischen Merges oder Deployments im Gate-Test verwenden.
