# Änderungsprotokoll

Dieses Projekt folgt [Semantic Versioning](https://semver.org/lang/de/).

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
