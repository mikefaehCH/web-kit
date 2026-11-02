# Claude-Zweitprüfung und kontrollierte Release-Freigabe

Status: **Implementierung im Aufgabenbranch, noch nicht produktiv aktiviert.** Das Gate ersetzt keine geltende Approval nach `RELEASE_POLICY.md` und ist in GitHub noch kein Pflichtcheck.

## Ziel und Rollen

- **ChatGPT/Codex** implementiert und testet Änderungen ausschliesslich auf Aufgabenbranches.
- **Claude** führt eine eigenständige, dokumentierte technische Zweitprüfung am exakten PR-HEAD durch. Ein Claude-Kommentar ist **kein** GitHub-Approval einer unabhängigen berechtigten Person.
- **Product Owner** entscheidet über die Einführung eines alternativen Freigabemodells. Eine menschliche GitHub-Approval bleibt erforderlich, solange die geltende Release-Policy oder das GitHub-Ruleset dies verlangen.

## Implementierter Ablauf

1. `pull_request` auf `main` (Eröffnung, neue Commits, Wiedereröffnung, Ready-for-review) startet den Check. Fork-PRs werden abgelehnt. Kein `pull_request_target`.
2. Der Runner ermittelt PR-Nummer, Base und **unveränderlichen HEAD-SHA** und checkt exakt diesen Commit mit `contents: read`, `pull-requests: read` aus.
3. Claude erhält den vollständigen Diff, Repository-Regeln und relevante Tests. PR-Inhalte gelten als nicht vertrauenswürdige Daten. Werkzeuge sind auf Lesen und `git diff`/`show`/`log` begrenzt; Claude kann keine Dateien ändern, keine Befehle ausführen und keine Netzwerkzugriffe auslösen.
4. Die Ausgabe muss dem JSON-Schema entsprechen: Verdict, `reviewed_sha`, Zusammenfassung, Findings und Security-Findings. Nur `PASS` mit leerem Findings-Array und exaktem HEAD-SHA kann den Check bestehen.
5. `FAIL`, `INCONCLUSIVE`, fehlende/ungültige Ausgabe, Provider-Fehler, Timeout, fehlende Aktivierungsvariablen oder geänderter HEAD ergeben keinen erfolgreichen Check. Neue Commits starten eine neue Prüfung.
6. CI führt lokale synthetische PASS- und FAIL-Fälle aus. Das ist kein echter Claude-Aufruf und kein Nachweis, dass API-Zugang, Kostenlimit oder der Live-Workflow funktionieren.

## Aktueller Aktivierungsblocker

- Die bestehende Ruleset-API zeigt `Protect main` als aktiv, aber ohne Branchschutz-/Approval-Pflicht und mit einer **leeren Liste erforderlicher Statuschecks**. Der Statuscheck ist somit aktuell nicht verbindlich.
- Die GitHub-Verbindung erlaubt das Lesen des Rulesets, aber nicht dessen Administration. Eine Änderung von `Protect main` konnte nicht vorgenommen werden.
- Repository-Dokumentation genehmigt bisher nur die Vorbereitung mit Ziel CHF 10/Monat; eine kostenpflichtige Aktivierung ist nicht freigegeben. Das Provider-Limit und der API-Key sind nicht verifiziert.
- `RELEASE_POLICY.md` verlangt weiterhin die unabhängige Approval. Deshalb bleiben menschliche Approval und bestehende Regeln in Kraft.

Das Gate darf erst als produktiv gelten, nachdem Provider-Ausgabenlimit und API-Key unabhängig geprüft wurden, ein echter Claude-PASS und ein blockierter Live-FAIL nachgewiesen wurden, das Ruleset den beobachteten Check zwingend verlangt und eine separate Policy-Änderung freigegeben wurde.

## Einführungsbedingungen

- Providerseitiges Monatslimit (maximal CHF 10 inkl. Währungsumrechnung und Marge) prüfen und festlegen; ein GitHub-Repository-Variable ist kein Ersatz für dieses Limit. API-Key ausschliesslich als `ANTHROPIC_API_KEY`-Secret ablegen.
- Workflow auf einem Test-PR mit echtem PASS, Sicherheitsbefund, Timeout, neuem HEAD, Fork-PR und fehlendem Secret validieren.
- Danach das Ruleset mit PR-Pflicht und dem tatsächlich beobachteten Claude-Check konfigurieren. Unabhängige Approval erst entfernen, wenn eine separate Policy-Änderung geprüft und genehmigt wurde.
- Bei automatisierter KI-Prüfung ohne unabhängige menschliche Approval muss eine bewusst genehmigte, technisch durchsetzbare Ersatzregel definiert werden. Ein blosses PR-Kommentar-Label ist kein Ersatz.

## Sofortige Priorität

Zuerst PR #7 (Schliessung der Workflow-Lücke), dann PR #8 (isoliertes Hosting) jeweils nach geltender Freigabe behandeln. Kein produktiver WhatsApp-Versand vor separater Abnahme.
