# Login und gemeinsame Planung – vorbereitete Module

Status: getestete Adapter mit Backend-Vertrag, **noch nicht in der Oberfläche aktiviert**.
Es wurden weder eine Datenbank noch OAuth-Provider eingerichtet. Keine bestehende
Sommer2027-/Camino-Instanz und keine Mitgliedschaft werden verändert.
Der lokale Reisebegleiter funktioniert weiterhin ohne Login.

## Module

| Datei | Aufgabe |
| --- | --- |
| `modules/project-auth.js` | PKCE-Client mit eigenem Sitzungsschlüssel, Google/Apple/Microsoft, E-Mail-Link, Projektmitgliedschaft, lokales Abmelden und Invalidierung |
| `modules/shared-plan.js` | Projektbezogenes Laden/Speichern, Nur-Lesen-/Bearbeiten-Rollen, Versionsvergleich und Konflikterkennung |

Die Projekt-UUID für den Backend-Zugriff ist **nicht** der Reise-Slug aus `trip.id`.
Beide Zuordnungen bleiben stabil. Die gemeinsame Payload enthält ausschliesslich
Planeinträge mit Orts-ID und Tag. Favoriten und lokale Backups werden nicht hochgeladen.

## Explizite Integration nach Backend-Abnahme

Das SDK wird injiziert. Kein neuer CDN-Eintrag und keine weitere SDK-Version sind nötig.
Das übergeordnete Projekt nutzt bereits Supabase JS **2.57.0** mit SRI-Prüfung.
Bei einer neuen Website das geprüfte SDK ausdrücklich einbinden und die CSP auf die
konkrete API-/SDK-Quelle begrenzen. Schlüssel dürfen nur `sb_publishable_...` sein.

```js
import { createProjectAuth } from './modules/project-auth.js';
import { createSharedPlan } from './modules/shared-plan.js';

// `settings` enthält öffentliche Konfiguration, keine Provider-Secrets.
const auth = createProjectAuth({
  ...settings, // url, publishableKey, projectId, siteUrl
  providers: ['google'], // erst nach Einrichtung und Prüfung freischalten
  clientFactory: window.supabase.createClient,
});
const shared = createSharedPlan({ auth, trip });
let loaded = null;
const stop = auth.onChange(() => {
  loaded = null;
  // Sofort auch angezeigte gemeinsame Daten und ungespeicherte Entwürfe entfernen.
  // Nur synchron invalidieren: keine Supabase-Aufrufe im SDK-Auth-Callback.
});

// Durch bewusste UI-Aktionen auslösen, mit sichtbarer Fehlerbehandlung:
// await auth.signIn('google');
// await auth.signIn('apple');
// await auth.signIn('azure'); // Adapter fordert den E-Mail-Scope an
// await auth.sendMagicLink(email);
// loaded = await shared.load();
// loaded = await shared.save(loaded, editedPlan);
// await auth.signOut();

// Beim Verlassen der Integration:
// stop(); auth.dispose();
```

`siteUrl` ist eine feste Basisadresse mit abschliessendem `/`, ohne Query, Fragment
oder Zugangsdaten. Im Browser muss sie dieselbe Origin haben. Der Callback ist
immer `index.html` innerhalb dieser Basisadresse und muss in Supabase freigegeben sein.
Kein frei übernommener `next`-/Redirect-Parameter.
Der PKCE-Client muss auch auf dieser Callback-Seite initialisiert werden.
E-Mail-Template und Bestätigungsablauf passend zu PKCE prüfen; ein Template mit
`token_hash` braucht zusätzlich eine geprüfte `verifyOtp`-Callback-Implementierung.
Für diese Variante enthält der Adapter noch keinen Token-Hash-Handler.

`INITIAL_SESSION`, wiederholtes `SIGNED_IN` und `TOKEN_REFRESHED` für dasselbe Konto
verwerfen keinen geladenen Entwurf. Konto-Wechsel, Abmelden und explizit gestartete
An-/Abmeldevorgänge invalidieren bisherige Zugriffe synchron.

