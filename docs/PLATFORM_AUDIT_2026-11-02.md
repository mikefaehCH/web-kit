# Plattform 3.0 – verifizierte Ausgangslage und Integrationsplan

**Stand:** 02.11.2026 · **Masterauftrag:** [web-kit #12](https://github.com/mikefaehCH/web-kit/issues/12).

Dieses Dokument trennt bestätigte Fakten, offene Abnahmen und technische Entscheidungen. Ein offener PR gehört **nicht** zu `main` und gilt nicht als produktiv.

## Ausgangsbestand

| Repository | Bestätigter Zustand auf `main` | GitHub-Grösse (KiB) |
| --- | --- | ---: |
| `web-kit` | Gerüst ohne integrierten Produktionsgenerator; App-CI noch unvollständig | 82 |
| `camino` | Statische PWA, Supabase Auth/Reisekasse, `npm run check` | 18'706 |
| `Sommer2027` | Statische Reisewebsite mit Supabase; `starter/` enthält Generatorprototyp | 2'879 |
| `zuerich` | Statischer spanischer Stadtführer mit Offline-PWA und Python-/Playwright-Tests | 6'394 |
| `Valencia` | Eigenständige Website, offener Qualitätsaudit-PR | 34 |
| `edinburgh` | Eigenständige Website, offenes Qualitätsaudit-Issue | 8 |

GitHub-Repositorygrössen sind **keine** Codezeilen. Das Inventarwerkzeug erhebt getrackte Dateien, Quelltext- und Asset-Grössen, Tests/Workflows und PR-Status direkt aus API-Metadaten. Es schätzt keine LOC und prüft keine Live-Datenbanken.

## Tatsächlich gemessene API-Baseline (02.11.2026, 07:59:36 UTC)

Die read-only GitHub-Actions-Ausführung [Platform inventory tests #41409829891](https://github.com/mikefaehCH/web-kit/actions/runs/41409829891) hat den Standardbranch jedes Repositories erfolgreich inventarisiert. Diese Werte **enthalten keine Dateien aus offenen PR-Branches**.

| Repository | Getrackte Dateien | Quelltextklassifikation* | Assets | Testdateien | Workflows | PRs total | PRs offen |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| web-kit | 26 | 19 | 0 | 6 | 3 | 10 | 7 |
| camino | 168 | 24 | 123 | 9 | 1 | 33 | 2 |
| Sommer2027 | 120 | 82 | 20 | 13 | 2 | 46 | 7 |
| zuerich | 61 | 13 | 40 | 2 | 1 | 5 | 2 |
| Valencia | 1 | 1 | 0 | 0 | 0 | 2 | 2 |
| edinburgh | 1 | 1 | 0 | 0 | 0 | 1 | 1 |
| **Total** | **377** | **140** | **183** | **30** | **7** | **97** | **21** |

*Quelltextklassifikation beruht auf Dateiendungen und zählt auch JSON, YAML und SVG. Testdateien/Workflows sind zusätzliche, überlappende Kategorien und dürfen nicht zu den 377 Dateien addiert werden. Dies ist ein **strukturelles Inventar**, keine Aussage über tatsächliche Codezeilen, Sicherheitsqualität, Testabdeckung oder Fertigstellungsgrad.

## Bereits laufende Arbeiten – nicht doppelt implementieren

- [Sommer2027 PR #47](https://github.com/mikefaehCH/Sommer2027/pull/47) enthält bereits `site.json` v2, Kategorie-Registry, Wizard, Generator, ZIP und Tests. Nur nach aktuellem HEAD-Review und regelkonformem Merge als kanonische Quelle nach `web-kit` integrieren. Details: [Issue #45](https://github.com/mikefaehCH/Sommer2027/issues/45).
- `web-kit` PR #7–#11: Release- und Security-/Admin-Origin-Arbeiten; bis zur unabhängigen Prüfung ungemergt.
- `camino` PR #40–#42: Push-Sicherheit, Releases und Dialog-Korrektur.
- `Sommer2027` PR #49–#51: Plan-/Datenbankkorrektur und Release-Automatisierung.
- `zuerich` PR #5 bereitet sichere Branch-/PR-Arbeit vor. Die ältere `CLAUDE.md` auf `main` enthält noch widersprechende Direkt-Main-Anweisungen.

## Zielarchitektur und Prioritäten

| Priorität | Massnahme | Nachweis |
| --- | --- | --- |
| P0 | Review-/Security-/RLS-/Release-Gates respektieren, offene Befunde beheben | CI und unabhängige Review am exakten HEAD |
| P1 | Messbare API-Baseline aller Repositories | Versionierte JSON-/Markdown-Inventare |
| P1 | Kanonischen Generator nach `web-kit` überführen | Wizard und CLI erzeugen deterministisch dieselbe Website aus `site.json` |
| P1 | AI-Agenten-Schnittstellen vereinheitlichen | Klare Projektregeln, maschinenlesbare Manifestdaten, Tests |
| P1 | Sicherer End-to-End-Release | Browser-/Security-Checks, Approval, Deployment-Smoke |
| P2 | Versionierte gemeinsame Module und Designsystem | Regressionsfreie Integration pro Projekt |
| P2 | Bestehende Websites kontrolliert migrieren | Kleine PRs mit Produktionstests, keine Änderungen an privaten Daten |

Monorepo nicht erzwingen. Keine duplizierte `site.json`-Wahrheit und keine gemeinsame Speicherung privater Projekte.

## Inventar ausführen

Benötigt Node 20+, keine zusätzlichen npm-Pakete:

```sh
node --test tests/inventory.test.mjs
node scripts/inventory.mjs reports/baseline.json reports/baseline.md
```

Optional `GITHUB_TOKEN` als sichere Umgebungsvariable für höhere GitHub-API-Ratenlimits setzen. Ohne Token sind nur öffentliche Daten abrufbar. Bestehende Report-Dateien werden nicht überschrieben. Trunkierte Git-Trees führen zu einem Fehler, nicht zu geschätzten Ergebnissen.

Die sechs Unit-Tests benutzen simulierte API-Antworten. Sie beweisen **nicht**, dass der Live-API-Zugriff, alle Sicherheitsregeln oder das Deployment funktionieren.

## Nächste ausführbare Arbeiten

1. Inventar-PR am konkreten HEAD und dessen GitHub-CI unabhängig prüfen; **kein Auto-Merge** für App-/Workflow-Code.
2. Einmal echten API-Inventarlauf durchführen und die Resultate mit Zeitpunkt dokumentieren.
3. PR #47 samt aktuellem Claude-Review und kompletter CI prüfen; nach sicherer Integration Generator versioniert nach `web-kit` bringen.
4. Referenz-Website ohne manuelles Vorlagen-Editieren generieren, E2E testen und sichere Veröffentlichung nachweisen.
