import type { SurplusError, SurplusInput, SurplusResult } from '../types/runtime';
import { roundW } from './units';

/**
 * Berechnet den PV-Ueberschuss.
 *
 * Bilanz am Netzverknuepfungspunkt, alles in Watt:
 *
 *     G = C_haus + B - P_pv
 *
 * mit G = Netzleistung (>0 Bezug), B = Batterieleistung (>0 Laden),
 * C_haus = Hauslast ohne Batterie, P_pv = Erzeugung. Daraus folgt der rohe
 * Ueberschuss als "was die PV ueber die Hauslast hinaus liefert":
 *
 *     S_roh = P_pv - C_haus = B - G
 *
 * Modus 'grid':  S_roh = -G + B
 *
 * Das gilt fuer beide Batterievorzeichen ohne Fallunterscheidung: Laden (B>0)
 * ist umlenkbare Leistung und erhoeht den verfuegbaren Ueberschuss, Entladen
 * (B<0) stuetzt bereits die Hauslast und verringert ihn.
 *
 * Modus 'split': S_roh = P_prod - C_haus, plus B, wenn der Verbrauchssensor
 * die Batterieladung bereits mitzaehlt.
 *
 * Vorzeichen-Invertierungen und das Zusammensetzen aus charge/discharge sind
 * VOR dem Aufruf erledigt (siehe state.ts).
 */
export function computeSurplus(input: SurplusInput): SurplusResult {
  const errors: SurplusError[] = [];

  // Batteriekorrektur. Ist eine Batterie konfiguriert, liefert aber gerade
  // keinen Wert, wird mit 0 weitergerechnet UND das Ergebnis als 'degraded'
  // markiert — ein kurz unavailable gewordener Sensor darf keinen falschen
  // Ueberschuss als gesichert ausweisen.
  let batteryCorrection = 0;
  let degraded = false;
  if (input.batteryConfigured) {
    if (input.battery.w === null) {
      degraded = true;
    } else {
      batteryCorrection = input.battery.w;
    }
  }

  let raw: number | null = null;

  if (input.mode === 'grid') {
    const g = input.grid;
    if (g.w === null) {
      errors.push(reasonToError(g.reason, 'grid'));
    } else {
      raw = -g.w + batteryCorrection;
    }
  } else {
    const p = input.production;
    const c = input.consumption;
    if (p.w === null) errors.push(reasonToError(p.reason, 'production'));
    if (c.w === null) errors.push(reasonToError(c.reason, 'consumption'));

    if (p.w !== null && c.w !== null) {
      raw = p.w - c.w;
      if (input.consumptionIncludesBattery) raw += batteryCorrection;
    }
  }

  if (raw === null) {
    return { raw: null, available: null, batteryCorrection, degraded, errors };
  }

  const available = applyReserve(raw, input.batterySoc, input.batteryMinSoc, input.batteryReserveW);

  return {
    raw: roundW(raw),
    available: available === null ? null : roundW(available),
    batteryCorrection: roundW(batteryCorrection),
    degraded,
    errors,
  };
}

/**
 * Zieht die der Batterie vorbehaltene Leistung ab.
 *
 * Bewusst aus computeSurplus herausgeloest, damit die Karte die Reserve NACH
 * der Glaettung anwenden kann: geglaettet wird der Rohwert, sonst liefe die
 * SoC-Grenzregel um das Mittelungsfenster verzoegert nach.
 *
 * Kein Clamping auf >= 0 — negative Werte bedeuten Netzbezug und werden von
 * der Ampel gebraucht.
 */
export function applyReserve(
  rawW: number | null,
  batterySoc: number | null,
  batteryMinSoc: number | undefined,
  batteryReserveW: number,
): number | null {
  if (rawW === null) return null;

  let available = rawW - (batteryReserveW || 0);

  // Unterhalb der SoC-Grenze hat das Laden der Batterie Vorrang: es wird kein
  // Ueberschuss mehr an Verbraucher ausgewiesen.
  if (batterySoc !== null && batteryMinSoc !== undefined && batterySoc < batteryMinSoc) {
    available = Math.min(available, 0);
  }

  return available;
}

function reasonToError(
  reason: string | undefined,
  source: 'grid' | 'production' | 'consumption',
): SurplusError {
  if (reason === 'wrong-unit') return 'wrong-unit';
  if (reason === 'missing') return `missing-${source}` as SurplusError;
  return `${source}-unavailable` as SurplusError;
}
