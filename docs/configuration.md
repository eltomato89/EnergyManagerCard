# Configuration

This table is the reference for anyone who prefers YAML. The card options can also be set in the
graphical editor — `devices[]` cannot, see below.

> **With the [Energy Manager Integration](https://github.com/eltomato89/EnergyManagerIntegration)
> almost none of this is needed** — and the integration is how the card is meant to be used. Meter
> source, batteries, smoothing and `devices` all come from there; what remains are the display
> options in the first table. Everything marked _legacy configurations only_ exists so that setups
> from earlier versions keep working.

## Card

| Option             | Type       | Default | Meaning                                                                                                               |
| ------------------ | ---------- | ------- | --------------------------------------------------------------------------------------------------------------------- |
| `type`             | string     | —       | `custom:energy-manager-card`                                                                                          |
| `title`            | string     | —       | Card heading                                                                                                          |
| `use_integration`  | bool       | `true`  | Use the integration as the data source if installed. `false` forces the card's own calculation                        |
| `meter_mode`       | string     | derived | `grid` or `split`. Without a value, `grid` as soon as `grid_entity` is set. Mandatory without the integration         |
| `devices`          | list       | —       | Loads, **YAML only**. Not needed with the integration — see below                                                     |
| `scale_max`        | number (W) | derived | Upper end of the bar. Without a value, from Σ `max_power`, at least 3000                                              |
| `compact`          | bool       | `false` | Tighter spacing                                                                                                       |
| `show_surplus_bar` | bool       | `true`  | Show the surplus bar                                                                                                  |
| `show_battery`     | bool       | derived | Battery badge. Shown by default when a state of charge is reported — with the integration only with a single battery  |
| `show_priority`    | bool       | `true`  | Priority number per row                                                                                               |
| `secondary_info`   | string     | `both`  | `power`, `status` or `both`                                                                                           |
| `switch_action`    | string     | `auto`  | What the toggle does: `device`, `automation` or `auto` (automation as soon as an `auto_entity` is set)                |
| `allow_reorder`    | bool       | derived | Reordering from the dashboard. Always possible with the integration; without it, every load needs a `priority_entity` |
| `update_interval`  | number (s) | `5`     | Sampling and display interval                                                                                         |
| `smoothing_window` | number (s) | `60`    | Averaging window; `0` disables smoothing                                                                              |

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

Without the integration the card handles **exactly one** battery, and `battery_min_soc` blocks the
surplus outright below that state of charge. That is the old rule and it stays as it is. Several
batteries, a row per battery and an adjustable limit come from the integration — see below.

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

### Batteries in the priority order — with the integration

Each battery is an entry of its own there, with its own device, and there can be **several**. The
card builds **one row per battery**, from that battery's own traffic-light sensor
(attribute `kind` = `battery`) — the row is named after the battery, not after a fixed label.
Standalone (without the integration) the card does not synthesise such rows.

A row exists only for a battery with a **maximum charge power** entered (attribute `shiftable`).
Only then does the battery take part in the priority order: loads ranked **above** it are served
first and stay on; the battery reserves up to its charge power at its rank; only what is left goes
to loads ranked **below** it. Without that figure a battery is merely a correction term in the
balance, and a rank would promise scheduling that does not take place. The row has no switch — the
battery is not commanded, only scheduled — but it can be dragged to any position like a load. See
[integration-contract.md](integration-contract.md#batterie-als-verschiebbare-last).

Where a load has its toggle, the row carries the **charge priority limit** (`min_soc`) as a
percentage. Tapping it opens Home Assistant's dialog for that `number` entity, whose slider HA
brings along; the card adds no control of its own, since holding a second state against the
write-back is the same class of error as optimistic switching. While the limit is taking effect, the
value is highlighted and the second line says so. Without a state of charge sensor there is no
entity and the place stays empty — a limit would have nothing to compare against.

That limit is a claim within the order: a battery below it moves ahead of all loads. It is not the
blanket block that `battery_min_soc` is in the card's own calculation above.

**The battery badge in the header** appears only with exactly one battery. With several, the
integration reports no overall state of charge — that would need the capacities, and 5 kWh at 20 %
plus 10 kWh at 80 % is not 50 %. The rows show the individual states of charge instead.

The second line of a row reads `1.2 kW · charging · 62 %` under the name of the battery: measured
power, what the battery is doing, state of charge — followed by `charging first` while the priority
limit is taking effect. The power is shown as a magnitude — the direction is in the word next to it,
and a minus sign in a line that can also read "waiting" is too easily taken for a deficit. A reading
of 0 W is shown rather than omitted; "0 W · waiting" is a statement, a missing figure is not.

While power is actually flowing, the battery icon animates: the fill travels **upwards** when
charging and **downwards** when discharging, five frames over two seconds. The charging frames carry
the lightning bolt, which marks them as motion rather than a reading — the real state of charge is
the figure next to them. At rest, or when the operating system asks for
[reduced motion](https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-motion),
the icon simply shows the actual state of charge. A deadband of 10 W keeps sensor noise around zero
from flipping the direction back and forth, and the animation pauses in background tabs.

The word is not the traffic-light text used for loads: "running, drawing from grid" makes no sense
for a battery, which never draws from the grid. A **discharge takes precedence over everything
else** — with no surplus the traffic light says `off_insufficient`, but the battery is not waiting
then, it is supplying the house.

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
