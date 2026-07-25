import { UNAVAILABLE, UNKNOWN } from '../const';
import type { HassEntity, HomeAssistant } from '../types/hass';
import type { Reading } from '../types/runtime';
import { powerFactor } from './units';

const EMPTY_STATES = new Set([UNAVAILABLE, UNKNOWN, '', 'none', 'None', 'null']);

export function isUnavailableState(state: string | undefined): boolean {
  return state === undefined || EMPTY_STATES.has(state);
}

/** true fuer alle Domains: HA nutzt durchgaengig 'on' als Ein-Zustand. */
export function isOnState(state: string | undefined): boolean {
  return state === 'on' || state === 'open' || state === 'heat' || state === 'cool';
}

/**
 * Liest einen Leistungssensor und normalisiert ihn auf Watt.
 *
 * Bewusst kein Fallback auf 0: ein fehlender oder falsch konfigurierter Sensor
 * muss als solcher erkennbar bleiben, sonst rechnet die Karte stillschweigend
 * mit einem falschen Ueberschuss.
 */
export function readPowerW(hass: HomeAssistant | undefined, entityId?: string): Reading {
  if (!entityId) return { w: null, reason: 'missing' };

  const stateObj = hass?.states?.[entityId];
  if (!stateObj) return { w: null, reason: 'missing' };

  if (isUnavailableState(stateObj.state)) return { w: null, reason: 'unavailable' };

  const value = Number(stateObj.state);
  if (!Number.isFinite(value)) return { w: null, reason: 'nan' };

  const unit = stateObj.attributes?.unit_of_measurement as string | undefined;
  const { factor, wrongUnit } = powerFactor(unit);

  if (wrongUnit) return { w: null, reason: 'wrong-unit', unit };

  if (factor === null) {
    // Keine Einheit angegeben. Sehr viele Template-Sensoren lassen sie weg,
    // deshalb W annehmen — aber markieren, damit der Editor warnen kann.
    return { w: value, assumedUnit: true };
  }

  return { w: value * factor, unit };
}

/** Liest einen Prozentwert (Ladestand) und klemmt ihn auf 0..100. */
export function readPercent(hass: HomeAssistant | undefined, entityId?: string): number | null {
  if (!entityId) return null;

  const stateObj = hass?.states?.[entityId];
  if (!stateObj || isUnavailableState(stateObj.state)) return null;

  const value = Number(stateObj.state);
  if (!Number.isFinite(value)) return null;

  return Math.min(100, Math.max(0, value));
}

/** Kehrt das Vorzeichen um, ohne aus `null` eine 0 zu machen. */
export function invertReading(reading: Reading, invert: boolean | undefined): Reading {
  if (!invert || reading.w === null) return reading;
  return { ...reading, w: -reading.w };
}

/**
 * Setzt die Batterieleistung aus zwei stets positiven Sensoren zusammen.
 * Ergebnis nach Konvention: >0 = Laden, <0 = Entladen.
 * Liefert nur einer der beiden einen Wert, zaehlt dieser allein.
 */
export function combineBatteryReadings(charge: Reading, discharge: Reading): Reading {
  if (charge.w === null && discharge.w === null) {
    return { w: null, reason: charge.reason ?? discharge.reason ?? 'missing' };
  }
  return { w: (charge.w ?? 0) - (discharge.w ?? 0) };
}

export function friendlyName(stateObj: HassEntity | undefined, fallback: string): string {
  const name = stateObj?.attributes?.friendly_name;
  return typeof name === 'string' && name !== '' ? name : fallback;
}
