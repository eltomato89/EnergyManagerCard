# Konfiguration

Alle Optionen lassen sich im grafischen Editor setzen. Diese Tabelle ist die Referenz für alle,
die YAML bevorzugen — und die Grundlage für die spätere Integration.

## Karte

| Option             | Typ      | Standard         | Bedeutung                                                                                                  |
| ------------------ | -------- | ---------------- | ---------------------------------------------------------------------------------------------------------- |
| `type`             | string   | —                | `custom:energy-manager-card`                                                                               |
| `title`            | string   | —                | Überschrift der Karte                                                                                      |
| `meter_mode`       | string   | abgeleitet       | `grid` oder `split`. Ohne Angabe `grid`, sobald `grid_entity` gesetzt ist                                  |
| `devices`          | Liste    | `[]`             | Verbraucher. **Die Reihenfolge ist die Priorität**                                                         |
| `scale_max`        | Zahl (W) | abgeleitet       | Obergrenze der Leiste. Ohne Angabe aus Σ `max_power`, min. 3000                                            |
| `compact`          | bool     | `false`          | Engere Abstände                                                                                            |
| `show_surplus_bar` | bool     | `true`           | Überschussleiste anzeigen                                                                                  |
| `show_battery`     | bool     | wenn Batterie da | Batterie-Badge anzeigen                                                                                    |
| `show_priority`    | bool     | `true`           | Prioritätsnummer je Zeile                                                                                  |
| `secondary_info`   | string   | `both`           | `power`, `status` oder `both`                                                                              |
| `switch_action`    | string   | `auto`           | Was der Schalter tut: `device`, `automation` oder `auto` (Automatik, sobald ein `auto_entity` gesetzt ist) |
| `allow_reorder`    | bool     | wenn Helfer da   | Sortieren im Dashboard; braucht bei allen Verbrauchern ein `priority_entity`                               |
| `update_interval`  | Zahl (s) | `5`              | Abtast- und Anzeigetakt                                                                                    |
| `smoothing_window` | Zahl (s) | `60`             | Mittelungsfenster; `0` schaltet die Glättung ab                                                            |

### Modus `grid`

| Option        | Typ    | Standard | Bedeutung                                                        |
| ------------- | ------ | -------- | ---------------------------------------------------------------- |
| `grid_entity` | Entity | —        | **Pflicht.** Bidirektional: >0 Bezug, <0 Einspeisung             |
| `invert_grid` | bool   | `false`  | Vorzeichen umkehren, wenn der Sensor beim Einspeisen positiv ist |

### Modus `split`

| Option                         | Typ    | Standard | Bedeutung                                             |
| ------------------------------ | ------ | -------- | ----------------------------------------------------- |
| `production_entity`            | Entity | —        | **Pflicht.** PV-Erzeugung, stets positiv              |
| `consumption_entity`           | Entity | —        | **Pflicht.** Hausverbrauch, stets positiv             |
| `consumption_includes_battery` | bool   | `false`  | Verbrauchssensor zählt die Batterieladung bereits mit |

### Hausbatterie (optional)

| Option                     | Typ      | Standard      | Bedeutung                                                                                        |
| -------------------------- | -------- | ------------- | ------------------------------------------------------------------------------------------------ |
| `battery_soc_entity`       | Entity   | —             | Ladestand in %                                                                                   |
| `battery_power_entity`     | Entity   | —             | >0 Laden, <0 Entladen                                                                            |
| `battery_invert`           | bool     | `false`       | Vorzeichen umkehren                                                                              |
| `battery_charge_entity`    | Entity   | —             | Alternative: Ladeleistung, stets positiv                                                         |
| `battery_discharge_entity` | Entity   | —             | Alternative: Entladeleistung, stets positiv                                                      |
| `battery_mode`             | string   | `charge_only` | `charge_only`: Entladung wird ignoriert. `full`: Entladung wird abgezogen (reiner PV-Überschuss) |
| `battery_min_soc`          | 0–100    | —             | Darunter hat das Laden Vorrang, es wird kein Überschuss ausgewiesen                              |
| `battery_reserve_w`        | Zahl (W) | `0`           | Bleibt immer der Batterie vorbehalten                                                            |

## Verbraucher (`devices[]`)

| Option            | Typ      | Standard      | Wer wertet es aus           | Bedeutung                                                          |
| ----------------- | -------- | ------------- | --------------------------- | ------------------------------------------------------------------ |
| `switch_entity`   | Entity   | —             | Karte + Integration         | **Pflicht.** Was geschaltet wird                                   |
| `power_entity`    | Entity   | —             | Karte + Integration         | Aktuelle Leistungsaufnahme                                         |
| `priority_entity` | Entity   | —             | Karte + Integration         | `input_number` mit dem Rang. Gesetzt schlägt er die Array-Position |
| `auto_entity`     | Entity   | —             | Karte + Integration         | `input_boolean` für die Teilnahme an der Automatik                 |
| `id`              | string   | automatisch   | Karte + Integration         | Stabile UUID; vom Editor vergeben, nicht ändern                    |
| `name`            | string   | friendly_name | Karte                       | Anzeigename                                                        |
| `icon`            | string   | Entity-Icon   | Karte                       | Symbol                                                             |
| `min_power`       | Zahl (W) | `max_power`   | Karte + Integration         | Ab so viel Überschuss lohnt sich das Einschalten                   |
| `max_power`       | Zahl (W) | —             | Karte + Integration         | Nennleistung; geht in die Skala ein                                |
| `hysteresis`      | Zahl (W) | `0`           | Karte + Integration         | Totband gegen Flackern                                             |
| `turn_on_delay`   | Zahl (s) | `0`           | **nur Integration**         | So lange muss der Überschuss reichen, bevor eingeschaltet wird     |
| `turn_off_delay`  | Zahl (s) | `0`           | **nur Integration**         | So lange muss das Defizit anhalten, bevor ausgeschaltet wird       |
| `min_runtime`     | Zahl (s) | `0`           | Integration; Karte zeigt an | Mindestlaufzeit nach dem Einschalten                               |
| `min_off_time`    | Zahl (s) | `0`           | Integration; Karte zeigt an | Mindest-Aus-Zeit nach dem Ausschalten                              |
| `managed`         | bool     | `true`        | **nur Integration**         | Nimmt an der Automatik teil                                        |
| `confirm`         | bool     | `false`       | Karte                       | Sicherheitsabfrage vor dem Schalten                                |

Ohne `power_entity` **und** ohne `max_power`/`min_power` rechnet die Ampel mit 500 W Schätzwert und
der Editor weist darauf hin.

## Farbanpassung

Die Karte nutzt HA-Theme-Variablen. Für abweichende Farben (z. B. per card-mod):

```yaml
card_mod:
  style: |
    :host {
      --energy-manager-on-ok-color: #2e7d32;
      --energy-manager-off-ready-color: #66bb6a;
      --energy-manager-off-insufficient-color: #9e9e9e;
    }
```

Verfügbar: `--energy-manager-{on-ok,on-deficit,off-ready,off-close,off-insufficient,unavailable}-color`.
Die Energieflussfarben stammen aus HAs eigenen `--energy-*-color`-Variablen.
