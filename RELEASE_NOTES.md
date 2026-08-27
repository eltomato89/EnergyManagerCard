# 0.7.0-beta.4 — pre-release

One row per battery, and the charging-priority threshold adjustable right in it.

**This release belongs together with integration `0.5.0b4`.** The figures about a battery moved
from the hub to the battery's own device — with an older integration this card shows no battery
row, and with an older card the new integration shows none either.

## Changed

- **One row per battery.** The row used to be built from the `battery_*` attributes of the
  surplus sensor, where exactly one fitted. Every battery now has its own device with its own
  traffic-light sensor, and the row comes from there — the same way a load's row does. It
  carries the battery's name instead of a fixed "Battery".

- **The charging-priority threshold is adjustable in the row**, where a load has its switch.
  Tapping it opens the entity's dialog with the slider Home Assistant brings along for a
  `number` — no control of our own, and so no second piece of state fighting the write-back.
  While the threshold is in force the value is highlighted and the second line says so: that is
  the answer to "why is no load getting anything".

- **The badge in the header appears only with a single battery.** With several, the integration
  reports no combined state of charge — it would need the capacities — and the rows show the
  individual ones instead.

- A battery **without a maximum charge power** gets no row. It is not part of the order then,
  and a rank would be a claim the automation does not honour.

## Fixed

- **Battery devices were drawn as loads.** They have a traffic-light sensor too now, and the
  rule "every further device with a status" took them along — as a row with a switch, without a
  switch entity. They are told apart by the `kind` attribute rather than by the missing switch
  entity: a gap is a fault, not a statement.

## Unchanged

The card's own battery options (`battery_soc_entity`, `battery_min_soc` and the rest) still work
as before for installations running without the integration — one battery, and the threshold
still as a blanket block on the surplus.
