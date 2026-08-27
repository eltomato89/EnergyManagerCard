# 0.7.0-beta.3 — pre-release

Two small things: a daily target that finally speaks the unit you typed, and a catalogue
entry that speaks your language.

## Changed

- **A daily target is now shown in the unit it was entered in.** For a switchable load that
  is hours — "1.7 of 4.0 h" instead of "0.6 of 1.4 kWh". The kWh are what the automation
  computes with, but nobody types them: reading the target back in kWh forced you to divide
  by the rated power to recognise the "4 h" you had entered.

  The conversion happens in the integration, using the same basis it made the target from —
  the card would need the rated power and the same rule, and both would drift. Needs
  integration `0.5.0b3`; on an older one the row stays with kWh, and so does a modulating
  load, where hours are no statement at all. The progress ring is unchanged: a ratio does not
  depend on the unit.

  These are full-load hours, not the clock at the switch. Running below its rated power, a
  device advances more slowly than time does — the automation compares energy against
  forecast, and the row shows what the automation does.

## Fixed

- **The description in the card catalogue was hardcoded in German** and appeared that way in
  an English interface too. It now comes from the language files, using the browser language:
  the catalogue is filled when the module loads, long before the card has an instance and
  thus a `hass.language`.

Everything else from `0.7.0-beta.1` and `0.7.0-beta.2` is unchanged: the step ladder for
modulating loads, the daily target ring, the manual-override countdown, and the dimmed status
bar when the automation deliberately stays away.
