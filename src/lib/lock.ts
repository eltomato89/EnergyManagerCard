import type { DeviceConfig } from '../types/config';
import type { HassEntity } from '../types/hass';
import type { LockState } from '../types/runtime';
import { isOnState, isUnavailableState } from './state';

const NO_LOCK: LockState = { kind: 'none', remainingS: 0 };

/**
 * Ermittelt die verbleibende Sperrzeit aus `min_runtime` bzw. `min_off_time`.
 *
 * Beides laesst sich ohne die spaetere Integration auswerten, weil HA mit
 * `last_changed` den Zeitpunkt des letzten Zustandswechsels mitliefert.
 *
 * Zwei Einschraenkungen, die den Wert zu einem Hinweis und nicht zu einer
 * Garantie machen:
 *  - `last_changed` wird durch manuelles Schalten ueberschrieben,
 *  - nach einem HA-Neustart beginnt es von vorn.
 * Verbindlich durchsetzen kann die Zeiten nur die Integration mit eigenem
 * Laufzeitzustand (siehe docs/integration-contract.md).
 *
 * Ausdruecklich NICHT `last_updated` verwenden: das erneuert sich bei jeder
 * Attributaenderung und waere bei Entitaeten mit Leistungsattribut wertlos.
 */
export function computeLock(
  stateObj: HassEntity | undefined,
  device: DeviceConfig,
  now: number,
): LockState {
  if (!stateObj || isUnavailableState(stateObj.state)) return NO_LOCK;

  const changed = Date.parse(stateObj.last_changed);
  if (!Number.isFinite(changed)) return NO_LOCK;

  const elapsedS = (now - changed) / 1000;
  // Negative Zeitspanne heisst: die Uhren von Browser und HA-Server laufen
  // auseinander. Dann lieber keine Sperre melden als einen Countdown, der
  // hochzaehlt.
  if (elapsedS < 0) return NO_LOCK;

  const on = isOnState(stateObj.state);
  const limit = on ? device.min_runtime : device.min_off_time;
  if (!limit || limit <= 0) return NO_LOCK;

  const remaining = limit - elapsedS;
  if (remaining <= 0) return NO_LOCK;

  return {
    kind: on ? 'min_runtime' : 'min_off_time',
    remainingS: Math.ceil(remaining),
  };
}
