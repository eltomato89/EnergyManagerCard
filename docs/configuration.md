# Configuration

This table is the reference for anyone who prefers YAML. The card options can also be set in the
graphical editor — `devices[]` cannot, see below.

> **With the [Energy Manager Integration](https://github.com/eltomato89/EnergyManagerIntegration)
> almost none of this is needed** — and the integration is how the card is meant to be used. Meter
> source, battery, smoothing and `devices` all come from there; what remains are the display
> options in the first table. Everything marked _legacy configurations only_ exists so that setups
> from earlier versions keep working.

## Card

| Option             | Type       | Default        | Meaning                                                                                                               |
| ------------------ | ---------- | -------------- | --------------------------------------------------------------------------------------------------------------------- |
| `type`             | string     | —              | `custom:energy-manager-card`                                                                                          |
| `title`            | string     | —              | Card heading                                                                                                          |
| `use_integration`  | bool       | `true`         | Use the integration as the data source if installed. `false` forces the card's own calculation                        |
| `meter_mode`       | string     | derived        | `grid` or `split`. Without a value, `grid` as soon as `grid_entity` is set. Mandatory without the integration         |
| `devices`          | list       | —              | Loads, **YAML only**. Not needed with the integration — see below                                                     |
| `scale_max`        | number (W) | derived        | Upper end of the bar. Without a value, from Σ `max_power`, at least 3000                                              |
| `compact`          | bool       | `false`        | Tighter spacing                                                                                                       |
| `show_surplus_bar` | bool       | `true`         | Show the surplus bar                                                                                                  |
| `show_battery`     | bool       | if battery set | Show the battery badge                                                                                                |
| `show_priority`    | bool       | `true`         | Priority number per row                                                                                               |
| `secondary_info`   | string     | `both`         | `power`, `status` or `both`                                                                                           |
| `switch_action`    | string     | `auto`         | What the toggle does: `device`, `automation` or `auto` (automation as soon as an `auto_entity` is set)                |
| `allow_reorder`    | bool       | derived        | Reordering from the dashboard. Always possible with the integration; without it, every load needs a `priority_entity` |
| `update_interval`  | number (s) | `5`            | Sampling and display interval                                                                                         |
| `smoothing_window` | number (s) | `60`           | Averaging window; `0` disables smoothing                                                                              |

### Meter source, mode `grid` — legacy configurations only

| Option        | Type   | Default | Meaning                                                   |
| ------------- | ------ | ------- | --------------------------------------------------------- |
| `grid_entity` | entity | —       | **Mandatory.** Bidirectional: >0 import, <0 export        |
| `invert_grid` | bool   | `false` | Invert the sign if the sensor is positive while exporting |

### Meter source, mode `split` — legacy configurations only

| Option                         | Type   | Default | Meaning                                           |
| ------------------------------ | ------ | ------- | ------------------------------------------------- |
| `production_entity`            | entity | —       | **Mandatory.** PV production, always positive     |
| `consumption_entity`           | entity | —       | **Mandatory.** House consumption, always positive |
| `consumption_includes_battery` | bool   | `false` | The consumption sensor already includes charging  |

### Home battery — legacy configurations only

| Option                     | Type       | Default       | Meaning                                                                                  |
| -------------------------- | ---------- | ------------- | ---------------------------------------------------------------------------------------- |
| `battery_soc_entity`       | entity     | —             | State of charge in %                                                                     |
| `battery_power_entity`     | entity     | —             | >0 charging, <0 discharging                                                              |
| `battery_invert`           | bool       | `false`       | Invert the sign                                                                          |
| `battery_charge_entity`    | entity     | —             | Alternative: charging power, always positive                                             |
| `battery_discharge_entity` | entity     | —             | Alternative: discharging power, always positive                                          |
| `battery_mode`             | string     | `charge_only` | `charge_only`: discharging is ignored. `full`: discharging is deducted (pure PV surplus) |
| `battery_min_soc`          | 0–100      | —             | Below this, charging takes precedence and no surplus is reported                         |
| `battery_reserve_w`        | number (W) | `0`           | Always reserved for the battery                                                          |

## Loads (`devices[]`) — legacy configurations only

**With the integration none of this applies.** Loads are created there; the card reads them along
with priority, timing fields and state from their entities.

A `devices` list in the card configuration is still read and rendered so that configurations from
earlier versions do not break. The editor no longer offers **any interface** for it — two places
for the same list was precisely the problem the integration solves.

| Option            | Type       | Default       | Evaluated by                 | Meaning                                                                            |
| ----------------- | ---------- | ------------- | ---------------------------- | ---------------------------------------------------------------------------------- |
| `switch_entity`   | entity     | —             | card + integration           | **Mandatory.** What gets switched                                                  |
| `power_entity`    | entity     | —             | card + integration           | Current power draw                                                                 |
| `priority_entity` | entity     | —             | without the integration only | `input_number` (or `number`) holding the rank. If set, it beats the array position |
| `auto_entity`     | entity     | —             | without the integration only | `input_boolean` (or `switch`) for participation in the automation                  |
| `id`              | string     | automatic     | card + integration           | Stable UUID; assigned by the editor, do not change                                 |
| `name`            | string     | friendly_name | card                         | Display name                                                                       |
| `icon`            | string     | entity icon   | card                         | Icon                                                                               |
| `min_power`       | number (W) | `max_power`   | card + integration           | Switching on starts at this surplus                                                |
| `max_power`       | number (W) | —             | card + integration           | Rated power; feeds into the scale                                                  |
| `hysteresis`      | number (W) | `0`           | card + integration           | Dead band against flickering                                                       |
| `turn_on_delay`   | number (s) | `0`           | **integration only**         | The surplus must be sufficient this long before switching on                       |
| `turn_off_delay`  | number (s) | `0`           | **integration only**         | The deficit must persist this long before switching off                            |
| `min_runtime`     | number (s) | `0`           | integration; card displays   | Minimum runtime after switching on                                                 |
| `min_off_time`    | number (s) | `0`           | integration; card displays   | Minimum pause after switching off                                                  |
| `managed`         | bool       | `true`        | **integration only**         | Participates in the automation                                                     |
| `confirm`         | bool       | `false`       | card                         | Confirmation prompt before switching                                               |

Without `power_entity` **and** without `max_power`/`min_power`, the demand is assumed to be 500 W
and the editor points that out.

## Colour customisation

The card uses HA theme variables. For different colours (e.g. via card-mod):

```yaml
card_mod:
  style: |
    :host {
      --energy-manager-on-ok-color: #2e7d32;
      --energy-manager-off-ready-color: #66bb6a;
      --energy-manager-off-insufficient-color: #9e9e9e;
    }
```

Available: `--energy-manager-{on-ok,on-deficit,off-ready,off-close,off-insufficient,unavailable}-color`.
The energy flow colours come from HA's own `--energy-*-color` variables.
