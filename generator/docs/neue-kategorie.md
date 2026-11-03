# Kategorien und Inhalte

`site.json` Version 2 ist die einzige Ausgabe von Wizard und Generator:

```json
{
  "version": 2,
  "category": "general",
  "preset": "info-page",
  "id": "meine-infoseite",
  "title": "Meine Infoseite",
  "description": "Eigene Beschreibung",
  "color": "#965a3e",
  "locale": "de-CH",
  "modules": { "places": false, "map": false, "favorites": false, "planning": false, "offline": true },
  "content": { "sections": [] }
}
```

Reise: `category: travel`, `preset: city|walking`, `content: {start, end, places}`.
Ein Ort enthält `id`, `name`, `category`, `description`, `coordinates: [Breite, Länge]`.
Keine Termine, Orte, Koordinaten oder Texte werden erfunden. General benötigt keine
Reisedaten. Reiseplan, Karte und Favoriten sind ausschliesslich im Reisevertrag aktiv.

Version-1-Exporte mit `category: city|walking` werden beim Dateiimport und im CLI
explizit nach Version 2 normalisiert: Kategorie `travel`, entsprechende Vorlage,
vorhandener Zeitraum unter `content`, leere Ortsliste, bisheriges Datumsformat de-CH.
Fehlende Termine bleiben Fehler. Der Wizard zeigt die Migration an; die Quelldatei
wird nicht überschrieben. Version 2 lehnt alte flache Reise-Felder und unbekannte
Felder ab. Ein erneuter Export enthält ausschliesslich das kanonische Modell.

## Neue Kategorie aus vorhandenen Bausteinen

1. Ordner `categories/<id>/` und `category.json` anlegen; ID aus kleinen Buchstaben,
   Ziffern und Bindestrichen.
2. `id`, `label`, `contract`, `presets` (ID/Label) und erlaubte `modules` definieren.
3. ID in `categories/index.json` registrieren. GitHub Pages erlaubt keine automatische
   Verzeichnisauflistung; diese Datei ist das statische Verzeichnis.
4. `contract: sections` verwendet Überschriften/Textabschnitte und optional Offline.
   `contract: dated-places` verwendet Zeitraum/Orte mit Reiseplan/Karte/Favoriten/Offline.
   Neue Vorlagen-IDs dürfen Bindestriche enthalten. Kein Renderer- oder Wizard-Code muss
   für eine neue Kategorie auf einem dieser Verträge geändert werden.
5. Schema-/Generator-/ZIP- und sechsfache Browserprüfungen ausführen. Kategorie und
   Vorlagen erscheinen aus den Metadaten im Wizard und werden im ZIP mitgeliefert.

Ein neuer Fachbaustein benötigt einen eigenen validierten Inhaltsvertrag und Renderer.
Unbekannte Verträge werden abgelehnt. Es gibt keinen beliebigen Code-/HTML-Upload.
Die Reiseansicht liegt einmalig in `modules/travel-view.js`; Demo und generierte Seiten
verwenden denselben Code. Beide Vertragstemplates bleiben für spätere Kategorie-Wechsel
im generierten Projekt erhalten. Deaktivierte Kategorie-Inhalte werden im Wizard als
lokaler Entwurf behalten, aber nicht in die andere Kategorie exportiert.

## Grenzen

Die Bedienoberfläche ist weiterhin auf Deutsch. `locale` setzt HTML-Sprache und
Datumsformat; es übersetzt keine vom Benutzer erfassten Inhalte und ersetzt noch keine
vollständigen i18n-Kataloge. Info-Seiten sind derzeit die einzige allgemeine Vorlage;
Wunschliste und Event sind noch nicht implementiert. Cloud-Funktionen, Einladungen,
GitHub-Anmeldung, automatische Repository-/Pages-Erstellung und Update-PRs bleiben offen.
Alle erfassten Inhalte landen in öffentlichen Website-Dateien. Private Buchungs- oder
Finanzdaten gehören nicht in den Export.