Der Sitzungsschlüssel trennt Backend, Website-Basis und Projekt-UUID. Abmelden verwendet
`scope: local`; andere Geräte werden nicht global abgemeldet. Die Pfade auf GitHub Pages
teilen sich dennoch eine Browser-Origin. Ein eigener Domainname pro privater App ist die
stärkere Isolierung; Speicherpräfixe schützen nicht gegen Skripte derselben Origin.

Google, Apple und Microsoft sind Codeoptionen, keine bestätigten produktiven Logins.
`providers: []` aktiviert keinen OAuth-Provider. E-Mail wird nur durch einen expliziten
Aufruf angefordert, mit `shouldCreateUser: false` und neutraler Antwort auch bei
`otp_disabled` (unbekanntes Konto). Rate-Limit- und Netzwerkfehler bleiben Fehler.
Die direkt aufrufbare Auth-API kann Konten weiterhin unterscheidbar beantworten;
die neutrale Oberfläche ist kein serverseitiger Schutz vor Konto-Ermittlung.
Eingeladene Konten und deren Projektmitgliedschaft müssen separat provisioniert werden.
OAuth kann je nach Supabase-Einstellung Konten anlegen; daraus entsteht keine Projektfreigabe.

## Backend-Vertrag – vor Aktivierung umzusetzen und zu testen

Neue Tabellen, bewusst getrennt von bestehenden `family_*`- oder Camino-Tabellen:

| Tabelle | Benötigte Spalten | Datenbankregeln |
| --- | --- | --- |
| `travel_project_members` | `project_id uuid`, `user_id uuid`, `role` (`viewer` oder `editor`) | Zusammengesetzter Primärschlüssel; echte Projekt-/Auth-Referenzen; nur vertrauenswürdige Administration vergibt Mitgliedschaften |
| `travel_project_plans` | `project_id uuid`, `revision bigint`, `payload jsonb` | `project_id` als Primärschlüssel; ein Plan pro Projekt; Revision beginnt bei 1 und steigt genau um 1 |

Payload-Vertrag:

```json
{
  "version": 1,
  "tripId": "eindeutiger-reise-slug",
  "plan": [{ "placeId": "orts-id", "day": "2028-05-12" }]
}
```

Backend-Pflichten:

- RLS auf beiden exponierten Tabellen; `anon` erhält keinen Zugriff.
- Authentifizierte Benutzer lesen nur ihre eigene Mitgliedschaft im angefragten Projekt.
  Keine Schreib-, Lösch- oder Selbstfreischaltungsrechte auf Mitgliedschaften.
- Pläne dürfen nur aktuelle Mitglieder des jeweiligen Projekts lesen. Nur `editor` darf
  anlegen/ändern. Keine Client-Löschrechte. Anonyme Supabase-Konten ebenfalls ausschliessen.
- SELECT-Policy zusätzlich zu UPDATE; UPDATE braucht `USING` **und** `WITH CHECK`.
  Berechtigung über aktuelle Mitgliedschaften, nicht über editierbare `user_metadata`.
- API-GRANTs und RLS gemeinsam prüfen. RLS allein ersetzt keine Tabellenprivilegien.
- Unveränderliche Projekt-ID, sichere Revision (1 bis kleiner als JS-MAX_SAFE_INTEGER),
  initiale Revision 1 sowie genau ein Versionsschritt müssen serverseitig erzwungen werden.
- Payload-Grösse, Format, Reisezuordnung, erlaubte Orte und Tage serverseitig validieren.
  Der Client akzeptiert höchstens 5000 eindeutige Planeinträge. Clientprüfung ist kein Zugriffsschutz.
- INSERT verwendet kein Upsert. UPDATE filtert atomar nach Projekt-ID und geladener Revision.
  Eine betroffene Zeile wird via `.select(...).maybeSingle()` zurückgegeben.
