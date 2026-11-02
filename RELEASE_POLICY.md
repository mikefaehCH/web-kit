# Sicherer autonomer Entwicklungs- und Releaseprozess

1. **Auftrag:** Nur der vom Product Owner autorisierte Umfang. Der Agent prüft Ausgangscommit, offene PRs, zuständige Agenten und Repository-Regeln.
2. **Implementierung:** Aufgabenbranch und PR; nie direkt auf `main`. Keine produktiven Geheimnisse, Kundendaten oder irreversiblen Änderungen.
3. **CI:** Tests des tatsächlichen Produkts müssen grün sein. Bei web-kit deckt die initiale CI **nur Dokumentation und Repository-Gerüst** ab; sie ist kein Beweis für einen funktionsfähigen Generator.
4. **Review:** Unabhängige Approval am **aktuellen PR-HEAD** ist Pflicht bei App-, Sicherheits-, Workflow- und Infrastrukturänderungen. Für ausschliessliche README-Redaktion mit erfolgreicher Gerüst-CI ist diese Pflicht nicht erforderlich. Sicherheits- oder Datenschutzbefunde müssen ausgeräumt sein.
5. **Opt-in:** Im PR-Text muss eine eigene Zeile `Autonomy-Release: true` stehen. Bestehende PRs ohne Marker werden nie automatisch gemergt. Dieser Marker darf nur für bereits autorisierte Arbeiten gesetzt werden.
6. **Merge:** Der `Autonomous merge`-Workflow überprüft CI, PR, Approval und HEAD erneut und nutzt die GitHub-Merge-API mit SHA-Sperre. Branchschutz, Pflichtchecks und Reviews dürfen nicht umgangen werden.
7. **Deployment:** web-kit besitzt noch keine veröffentlichbare Website. Ein Pages-Deployment ist **nicht** aktiviert, bis Generator und Website mit Test- und Veröffentlichungsprozess bereitstehen. Anwendungs- oder Workflowänderungen benötigen zusätzliche produktspezifische CI; bis dahin bleibt Auto-Merge auf **README.md-only** beschränkt. Andere Dokumentationen, Projektregeln und Workflowänderungen dürfen nicht über den autonomen Gerüst-Runner gemergt werden.
8. **Produktion:** Nach der Veröffentlichung HTTP-, Inhalts-, Mobil- und Sicherheits-Smoketests; bei Fehlern neue Korrektur-PRs bzw. kontrollierter Revert. Keine direkten Änderungen an `main`.
9. **Eskalation:** Nur neue Produktentscheidungen, rechtliche/finanzielle Verpflichtungen, produktive Datenänderungen oder echte Berechtigungs- und Sicherheitsblockaden gehen an den Product Owner.

Eine ChatGPT-Projektanweisung allein aktiviert weder GitHub-Berechtigungen noch einen kontinuierlichen Agentenrunner.
