# 0.7.0-beta.2 — pre-release

One fix, found by running `0.7.0-beta.1` on a real installation.

## Fixed

- **A ladder with a single step was drawn as a ladder.** One segment across the full width
  labelled "Level 1/1" says nothing, and reads like a device that genuinely has one step.
  It is not: that is what appears when a device does not reach its smallest level, which in
  practice means a misconfiguration — a wallbox with the wrong number of phases, for
  instance. The row now states which power the device actually reaches and what its minimum
  would be.

Everything else from `0.7.0-beta.1` is unchanged: the step ladder for modulating loads, the
daily target ring, the manual-override countdown, and the dimmed status bar when the
automation deliberately stays away.

The modulating rows need Energy Manager integration `0.5.0b1` or newer; `0.5.0b2` also fixes
the cascade fault behind the one-step ladder. Everything else works with any version.
