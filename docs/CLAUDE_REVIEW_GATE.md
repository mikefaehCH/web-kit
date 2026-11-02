# Claude-Review-Gate und Solo-Maintainer-Freigabe

Status: **nicht produktiv aktiviert**. Die Workflow-Implementierung, grüne CI oder ein manuelles Claude-Ergebnis allein ersetzen weder den erforderlichen App-Check noch seine Durchsetzung im Ruleset.

## Freigabemodell

- Mike ist der alleinige Maintainer und trifft die ausdrückliche Merge-Entscheidung. Es wird keine menschliche GitHub-Approval vorgetäuscht.
- ChatGPT und Claude liefern getrennte technische Prüfungen am exakten HEAD. Für Änderungen an Gate, Validator, Regeln oder Berechtigungen sind beide Prüfungen nötig.
- Eine menschliche Approval wird bei regulären PRs erst ersetzt, wenn der App-Check live PASS und blockierenden FAIL nachgewiesen hat und im Ruleset mit festgelegter App-Quelle, aktueller Basis und ohne Bypass verbindlich erzwungen wird. Bis dahin gilt die Approval-Regel. Für PR #9, der das Gate einführt, gilt die eng begrenzte Bootstrap-Ausnahme aus `RELEASE_POLICY.md`: zwei getrennte technische Reviews, keine offenen Findings, grüne CI und Mikes bewusste Merge-Entscheidung bei null erforderlichen Approvals. Die Ausnahme erlischt mit dem Merge von PR #9.
- Das Modell kann durch adversariale Inhalte fehlgeleitet werden. Das Gate reduziert dieses Risiko, beseitigt es aber nicht; ein PASS ist kein Beweis menschlicher Unfehlbarkeit oder unabhängiger menschlicher Prüfung.

## Technischer Ablauf

1. `pull_request_target` führt den Workflow aus dem vertrauenswürdigen Basis-Branch aus. Er checkt ausschliesslich den Basis-Commit aus, mit `persist-credentials: false`; PR-Code wird weder ausgeführt noch ausgecheckt.
2. Das Workflow-Token hat nur `contents: read` und `pull-requests: read`. Ein dediziertes App-Token hat nur `checks: write` auf `web-kit`.
3. API-Metadaten müssen Repository, Basisbranch, PR-Status, HEAD und Basis-SHA bestätigen. Der paginierte Files-Endpunkt muss exakt alle `changed_files` liefern und für jede Datei einen Text-Patch enthalten. Zusätzlich werden die vollständigen Inhalte aller geänderten Dateien am exakten HEAD geladen; gelöschte Dateien werden aus der geprüften Basis geladen. Binärdateien, fehlende/trunkierte Patches oder Inhalte, unvollständige Paginierung oder ein überschrittenes Kontextlimit blockieren.
4. Vollständige Dateiinhalte und Diff werden JSON-kodiert als feindlicher, nicht vertrauenswürdiger Text zusammen mit den vertrauenswürdigen Regeln an Claude übergeben. Claude hat keine Tools oder Secrets.
5. Nur vollständiges strukturiertes `PASS`, leere Findings, korrekter HEAD und aktueller Basis-/Main-Stand erlauben Erfolg. `FAIL`, `INCONCLUSIVE`, Findings, ungültige Antwort, jeder Laufzeitfehler oder veraltete Revisionen blockieren. Auch unerwartete Ausnahmen versuchen, den App-Check auf `failure` zu setzen.
6. Der `Claude review` Check-Run muss von der explizit konfigurierten GitHub-App-ID stammen. Gleicher Name oder ein GitHub-Actions-Status genügt nicht.
7. Jede Bewertung läuft über den First-Verdict-Ledger (nächster Abschnitt). Drafts werden übersprungen.
8. Der Check-Output nennt nur Verdict, Severity, Pfade und Zeilennummern. Pfade erscheinen nur, wenn sie exakt in der Liste der geänderten Dateien stehen, sonst `(other)`; sie werden auf `[A-Za-z0-9_./-]` reduziert und in einen Code-Span gesetzt, damit keine Markdown-Links oder Autolinks entstehen. Boolesche Werte gelten nicht als Zeilennummer. Modell-Freitext wird nie ausgegeben.

## First-Verdict-Ledger