- Keine Views/privilegierten öffentlichen Funktionen, die diese Regeln umgehen.

Dies ist ein Vertrag und keine ausgeführte Migration. Vor einer Umsetzung Schema und
Supabase-Advisors der gewählten Testinstanz prüfen, eine reguläre Migration erzeugen und
mit Testidentitäten testen. Keinen bestehenden Backend-Vertrag still umbiegen.

## Fehler und Verhalten der Oberfläche

| Fehlercode | Erwartetes Verhalten |
| --- | --- |
| `signed_out` | Login anbieten; keine gemeinsamen Daten zeigen |
| `forbidden` | Fehlende Freigabe erklären, keinen lokalen Plan hochladen |
| `auth_failed`, `membership_failed`, `load_failed` | Prüfung fehlgeschlagen anzeigen; keine alte Freigabe weiterverwenden |
| `session_changed`, `stale_session`, `disposed` | Gemeinsame Ansicht/Entwurf verwerfen und neu laden |
| `conflict` | Neueste Version laden und Unterschiede zeigen; kein automatisches Überschreiben |
| `save_failed` | Ergebnis kann unbekannt sein: neu laden und vergleichen; nicht automatisch wiederholen |
| `invalid_plan`, `invalid_response`, `invalid_revision` | Vorgang abbrechen, Konfiguration/Backend prüfen |

Ein Server kann einen Schreibvorgang bereits abgeschlossen haben, bevor die Antwort
verloren geht oder das Konto wechselt. Der Adapter bestätigt dann keinen Erfolg und
wiederholt die Mutation nicht. Die nächste Aktion muss den Serverstand laden.
Es gibt kein automatisches Zusammenführen, keine Offline-Schreibwarteschlange, keine
Live-Synchronisierung und keinen lokalen Cache privater Pläne. Öffentliche App-Dateien
dürfen offline sein; API-Antworten und Tokens gehören nicht in den Service-Worker-Cache.

## Prüfung und Aktivierungsgrenzen

- `npm test` in `starter/`: Adaptertests mit mehreren Projekten/Konten, Rollen,
  Entzug, Fehlern, Konto-/Projektwechsel, Importformaten und konkurrierenden Revisionen.
- Im übergeordneten Repository: `node tests/project-sdk.cjs` nach `npm run verify:sri`.
  Dieser Vertragstest nutzt das echte gepinnte SDK und ausschliesslich simulierte HTTP-Antworten.
- Bestehende Browsermatrix prüft weiterhin die lokale Vorlage und Sommer2027.
  Kein Test ruft produktive Auth-/Datenbank-Endpunkte auf oder versendet E-Mails.
- Die Tests beweisen **keine produktiven RLS-Regeln**. Vor Aktivierung mit mindestens
  Nichtmitglied, Viewer und Editor aus zwei Projekten erlaubte/verbotene Aktionen prüfen,
  einschliesslich direkt manipulierter API-Requests.
- Login/Callback/Logout und Konto-Wechsel auf Desktop, Safari, iPhone-PWA und Android
  prüfen; E-Mail-Links können auf einem anderen Browser/Gerät am PKCE-Verifier scheitern.

## Geprüfte Quellen (31.10.2026)

- [Changelog](https://supabase.com/changelog.md), insbesondere
  [TLS-Änderung](https://supabase.com/changelog/cbc-tls-ciphers-deprecated): keine Adapter-API-Änderung.
- [OAuth](https://supabase.com/docs/reference/javascript/auth-signinwithoauth),
  [E-Mail](https://supabase.com/docs/reference/javascript/auth-signinwithotp),
  [Passwortlose Anmeldung](https://supabase.com/docs/guides/auth/auth-email-passwordless),
  [verifizierter Benutzer](https://supabase.com/docs/reference/javascript/auth-getuser).
- [Microsoft](https://supabase.com/docs/guides/auth/social-sign-in/auth-azure),
  [Update mit Rückgabe](https://supabase.com/docs/reference/javascript/update).
