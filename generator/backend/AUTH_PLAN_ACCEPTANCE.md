# Isolierte Abnahme: Login und gemeinsame Planung

Stand: 2026-11-01. Grundlage: Issue #38 und `starter/CLOUD_MODULES.md`.
Dieses Dokument ist ein **Testplan**, kein Nachweis ausgeführter Live-Tests.

## Sicherheitsgrenze

- Ausschliesslich ein ausdrücklich als Testinstanz ausgewiesenes Supabase-Projekt verwenden.
- Vorhandene Sommer2027- und Camino-Projekte nicht als Testinstanz verwenden.
- Keine produktiven Migrationen, Provideraktivierungen, Einladungen oder E-Mails auslösen.
- Ausschliesslich synthetische Projekte, Orts-IDs, Benutzer und Pläne einsetzen.
- Nur öffentliche Schlüssel im Browser; Service-Role-Keys und Zugangsdaten nie ins Repository.
- Vor Migration den aktuellen Schema- und Advisor-Stand der Testinstanz sichern.
- Bei unklarer Testinstanz stoppen und mit unabhängigen lokalen Tests fortfahren.

## Testmatrix (über echte Auth-/PostgREST-Endpunkte)

| Identität | Mitgliedschaft | Projekte lesen | Plan lesen | Plan anlegen/ändern | Mitglieder ändern |
| --- | --- | --- | --- | --- | --- |
| Ohne Token | keine | verweigert | verweigert | verweigert | verweigert |
| Anonymer Auth-Benutzer | keine | verweigert | verweigert | verweigert | verweigert |
| Fremdes Konto | keine | verweigert | verweigert | verweigert | verweigert |
| Viewer A | A: viewer | nur A | nur A | verweigert | verweigert |
| Editor A | A: editor | nur A | nur A | nur A | verweigert |
| Editor B | B: editor | nur B | nur B | nur B | verweigert |
| Vertrauenswürdige Administration | gesondert | gemäss Admin-Konzept | gemäss Admin-Konzept | gemäss Admin-Konzept | nur gesondert autorisiert |

Bei jeder Zeile auch **direkte manipulierte API-Requests** prüfen, nicht nur ausgeblendete UI-Aktionen.

## Konkrete Negativfälle

1. Viewer versucht INSERT, UPDATE, DELETE und TRUNCATE.
2. Editor A liest oder schreibt Projekt B mit manipulierter `project_id`.
3. Editor A versucht sich selbst als Mitglied/Admin einzutragen oder die eigene Rolle zu ändern.
4. Anonymer Auth-Benutzer versucht eine fremde Mitgliedschaft zu lesen.
5. Editor sendet unbekannte Orts-ID, Datum ausserhalb der Reise, doppelte Einträge, mehr als 5000 Einträge und Payload über 1'000'000 Byte (`octet_length(payload::text)`).
6. Editor versucht `project_id` eines bestehenden Plans zu ändern.
7. Zwei Editoren laden Revision N; der zweite Schreibversuch mit N nach erfolgreichem N→N+1 muss scheitern.
8. Bei verlorenem Schreib-Response: Serverstand neu laden, niemals automatisch erneut schreiben.
9. Nach Mitgliedschaftsentzug und Kontowechsel: vorhandene Snapshots/Entwürfe verwerfen; erneute API-Zugriffe verweigern.
10. Offline: kein privater Plan und keine Tokens in Service-Worker-Caches, Cache Storage oder exportierten öffentlichen Dateien.

## Browser- und Geräteabnahme

- Chromium und WebKit: Desktop, 375 px, 390 px, 430 px und iPhone-SE-Profil.
- Login/Logout, Provider-Callback, PKCE und Konto-/Projektwechsel.
- Safari auf physischem iPhone und installierte PWA **separat manuell** prüfen.
- Kein Provider gilt allein wegen Adapter-Unit-Tests als produktiv abgenommen.
- Bei E-Mail-Link den Wechsel zwischen Browsern/Geräten und fehlenden PKCE-Verifier prüfen.
- Netzwerkfehler, abgelaufene Sitzung, Rollenentzug, Versionskonflikt und Offline-Übergang sichtbar und ohne Datenverlust behandeln.

## Automatisierte Vorprüfungen

Vom Repository-Root aus:

```sh
npm ci
npm run format:check
npm run check
npm run verify:sri
npm test
```

Danach die vollständige sechs-Job-Matrix in GitHub Actions auf dem konkreten PR-HEAD prüfen.
Die vorhandenen PGlite-/SDK-Mocktests ersetzen keine echte PostgREST-/Auth-/RLS-Abnahme.

## Freigabeprotokoll

Für jede ausgeführte Prüfung festhalten: Datum, isolierte Testprojekt-ID (keine Credentials), Git-Commit, Migration-Checksumme, Testidentität/Rolle, Request-Typ, erwartetes Resultat, tatsächliches Resultat, Beleg und Befund.

**Aktueller Status:** Die oben beschriebenen Live- und Gerätetests sind offen. Produktive Migration und Provideraktivierung benötigen eine gesonderte ausdrückliche Freigabe.

## Exakte Payload-Grenzen

Für jeden Fall einen ansonsten gültigen Payload mit erlaubten Orten, Tagen und
Feldnamen verwenden; die Bytezahl des von PostgreSQL serialisierten `payload::text`
messen (nicht die UTF-8-Grösse des HTTP-Requests und nicht 1 MiB).

| `octet_length(payload::text)` | Erwartung am Grössenlimit |
| --- | --- |
| 999'999 Byte | erlaubt, wenn alle weiteren Regeln erfüllt sind |
| 1'000'000 Byte | erlaubt, wenn alle weiteren Regeln erfüllt sind |
| 1'000'001 Byte | abgelehnt, keine Änderung am gespeicherten Plan |

Ein zusätzliches unbekanntes JSON-Feld ist keine gültige Grössenprobe: Es scheitert
bereits am Payload-Vertrag. Ebenso 5000 ansonsten gültige Einträge als erlaubte
Grenze und 5001 als Ablehnung prüfen. Diese Matrix ist weiterhin ein Testplan,
kein Nachweis einer durchgeführten gehosteten Abnahme.
