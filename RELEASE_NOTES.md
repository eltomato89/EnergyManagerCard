# 0.7.0-beta.1 — pre-release

Display for the integration's new features. Nothing changes for a card running without the
integration, or against an older one: missing attributes simply mean less display, never an
error.

## New

- **Step ladder for modulating loads.** One segment per level, filled up to the one
  currently set, plus a line reading "4.8 kW of 11.0 kW · Level 5/11". Without it a
  throttled wallbox reads like one whose surplus is short. A small icon marks a ladder that
  has been capped because the device does not follow its setpoint.

- **Daily target ring.** An eight-step ring carries the progress, its colour the urgency:
  neutral while the forecast still covers the rest, warning once the load will run on grid
  power. 58 percent at ten in the morning is relaxed; 58 percent at four in the afternoon
  is the moment it matters.

- **Countdown when a load is under manual override**, so the state reads as temporary
  rather than as a setting.

- **Dimmed status bar when the automation deliberately stays away** (not managed,
  unavailable, forced, manual). The timing conditions of normal operation are excluded on
  purpose — they run before and after every ordinary switching action, and the bar would
  blink grey continuously.

## Fixed

- An attribute the integration reports as `null` was read as a measured zero.
  `Number(null)` is 0 rather than NaN, so the check for a finite number never caught it: a
  load without a power sensor showed "0 W" instead of falling back to its rated power or its
  requirement.

The new rows need Energy Manager integration `0.5.0b1` or newer. Everything else works with
any version.
