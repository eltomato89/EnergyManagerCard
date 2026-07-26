# Energy Manager Card

Lovelace-Karte für Home Assistant, die den aktuellen **PV-Überschuss** anzeigt und Verbraucher
**nach Priorität** auflistet. Auf einen Blick erkennbar: reicht der Überschuss für dieses Gerät?

Sie ist das Anzeigeteil der
**[Energy Manager Integration](https://github.com/eltomato89/EnergyManagerIntegration)**: Die
Integration rechnet den Überschuss, führt die Verbraucher und schaltet sie automatisch nach
Priorität — die Karte findet sie von selbst und zeigt sie an. **Verbraucher werden ausschließlich
in der Integration gepflegt.**

Ohne die Integration zeigt die Karte den Überschuss aus selbst konfigurierten Sensoren an, aber
keine Verbraucher: die legt man dort an. Bestehende `devices`-Listen aus älteren Fassungen werden
weiterhin dargestellt, lassen sich aber nur noch im YAML ändern.

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
   URL `/local/energy-manager-card.js?v=0.5.0`, Typ **JavaScript-Modul**

## Konfiguration

Alles, was die Karte selbst betrifft, lässt sich im grafischen Editor einstellen. Verbraucher
gehören nicht dazu — die kommen aus der Integration.

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
`use_integration: false` im YAML — die Karte rechnet dann wie unten beschrieben selbst. Bewusst
ohne Schalter im Editor: Das ist ein Rückfall, kein zweiter Betriebsmodus.

### Ohne Integration: Zählerquelle — zwei Varianten

**Ein bidirektionaler Netzsensor** (Standard):

```yaml
type: custom:energy-manager-card
grid_entity: sensor.netz_leistung # >0 Bezug, <0 Einspeisung
```

Liefert der Sensor umgekehrte Vorzeichen (positiv beim Einspeisen), `invert_grid: true` setzen.

**Getrennte Sensoren** für Erzeugung und Verbrauch:

```yaml
type: custom:energy-manager-card
meter_mode: split
production_entity: sensor.pv_erzeugung # stets positiv
consumption_entity: sensor.hausverbrauch # stets positiv
```

Beide Varianten liefern denselben Überschuss — die Formel ist gegen beide Wege geprüft.

### Vollständiges Beispiel

Siehe [`docs/examples.yaml`](docs/examples.yaml) und die Optionstabelle in
[`docs/configuration.md`](docs/configuration.md).

## Im Dashboard sortieren und die Automatik schalten

Mit der Integration funktioniert beides **ohne Zutun**: Sie legt je Verbraucher ein
`number.…_prioritaet` und ein `switch.…_automatik` an, und die Karte bedient sie.

- Ein Symbol im Kartenkopf schaltet den **Sortiermodus** ein. Erst dann erscheinen Griffe und
  Pfeiltasten — dauerhaft sichtbar würdest du auf dem Tablet beim Scrollen versehentlich
  Prioritäten verschieben. Beim Umsortieren schreibt die Karte die Ränge lückenlos als 1…n.
- Der **Schalter rechts steuert die Automatik**, nicht das Gerät. Ein farbiger Punkt am Symbol
  zeigt, ob das Gerät gerade läuft; schalten kannst du es über den Detail-Dialog (Klick auf Name
  oder Symbol). Wer das nicht will, stellt `switch_action: device` ein.
- Der **Hauptschalter** im Kartenkopf hält die gesamte Automatik an.

Der Grund, warum es dafür Entitäten braucht, ist technisch: **eine Lovelace-Karte kann ihre eigene
Konfiguration zur Laufzeit nicht speichern.** Eine im Dashboard geänderte Reihenfolge wäre sonst
nach dem Neuladen wieder weg.

<details>
<summary>Ohne Integration — nur noch über YAML</summary>

Vor der Integration liefen Priorität und Automatik-Teilnahme über je einen Helfer pro Verbraucher.
Das ist weiterhin möglich, aber **nicht mehr im Editor konfigurierbar**: Genau diese Helfer waren
der Anlass, die Integration zu bauen — zwei echte HA-Helfer je Verbraucher, die sich in der Instanz
ansammeln.

```yaml
devices:
  - switch_entity: switch.wallbox
    power_entity: sensor.wallbox_leistung
    priority_entity: input_number.prio_wallbox # oder eine number-Entität
    auto_entity: input_boolean.auto_wallbox # oder ein switch
    max_power: 11000
```

Es gilt: entweder **alle** Verbraucher haben einen Prioritäts-Helfer oder keiner. Gemischt entsteht
eine Reihenfolge aus Helferwerten _und_ Listenpositionen, die kaum vorhersagbar ist.

</details>

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

**Wichtig:** Durchgesetzt werden diese Zeiten von der Integration. Mit ihr sind die vier Felder Teil
der Verbraucher-Konfiguration in der Integration, und der Countdown in der Karte zeigt deren exakten
Zeitstempel.

Ohne Integration stehen sie in `devices[]`, werden aber von niemandem durchgesetzt — die Karte
schätzt den Countdown dann aus `last_changed` der Schalt-Entität. Das ist ein **Hinweis**, keine
Sperre: ein manueller Klick geht immer durch.

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
