import {
  mdiBattery,
  mdiBattery10,
  mdiBattery20,
  mdiBattery30,
  mdiBattery40,
  mdiBattery50,
  mdiBattery60,
  mdiBattery70,
  mdiBattery80,
  mdiBattery90,
  mdiBatteryCharging20,
  mdiBatteryCharging40,
  mdiBatteryCharging60,
  mdiBatteryCharging80,
  mdiBatteryCharging100,
  mdiBatteryOutline,
} from '@mdi/js';

/** Ladestandsstufen, absteigend — die erste erreichte Schwelle gewinnt. */
const LEVELS: Array<[number, string]> = [
  [95, mdiBattery],
  [85, mdiBattery90],
  [75, mdiBattery80],
  [65, mdiBattery70],
  [55, mdiBattery60],
  [45, mdiBattery50],
  [35, mdiBattery40],
  [25, mdiBattery30],
  [15, mdiBattery20],
  [5, mdiBattery10],
];

/** Das Symbol, das den tatsaechlichen Ladestand zeigt. */
export function batteryIconForSoc(soc: number | null): string {
  if (soc === null) return mdiBatteryOutline;
  for (const [threshold, icon] of LEVELS) {
    if (soc >= threshold) return icon;
  }
  return mdiBatteryOutline;
}

export type BatteryFlow = 'charging' | 'discharging' | null;

/**
 * Unterhalb dieser Leistung gilt die Batterie als ruhend.
 *
 * Ein Leistungssensor pendelt auch im Leerlauf um die Null. Ohne Totband
 * wechselte die Animation dabei staendig die Richtung — Unruhe, die nichts
 * bedeutet.
 */
export const FLOW_DEADBAND_W = 10;

/** Was die Batterie gerade tut, gemessen statt geplant. */
export function batteryFlow(powerW: number | null | undefined): BatteryFlow {
  if (powerW === null || powerW === undefined || !Number.isFinite(powerW)) return null;
  if (powerW >= FLOW_DEADBAND_W) return 'charging';
  if (powerW <= -FLOW_DEADBAND_W) return 'discharging';
  return null;
}

/**
 * Bildfolgen der Animation: der Fuellstand wandert aufwaerts bzw. abwaerts.
 *
 * Beim Laden mit dem Blitz-Symbol, und das aus einem Grund: Die wandernde
 * Fuellung ist Bewegung, kein Messwert — daneben steht der echte Ladestand als
 * Zahl. Mit dem Blitz ist das Symbol als "laedt gerade" gekennzeichnet und wird
 * gar nicht erst als Fuellstand gelesen.
 */
const CHARGING_FRAMES = [
  mdiBatteryCharging20,
  mdiBatteryCharging40,
  mdiBatteryCharging60,
  mdiBatteryCharging80,
  mdiBatteryCharging100,
];

const DISCHARGING_FRAMES = [mdiBattery, mdiBattery80, mdiBattery60, mdiBattery40, mdiBattery20];

export const FRAME_COUNT = CHARGING_FRAMES.length;

/**
 * Das Symbol fuer einen Schritt der Animation.
 *
 * Ohne Richtung — also im Ruhezustand und bei abgeschalteter Bewegung — steht
 * der tatsaechliche Ladestand da, nicht ein Zwischenbild.
 */
export function batteryFrame(flow: BatteryFlow, step: number, soc: number | null): string {
  const frames =
    flow === 'charging' ? CHARGING_FRAMES : flow === 'discharging' ? DISCHARGING_FRAMES : null;
  if (!frames) return batteryIconForSoc(soc);

  const index = ((Math.trunc(step) % frames.length) + frames.length) % frames.length;
  return frames[index];
}
