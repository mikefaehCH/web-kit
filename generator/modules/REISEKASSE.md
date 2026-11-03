# Reisekasse: Rechenbasis

`reisekasse.js` enthält die aus Camino übernommene, isolierte Rechenlogik für Aufteilung und Ausgleich. Die Funktionen nehmen Teilnehmer und Buchungen als Argumente entgegen und speichern oder übertragen nichts. Die zugehörigen Tests verwenden ausschliesslich synthetische Daten.

Dieses Modul ist keine vollständige Reisekasse und bietet weder Oberfläche noch Zugriffsschutz oder Synchronisierung. Vor einer produktiven Integration sind ein privates, eigentümergeprüftes Datenmodell, isolierte Autorisierungstests und eine bewusste Aktivierung erforderlich. Keine bestehende Kasse wird automatisch importiert oder verändert.

Quelle: `mikefaehCH/camino` `js/ledger.js`, Stand `f23f9d337d9a66c1531f4364980247e412994a43`; öffentliche API unter `globalThis.WebKitLedger`.
