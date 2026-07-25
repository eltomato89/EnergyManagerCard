import type { HassEntity, HomeAssistant } from '../types/hass';

/**
 * Prueft, ob sich eine der beobachteten Entitaeten geaendert hat.
 *
 * HA ersetzt Zustandsobjekte unveraenderlich, ein Referenzvergleich genuegt
 * also. Das ist der entscheidende Filter gegen Render-Stuerme: der hass-Setter
 * feuert bei jeder Zustandsaenderung im gesamten System, oft mehrere Male pro
 * Sekunde.
 */
export function haveTrackedStatesChanged(
  oldHass: HomeAssistant | undefined,
  newHass: HomeAssistant | undefined,
  tracked: Iterable<string>,
): boolean {
  if (!newHass) return false;
  if (!oldHass) return true;

  for (const entityId of tracked) {
    if (oldHass.states[entityId] !== newHass.states[entityId]) return true;
  }
  return false;
}

/** Momentaufnahme der beobachteten Zustaende, als reaktiver Kartenzustand. */
export function snapshotStates(
  hass: HomeAssistant | undefined,
  tracked: Iterable<string>,
): Record<string, HassEntity | undefined> {
  const snapshot: Record<string, HassEntity | undefined> = {};
  if (!hass) return snapshot;
  for (const entityId of tracked) {
    snapshot[entityId] = hass.states[entityId];
  }
  return snapshot;
}
