# Ausgelieferte Dateien prüfen

Vergleiche den normalen Einstieg und die darin verlinkten eigenen Skripte und Stylesheets mit einem Checkout des erwarteten Releases. Versionsparameter bleiben in den HTTP-Anfragen erhalten. Zusätzliche Dateien wie der Service Worker oder dynamisch geladene Module können als relative URLs mitgegeben werden.

```sh
node scripts/check-release-assets.mjs https://mikefaehch.github.io/web-kit/admin/ generator/admin 'wizard.js?v=20261107-collection'
node scripts/check-release-assets.mjs https://mikefaehch.github.io/Sommer2027/ ../Sommer2027 sw.js
```

Verwende für jede Prüfung den Checkout des jeweiligen Release-Commits. Ein abweichender Inhalt oder ein HTTP-Fehler setzt den Exit-Code auf 1. Der Check liest öffentliche Dateien aus Sicht des HTTP-Clients. Die zusätzliche Abnahme im Browser prüft das Verhalten eines bestehenden Profils mit seinem lokalen Cache.
