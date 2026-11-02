# Claude-Zweitprüfung und kontrollierte Release-Freigabe

Status: **Vorschlag, noch nicht produktiv aktiviert.** Diese Ergänzung ersetzt keine geltende GitHub-Branchschutzregel und keine Approval nach `RELEASE_POLICY.md`.

## Ziel und Rollen

- **ChatGPT/Codex** implementiert und testet Änderungen ausschliesslich auf Aufgabenbranches.
- **Claude** führt eine eigenständige, dokumentierte technische Zweitprüfung am exakten PR-HEAD durch. Ein Claude-Kommentar ist **kein** GitHub-Approval einer unabhängigen berechtigten Person.
- **Product Owner** entscheidet über die Einführung eines alternativen Freigabemodells. Eine menschliche GitHub-Approval bleibt erforderlich, solange die geltende Release-Policy oder das GitHub-Ruleset dies verlangen.

## Geplanter automatischer Ablauf

1. PR-Ereignis (Eröffnung, neue Commits, Wiedereröffnung) startet die Zweitprüfung. Kein `pull_request_target`-Checkout von nicht vertrauenswürdigem PR-Code mit Secrets.
2. Der Runner ermittelt PR-Nummer, Base und **unveränderlichen HEAD-SHA**, prüft zulässige Repository-/Branch-Kontexte und begrenzt Berechtigungen auf `contents: read` und `pull-requests: write`.
3. Claude analysiert den vollständigen relevanten Diff, betroffene Regeln und Tests; keine ungeprüften Anweisungen aus PR-Inhalten übernehmen. Geheimnisse dürfen weder an Logs noch an PR-Kommentare gelangen.
4. Ergebnis wird als Check und PR-Kommentar mit HEAD-SHA, Befunden, Risikostufe, Testabdeckung und eindeutiger Entscheidung (PASS/FAIL/INCONCLUSIVE) dokumentiert. Bei fehlendem API-Zugriff, Timeout oder unvollständiger Prüfung: **FAIL-CLOSED**.
5. Neue Commits invalidieren alte Prüfergebnisse. Ein positives Claude-Ergebnis allein erlaubt **keinen** Merge.
6. Erst wenn alle Pflichtchecks, geltenden unabhängigen GitHub-Approvals und Branchschutzregeln erfüllt sind, darf der bestehende Merge-Prozess greifen. Kein Umgehen von Regeln über API-Tokens, Admin-Bypass oder Statusfälschung.

## Einführungsbedingungen

- Geeignete Claude-Integration und deren Kosten/Datenschutzfreigabe separat klären; **keine** API-Schlüssel ins Repository committen.
- Workflow zunächst auf einem Test-PR validieren: PASS, Sicherheitsbefund, Timeout, neuer HEAD, Fork-PR und fehlende Berechtigungen.
- GitHub-Ruleset und `RELEASE_POLICY.md` nur über gesonderten geprüften PR ändern. Bis dahin bleibt die Approval am aktuellen HEAD verpflichtend.
- Bei automatisierter KI-Prüfung ohne unabhängige menschliche Approval muss eine bewusst genehmigte, technisch durchsetzbare Ersatzregel definiert werden. Ein blosses PR-Kommentar-Label ist kein Ersatz.

## Sofortige Priorität

Zuerst PR #7 (Schliessung der Workflow-Lücke), dann PR #8 (isoliertes Hosting) jeweils nach geltender Freigabe behandeln. Kein produktiver WhatsApp-Versand vor separater Abnahme.
