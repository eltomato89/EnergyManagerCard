# Energy Manager Card

Lovelace-Karte für Home Assistant, die den aktuellen **PV-Überschuss** anzeigt und Verbraucher
**nach Priorität** auflistet. Auf einen Blick erkennbar: reicht der Überschuss für dieses Gerät?

Die Karte schaltet **nichts automatisch**. Sie zeigt an und lässt manuell schalten. Die Reihenfolge
der Verbraucher im Editor ist die **Priorität**, die eine später folgende Integration für die
automatische Überschusssteuerung übernimmt.

![Die Karte im hellen und im dunklen Theme](docs/images/preview.png)

<sub>Gezeigt: 2,4 kW Einspeisung plus 600 W Batterieladung ergeben 3,0 kW verfügbaren Überschuss.
Die Wallbox braucht mindestens 4,2 kW und bleibt grau, der Heizstab läuft und ist gedeckt, die
Waschmaschine wäre bereit — steht aber noch unter Mindest-Aus-Zeit.</sub>

<sub>Hinweis: Das Bild entstand in einer Testumgebung. Die Karte selbst ist das ausgelieferte
Bundle; die sie umgebenden Home-Assistant-Elemente (Kartenrahmen, Schalter, Zustandssymbole) sind
für die Aufnahme nachgebildet und sehen in einer echten Installation minimal anders aus.</sub>

## Installation

### HACS (empfohlen)

1. HACS → Dashboard → Menü ⋮ → **Benutzerdefinierte Repositories**
2. Repository-URL eintragen, Kategorie **Dashboard**
3. „Energy Manager Card" installieren
4. Browser-Cache leeren (Strg+F5)

### Manuell

1. `energy-manager-card.js` aus dem [neuesten Release](../../releases/latest) nach `/config/www/`
2. Einstellungen → Dashboards → ⋮ → Ressourcen → Hinzufügen:
   URL `/local/energy-manager-card.js?v=0.1.0`, Typ **JavaScript-Modul**

## Konfiguration

Die Karte ist vollständig über den grafischen Editor konfigurierbar; YAML ist nirgends nötig.

### Zählerquelle — zwei Varianten

**Ein bidirektionaler Netzsensor** (Standard):

```yaml
type: custom:energy-manager-card
grid_entity: sensor.netz_leistung # >0 Bezug, <0 Einspeisung
devices: []
```

Liefert der Sensor umgekehrte Vorzeichen (positiv beim Einspeisen), `invert_grid: true` setzen.

**Getrennte Sensoren** für Erzeugung und Verbrauch:

```yaml
type: custom:energy-manager-card
meter_mode: split
production_entity: sensor.pv_erzeugung # stets positiv
consumption_entity: sensor.hausverbrauch # stets positiv
devices: []
```

Beide Varianten liefern denselben Überschuss — die Formel ist gegen beide Wege geprüft.

### Vollständiges Beispiel

Siehe [`docs/examples.yaml`](docs/examples.yaml) und die Optionstabelle in
[`docs/configuration.md`](docs/configuration.md).

## Die vier Zeitfelder pro Verbraucher

Sie sind der häufigste Stolperstein, weil sie sich ähnlich anhören. Sie greifen an
unterschiedlichen Stellen und ersetzen einander **nicht**:

| Feld             | Wirkt                    | Schützt vor                                        |
| ---------------- | ------------------------ | -------------------------------------------------- |
| `turn_on_delay`  | **vor** dem Einschalten  | Einschalten bei einer kurzen Sonnenlücke           |
| `turn_off_delay` | **vor** dem Ausschalten  | Abschalten wegen einer vorbeiziehenden Wolke       |
| `min_runtime`    | **nach** dem Einschalten | zu kurzen Laufzeiten (Waschgang, Wärmepumpen-Takt) |
| `min_off_time`   | **nach** dem Ausschalten | zu frühem Wiederanlauf (Kompressor-Druckausgleich) |

Ein Kompressor braucht typischerweise `min_off_time: 600`, eine Wallbox eher `turn_on_delay: 120`
zusammen mit `min_runtime: 900`.

**Wichtig:** Durchgesetzt werden diese Zeiten erst von der Integration. Die Karte zeigt für
`min_runtime` und `min_off_time` einen Countdown an (berechnet aus `last_changed` der
Schalt-Entität) — ein **Hinweis**, keine Sperre. Ein manueller Klick geht immer durch.

## Hausbatterie

Optional. Ist eine Batterie konfiguriert, wird ihre Ladeleistung als _umlenkbare_ Leistung zum
Überschuss gezählt: Was gerade in die Batterie fließt, könnte stattdessen ein Verbraucher bekommen.
Entladung wird entsprechend abgezogen, weil sie die Hauslast bereits stützt.

- `battery_min_soc` — darunter hat das Laden Vorrang, es wird kein Überschuss mehr ausgewiesen
- `battery_reserve_w` — Leistung, die immer der Batterie vorbehalten bleibt

Fällt der Batteriesensor aus, rechnet die Karte ohne ihn weiter, markiert den Wert aber sichtbar
als unsicher, statt ein falsches Ergebnis als gesichert auszugeben.

## Glättung

`smoothing_window` (Standard 60 s) mittelt den Überschuss **zeitgewichtet**: jeder Messwert gilt so
lange, bis der nächste eintrifft. Ein Sensor, der 55 s auf 3000 W und 5 s auf 0 W steht, ergibt
2750 W — nicht 1500 W wie beim einfachen Mittelwert. `0` schaltet die Glättung ab.

## Ampel-Logik

Der Überschuss wird in Prioritätsreihenfolge als Budget verteilt. Bei 2000 W Überschuss und fünf
Geräten à 1500 W steht genau **eines** auf grün — nicht alle fünf.

| Anzeige         | Bedeutung                                   |
| --------------- | ------------------------------------------- |
| grün, kräftig   | läuft, vom Überschuss gedeckt               |
| orange, kräftig | läuft, zieht aber Netzstrom                 |
| grün, blass     | aus, der Überschuss würde reichen           |
| orange, blass   | aus, fast ausreichend (ab 80 % des Bedarfs) |
| grau            | aus, reicht nicht                           |

## Häufige Fehler

**„Ein Sensor misst keine Leistung"** — es ist ein kWh-Zähler statt eines W-Sensors konfiguriert.
Ein Energiezähler liefert eine Menge, keinen Momentanwert. Die Karte zeigt in dem Fall bewusst
keinen Wert an, statt still 0 W anzunehmen.

**Überschuss hat das falsche Vorzeichen** — `invert_grid` umschalten. Prüfen bei Sonnenschein:
Bei Einspeisung muss die Zahl positiv sein.

**Karte lädt nach dem Update nicht** — HA cacht die Ressource aggressiv. Cache leeren, bei
manueller Installation `?v=<version>` in der Ressourcen-URL hochzählen.

## Entwicklung

```bash
npm install
npm run check      # format + lint + typecheck + test
npm run build      # -> dist/energy-manager-card.js (eine Datei)
npm run dev        # Watch-Build
npm run serve      # Dev-Server auf :4000, als HA-Ressource eintragbar
```

Getestet wird der Rechenkern (`src/lib/`) mit Vitest — Einheiten, Vorzeichen, Batteriekorrektur,
Zeitgewichtung, Budget-Kaskade und Sperrzeiten. Dort sitzen die Fehler, die man in einer laufenden
Anlage nur schwer nachstellt.

## Lizenz

MIT
