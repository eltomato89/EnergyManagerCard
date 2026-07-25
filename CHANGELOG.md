# Änderungsprotokoll

Dieses Projekt folgt [Semantic Versioning](https://semver.org/lang/de/).

## [0.1.0] — unveröffentlicht

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
