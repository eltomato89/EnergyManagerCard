# Energy Manager Card

Lovelace-Karte für Home Assistant, die den aktuellen **PV-Überschuss** anzeigt und Verbraucher
**nach Priorität** auflistet. Auf einen Blick erkennbar: reicht der Überschuss für dieses Gerät?

Es gibt zwei Betriebsarten:

- **Mit der [Energy Manager Integration](https://github.com/eltomato89/EnergyManagerIntegration)**
  (empfohlen): Die Integration rechnet den Überschuss, kennt die Verbraucher und schaltet sie
  automatisch nach Priorität. Die Karte findet sie von selbst und zeigt sie an —
  **Verbraucher werden dann ausschließlich in der Integration gepflegt**, nicht im Kartenkonfigurator.
- **Ohne Integration**: Die Karte rechnet selbst aus den konfigurierten Sensoren und zeigt an.
  Sie schaltet dann nichts automatisch; die Reihenfolge im Editor ist die Priorität, geschaltet wird
  von Hand.

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
   URL `/local/energy-manager-card.js?v=0.3.0`, Typ **JavaScript-Modul**

## Konfiguration

Die Karte ist vollständig über den grafischen Editor konfigurierbar; YAML ist nirgends nötig.

### Mit Integration: nichts zu konfigurieren

Ist die Energy Manager Integration installiert, genügt:

```yaml
type: custom:energy-manager-card
```

Zählersensoren, Batterie, Glättung und die Verbraucherliste kommen aus der Integration; der Editor
blendet diese Felder aus und verweist dorthin. Gepflegt wird unter **Einstellungen → Geräte &
Dienste → Energy Manager → Verbraucher hinzufügen**. Damit gibt es genau eine Stelle für jede
Angabe — dieselbe Liste an zwei Orten zu führen, ginge unweigerlich auseinander.

Der Kartenkopf bekommt zusätzlich den **Hauptschalter der Automatik**. Ist er aus, wird nichts
geschaltet.

Wer die Integration installiert hat, sie für eine bestimmte Karte aber nicht nutzen will, setzt
`use_integration: false` — die Karte rechnet dann wie unten beschrieben selbst.

### Ohne Integration: Zählerquelle — zwei Varianten

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

## Im Dashboard sortieren und die Automatik schalten

**Mit Integration funktioniert das ohne Zutun** — sie legt je Verbraucher ein
`number.…_prioritaet` und ein `switch.…_automatik` an, und die Karte bedient beide. Der Rest dieses
Abschnitts beschreibt, wie man dasselbe ohne Integration erreicht.

Standardmäßig ist die Reihenfolge im `devices`-Array die Priorität, änderbar nur im Editor. Der
Grund ist technisch: **eine Lovelace-Karte kann ihre eigene Konfiguration zur Laufzeit nicht
speichern.** Wer ohne Integration direkt im Dashboard sortieren will, braucht deshalb einen
Speicherort außerhalb der Karte — zwei Helfer pro Verbraucher:

| Helfer            | Typ             | Wofür                                                                        |
| ----------------- | --------------- | ---------------------------------------------------------------------------- |
| `priority_entity` | `input_number`  | Rang (1 = höchste). Ist er gesetzt, **schlägt sein Wert die Array-Position** |
| `auto_entity`     | `input_boolean` | Nimmt der Verbraucher an der Automatik teil?                                 |

Sind sie konfiguriert, ändert sich die Bedienung der Karte:

- Ein Symbol im Kartenkopf schaltet den **Sortiermodus** ein. Erst dann erscheinen Griffe und
  Pfeiltasten — dauerhaft sichtbar würdest du auf dem Tablet beim Scrollen versehentlich
  Prioritäten verschieben. Beim Umsortieren schreibt die Karte die Ränge lückenlos als 1…n.
- Der **Schalter rechts steuert die Automatik**, nicht mehr das Gerät. Ein farbiger Punkt am Symbol
  zeigt, ob das Gerät gerade läuft; schalten kannst du es weiterhin über den Detail-Dialog (Klick
  auf Name oder Symbol). Wer das nicht will, stellt `switch_action: device` ein.

Zwei Regeln, die der Editor auch als Warnung anzeigt:

- **Entweder alle Verbraucher haben einen Prioritäts-Helfer oder keiner.** Gemischt entsteht eine
  Reihenfolge aus Helferwerten _und_ Listenpositionen, die kaum vorhersagbar ist.
- **Sortieren im Dashboard braucht vollständige Helfer** — sonst wäre die neue Reihenfolge nach
  dem Neuladen teilweise wieder weg.

Beispiel:

```yaml
devices:
  - switch_entity: switch.wallbox
    power_entity: sensor.wallbox_leistung
    priority_entity: input_number.prio_wallbox
    auto_entity: input_boolean.auto_wallbox
    max_power: 11000
```

Die Helfer legst du unter **Einstellungen → Geräte & Dienste → Helfer** an (`input_number` mit
Minimum 1, Maximum = Anzahl der Verbraucher, Schrittweite 1) und trägst sie im Verbraucher-Detail
ein. Das sind zwei echte Helfer je Verbraucher, die sich in der Instanz ansammeln — der Grund,
warum die Integration diese Zustände stattdessen als eigene Entitäten führt.

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

Optional. Ladeleistung zählt immer als _umlenkbare_ Leistung zum Überschuss: Was gerade in die
Batterie fließt, könnte stattdessen ein Verbraucher bekommen.

Wie eine **Entladung** behandelt wird, steuert `battery_mode`:

| Modus                    | Formel                     | Bedeutung                                                                                          |
| ------------------------ | -------------------------- | -------------------------------------------------------------------------------------------------- |
| `charge_only` (Standard) | `−Netz + max(Batterie, 0)` | „Wie viel kann ich zuschalten, ohne ans Netz zu gehen?" Die Batterie darf mitarbeiten.             |
| `full`                   | `−Netz + Batterie`         | „Wie viel liefert die PV über die Hauslast hinaus?" Gespeicherte Energie gilt als nicht verfügbar. |

Der Unterschied ist erheblich. Beispiel: 463 W PV, 842 W Hausverbrauch, Batterie entlädt mit 386 W,
7 W kommen aus dem Netz.

- `charge_only` → **7 W Defizit** — das Haus läuft praktisch autark, die Batterie trägt die Lücke
- `full` → **393 W Defizit** — so viel fehlt der PV zur Hauslast

`charge_only` ist Standard, weil `full` bei entladender Batterie ein Defizit meldet, das dem
Zählerstand deutlich widerspricht. Wer die Batterie für den Abend reservieren will, nimmt `full`.

Weitere Optionen:

- `battery_min_soc` — darunter hat das Laden Vorrang, es wird kein Überschuss mehr ausgewiesen
- `battery_reserve_w` — Leistung, die immer der Batterie vorbehalten bleibt

Unter dem großen Wert zeigt die Karte zusätzlich die **tatsächlichen Zählerwerte**
(„Netz 7 W Bezug · Batterie 386 W entladen"), damit berechneter Überschuss und realer Netzfluss
nicht verwechselt werden.

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