- **Schlüssel:** SHA-256 des vollständigen Review-Kontexts (Patches plus vollständige Dateiinhalte, ohne PR-Nummer), gebunden an die unveränderliche Basis-SHA (der Ledger-Check liegt auf dem Basis-Commit) und an die konfigurierte App-ID. Einträge anderer Apps oder anderer Basis-Commits zählen nicht.
- **Claim vor Kosten:** Vor jedem Modellaufruf legt der Runner einen App-eigenen `in_progress`-Eintrag `Claude review ledger` an und prüft dessen Identität und Sichtbarkeit. Ohne nachweislichen Claim startet kein kostenpflichtiger Aufruf.
- **Erstentscheid gilt:** Ein abgeschlossener PASS für denselben Fingerprint auf derselben Basis wird wiederverwendet, auch unter einer anderen PR. Ein abgeschlossener Nicht-PASS, ein offener (`in_progress`) oder unbekannter Eintrag blockiert jede weitere Bewertung desselben Fingerprints.
- **Parallelität:** Reviews mit derselben Basis-SHA werden per Job-Concurrency serialisiert. Kommt es trotzdem zu gleichzeitigen Claims, gewinnt der früheste Claim; spätere werden ohne Modellaufruf freigegeben und ihr PR-Check schlägt fehl.
- **Vor einem PR-PASS** wird nach dem Finalisieren des Ledger-Eintrags unmittelbar vor dem Setzen auf `success` der Ledger erneut gelesen: Es muss genau ein abgeschlossener PASS existieren (bei einer frischen Bewertung der eigene), daneben nur freigegebene (`neutral`) Einträge. Ein FAIL, ein unbekannter Zustand, ein weiterer PASS oder ein ungelöster Claim verhindern den PR-PASS. Danach werden PR-HEAD, PR-Basis und `main` erneut geprüft. Jeder Fehler in diesem Recheck setzt den PR-Check auf `failure`; dasselbe gilt für die Wiederverwendung eines bestehenden PASS.
- **Fehlerklassen:** Nur Transport- oder Timeout-Fehler ohne Provider-Antwort (inkl. HTTP-Fehlerstatus, die keine Modellausgabe enthalten) geben den Claim als `neutral` frei und sind retrybar. Jede empfangene Antwort, die abgelehnt (`refusal`), abgeschnitten (`max_tokens`), grösser als `MAX_PROVIDER_RESPONSE_BYTES` (gelesen werden höchstens Limit + 1 Byte; eine übergrosse Antwort wird nie gekürzt geparst), kein gültiges JSON, falsch geformt, mehrdeutig oder kein gültiger PASS ist, wird als Nicht-PASS gespeichert und bleibt blockierend. Jede andere Ausnahme nach Start des Modellaufrufs gilt ebenfalls als Nicht-PASS.
- **Fail-closed bei Ledger-Fehlern:** Schlägt das Abschliessen eines Claims fehl, bleibt er `in_progress` und blockiert den Fingerprint. Wiederherstellung nur durch geänderten Inhalt oder neue Basis.
- **Geltungsbereich und Restrisiko:** First-Verdict-Wins gilt nur für denselben Review-Fingerprint auf derselben Basis. Jede noch so triviale Inhaltsänderung (z. B. Leerzeichen) oder eine neue Basis nach einem Rebase erzeugt einen neuen Fingerprint und damit eine neue, unabhängige Bewertung. Wiederholte Versuche mit geringfügig geänderten Inhalten bleiben deshalb möglich; sie kosten jeweils einen Modellaufruf und sind über die Check-Historie nachvollziehbar.
- **Liveness-Grenzen:** GitHub hält pro Concurrency-Gruppe höchstens einen wartenden Job; ein neuer wartender Job ersetzt einen älteren, der dann keinen Check erzeugt. Der PR bleibt dann wegen des fehlenden Pflichtchecks blockiert, bis er erneut ausgelöst wird (Push, Reopen). Ein durch Job-Timeout oder Abbruch hängengebliebener `in_progress`-Claim blockiert den Fingerprint dauerhaft. Ein noch offener späterer Claim verhindert zudem den PR-PASS des Gewinners, bis er freigegeben ist; ein erneuter Lauf verwendet dann den gespeicherten PASS ohne neuen Modellaufruf. Die Annahme, dass später angelegte Check-Runs höhere IDs haben, wird nur für die Arbitration gleichzeitiger Claims genutzt; die Serialisierung ist die primäre Absicherung.

## Notwendige Plattformkonfiguration

- Ein GitHub Environment `claude-review` muss Deployment ausschliesslich von `main` erlauben. `ANTHROPIC_API_KEY` und `CLAUDE_REVIEW_APP_PRIVATE_KEY` gehören nur als Environment-Secrets hinein. Gleichnamige Repository-Secrets müssen entfernt werden. Client ID, App-ID und Gate-Opt-ins gehören als Environment-Variablen hinein.
- Die App hat keine aktiven Webhooks, nur Repository-Berechtigung `Checks: Read and write` und ist nur auf `mikefaehCH/web-kit` installiert.
- Der aktive Ruleset `Protect main` muss alle bestehenden CI-Pflichtchecks sowie `Claude review` mit exakt dieser App als Quelle erfordern. «Require branches to be up to date» muss an sein; es gibt keine Bypass-Akteure. Im Solo-Maintainer-Modell ist die erforderliche Approval-Anzahl null.
- Ein verifiziertes Anthropic-Workspace-Ausgabenlimit von höchstens USD 10 pro Monat ist unabhängig vom Workflow-Opt-in erforderlich (Betreiberangabe vom 2026-11-02, nicht unabhängig verifiziert: Workspace-Limit USD 10, Organisationslimit USD 20). Jeder neue Review-Fingerprint kann einen kostenpflichtigen Aufruf auslösen; derselbe Fingerprint auf derselben Basis wird nicht erneut bewertet.

Letzter ausgelesener Ruleset-Stand (Angabe des Implementierers vom 2026-11-02; im Claude-Review nicht erneut auslesbar, da kein API-Zugriff): `Protect main` ist aktiv, verlangt null Approvals und weiterhin `repository`, `static-check`, `edge-function` und `database`; die Basis-Aktualität ist **nicht** strikt erzwungen. `require_last_push_approval` ist aktiv. `Claude review` ist nicht erforderlich. Damit ist das Gate weiterhin **nicht verbindlich**.

## Nachweise und Grenzen

Mock-Tests belegen Validator- und Fehlerlogik, aber keine Live-API-Kompatibilität, App-Identität, Environment-Branch-Beschränkung oder Ruleset-Durchsetzung. Diese Punkte brauchen nach Merge des vertrauenswürdigen Workflows kontrollierte Test-PRs und anschliessendes Auslesen der GitHub-Konfiguration. Bis dahin bleibt das Gate inaktiv.

Keine produktiven Daten, echten WhatsApp-Nachrichten, automatischen Merges oder Deployments im Gate-Test verwenden.
