# Claude-Review-Gate und Solo-Maintainer-Freigabe

Status: **Aufgabenbranch; nicht produktiv aktiviert.** Der Workflow-Code allein ersetzt weder eine Approval noch Branchschutz. Das Gate darf erst als verbindlich gelten, wenn der dedizierte GitHub-App-Check als erforderlicher Check mit genau dieser App als Quelle konfiguriert und live geprüft wurde.

## Freigabemodell

- Mike ist der einzige Maintainer und trifft den abschliessenden Merge-Entscheid.
- Claude und ChatGPT liefern technische Prüfungen; sie geben keine menschliche GitHub-Approval vor und dürfen keine solche vortäuschen.
- Nach vollständiger Aktivierung kann ein erfolgreicher Claude-App-Check die bisherige Approval-Anforderung für normale PRs ersetzen. CI bleibt zusätzlich erforderlich. Gate-, Policy- oder Berechtigungsänderungen erhalten vor dem Merge zusätzlich eine separate ChatGPT- und Claude-Prüfung am exakten HEAD.
- Bis Branchschutz und Live-Verhalten belegt sind, ist das Gate nicht aktiv. PRs bleiben blockiert, bis die im geltenden Ruleset verlangten Bedingungen erfüllt sind.

## Technischer Ablauf

1. Der Workflow verwendet `pull_request_target` und wird aus dem vertrauenswürdigen Basisstand geladen. Er checkt nur den Basis-Commit aus; PR-Code wird weder ausgecheckt noch ausgeführt.
2. Der Runner liest PR-Metadaten und den vollständigen Diff über die GitHub-API. Forks, geschlossene/falsch ausgerichtete PRs, zu grosse Diffs und SHA-Abweichungen werden abgelehnt.
3. Der Diff wird als JSON-kodierter, nicht vertrauenswürdiger Text an die Messages API gesendet. Claude erhält keine Werkzeuge, Tokens oder anderen Zugangsdaten.
4. Das Ergebnis muss dem Schema entsprechen. Nur `PASS`, leerer Findings-Listen, normaler API-Abschluss und exakt geprüfter HEAD können bestehen.
5. Vor dem Erfolg werden PR-HEAD, PR-Basis und aktueller `main` erneut geprüft. Jede Änderung während des Reviews, API-/Parsingfehler, Timeout, fehlende Aktivierung oder unbekannter Zustand blockiert.
6. Ein dediziertes, nur für `checks:write` berechtigtes GitHub App erstellt den Check `Claude review` auf dem exakten PR-HEAD. Der Actions-Workflow selbst veröffentlicht keinen gleichnamigen Commit-Status.
7. Branchschutz muss `Claude review` als erforderlichen Statuscheck **mit der dedizierten App als erwarteter Quelle** verlangen. Ein Check gleicher Bezeichnung von GitHub Actions oder einem PR-Workflow darf nicht genügen.

## Noch offene Aktivierung

- GitHub App erstellen, nur `Checks: write` gewähren, ausschliesslich auf `mikefaehCH/web-kit` installieren und `CLAUDE_REVIEW_APP_CLIENT_ID` sowie `CLAUDE_REVIEW_APP_PRIVATE_KEY` sicher in Actions hinterlegen.
- `Protect main` so konfigurieren, dass PRs, alle produktspezifischen CI-Checks und der App-gebundene Check `Claude review` erforderlich sind. «Require branches to be up to date» aktivieren; keinen Bypass für Maintainer einrichten.
- Providerseitiges monatliches Ausgabenlimit unabhängig verifizieren. Die Actions-Variable `CLAUDE_REVIEW_BUDGET_APPROVED` ist nur ein Opt-in und beweist kein Provider-Limit.
- Kontrollierte Live-Tests für PASS, FAIL/Findings, ungültige Antwort, API-Fehler/Timeout, geänderten HEAD und nicht aktivierte Konfiguration durchführen.
- Ruleset- und App-Konfiguration, erwartete Check-Quelle und Ergebnisse dokumentieren. Bis dahin bleiben `CLAUDE_REVIEW_ENABLED` und Budget-Opt-in aus.

## Nachweise und Grenzen

Lokale Mock- und Validator-Tests belegen Fehlerbehandlung und Statuslogik, aber keinen echten Claude-Aufruf, keine App-Identität und keinen Branchschutz. Ein Live-PASS allein beweist ebenfalls keine Regel-Durchsetzung. «Protect main» hatte bei der letzten verifizierten Prüfung keine erforderlichen Checks; diese Konfiguration muss nach der App-Einrichtung erneut geprüft werden.

Keine produktiven Daten, echten WhatsApp-Nachrichten, automatischen Merges oder Deployments im Gate-Test verwenden.
