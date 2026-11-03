# Veröffentlichung des web-kit-Wizards

Der Workflow `.github/workflows/publish-generator-pages.yml` prüft den Generator in Pull Requests und veröffentlicht nach einem Merge ausschliesslich den Inhalt von `generator/` auf GitHub Pages.

Sobald Pages für dieses Repository auf **GitHub Actions** als Quelle eingestellt ist, lautet der Wizard-Pfad:

`https://mikefaehch.github.io/web-kit/admin/`

Die Seite erstellt `site.json` und ZIP lokal im Browser. Sie lädt keine eingegebenen Inhalte automatisch hoch. Der Link «GitHub-Issue vorbereiten» öffnet ein öffentliches Issue-Formular. Der Nutzer muss die bereinigte Konfiguration bewusst einfügen und das Issue selbst absenden. Private Angaben dürfen nicht in ein öffentliches Issue.

## Plattformvoraussetzung

Vor dem ersten produktiven Pages-Lauf unter **Repository → Settings → Pages → Build and deployment → Source** die Option **GitHub Actions** wählen. Der Workflow verwendet keinen PAT und keine Secrets. Der Action-Token kann Pages nicht selbst aktivieren; GitHub verlangt dafür einen nicht standardmässigen Token mit entsprechenden Verwaltungsrechten.

Bis das Deployment auf dem Merge-Commit erfolgreich war und die URL per HTTPS-Smoke erreichbar ist, gilt der Wizard als **nicht veröffentlicht**.

## Workflow-Grenzen

- Pull Requests führen Tests und Artifact-Build aus, aber kein Deployment.
- Nur ein Push auf `main` deployt.
- Deployment-Berechtigungen `pages: write` und `id-token: write` sind auf den Deploy-Job begrenzt.
- Checkout, Node-Setup sowie Pages-Actions sind auf überprüfte Commit-SHAs gepinnt.
- Der Workflow veröffentlicht keine Dateien ausserhalb von `generator/`.
- Es gibt keine WhatsApp-, Supabase- oder sonstigen kostenpflichtigen API-Aufrufe.
