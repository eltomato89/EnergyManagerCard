# Änderungsprotokoll

Dieses Projekt folgt [Semantic Versioning](https://semver.org/lang/de/).

## [0.3.0] — unveröffentlicht

Bedienen direkt im Dashboard, ohne den Bearbeitungsmodus.

### Neu

- **Sortieren im Dashboard.** Ein Symbol im Kartenkopf schaltet einen Sortiermodus ein; erst dann
  erscheinen Griffe und Pfeiltasten. Bewusst ein Modus und kein Dauerzustand — sonst verschiebt man
  auf dem Tablet beim Scrollen versehentlich Prioritäten.
- **Der Schalter steuert die Automatik** statt das Gerät, sobald ein `auto_entity` konfiguriert ist
  (`switch_action`). Ein farbiger Punkt am Symbol zeigt weiterhin, ob das Gerät läuft; schalten
  lässt es sich über den Detail-Dialog.
- Zwei neue Felder je Verbraucher: `priority_entity` (`input_number`) und `auto_entity`
  (`input_boolean`). **Ist ein Prioritäts-Helfer gesetzt, schlägt sein Wert die Array-Position.**
- Knopf im Editor, der die fehlenden Helfer per WebSocket anlegt und einträgt — von Hand wären das
  zwei je Verbraucher, samt passender Grenzen.
- Warnungen bei gemischter Ausstattung (nur manche Verbraucher mit Prioritäts-Helfer) und bei
  eingeschaltetem Sortieren ohne vollständige Helfer.

### Hintergrund

Eine Lovelace-Karte kann ihre eigene Konfiguration zur Laufzeit **nicht** speichern — im Dashboard
ist sie schreibgeschützt. Reihenfolge und Automatik-Status brauchen deshalb einen Speicherort
außerhalb der Karte. Helfer-Entitäten sind zugleich das, was die spätere Integration ausliest.

## [0.2.0] — unveröffentlicht

### Geändert — betrifft bestehende Konfigurationen

- **Batterieentladung verringert den Überschuss nicht mehr** (neue Option `battery_mode`, Standard
  `charge_only`). Bisher meldete die Karte bei entladender Batterie ein Defizit in Höhe der
  Entladeleistung, obwohl der Zähler nahezu Null zeigte — bei 7 W Netzbezug und 386 W Entladung
  standen dort 390 W. Ladeleistung zählt unverändert als verfügbar. Das alte Verhalten (reiner
  PV-Überschuss) gibt es weiterhin mit `battery_mode: full`.
- **Ein negativer Wert heißt jetzt „Defizit" statt „Netzbezug".** Die alte Beschriftung behauptete
  einen Netzbezug, den es so nicht gab — die Batterie kann den größten Teil davon stützen.
- Die widersprüchliche Legende „frei −390 W" entfällt bei negativem Überschuss.

### Neu

- Zeile mit den tatsächlichen Zählerwerten unter dem Überschuss
  („Netz 7 W Bezug · Batterie 386 W entladen"), damit berechneter Überschuss und realer Netzfluss
  nicht verwechselt werden.

### Behoben

- Die Sperrzeit steht in einer eigenen Zeile; vorher blieb beim Umbruch ein Trennpunkt am
  Zeilenende hängen.

## [0.1.0] — 2026-07-25

Erste Fassung. Anzeigen und manuelles Schalten; die Automatik folgt in einer eigenen Integration.

### Neu

- Überschussanzeige mit zweigeteilter Leiste (belegt / frei) und Negativbereich bei Netzbezug
- Zwei Zählervarianten: bidirektionaler Netzsensor oder getrennte Sensoren für Erzeugung und
  Verbrauch, mit umkehrbarem Vorzeichen
- Optionale Hausbatterie mit Ladestand, Lade-/Entladekorrektur, Mindestladestand und Reserve
- Zeitgewichtete Glättung des Überschusses gegen Wolkenflackern
- Verbraucherliste mit Ampel, deren Budget kaskadierend nach Priorität verteilt wird
- Priorisierung per Drag & Drop im Editor, mit Pfeil-Buttons als Tastatur- und Touch-Pfad
- Vier Zeitfelder je Verbraucher (`turn_on_delay`, `turn_off_delay`, `min_runtime`, `min_off_time`)
  für die spätere Automatik; die Karte zeigt für die beiden letzteren einen Countdown
- Manuelles Schalten über `homeassistant.turn_on/off` mit optimistischer Anzeige und optionaler
  Rückfrage
- Grafischer Editor, Lokalisierung Deutsch und Englisch
- Klartextmeldung statt stiller 0 W, wenn ein Sensor keine Leistung misst (etwa ein kWh-Zähler)
