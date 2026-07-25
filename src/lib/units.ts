/**
 * Einheiten-Normalisierung auf Watt.
 *
 * Zwei Leistungssensoren derselben Anlage haben nicht zwangslaeufig dieselbe
 * Einheit — Wechselrichter melden gern kW, Steckdosen W. Intern wird deshalb
 * ausschliesslich in Watt gerechnet.
 */

/** Umrechnungsfaktoren auf Watt. */
const POWER_FACTORS: Record<string, number> = {
  w: 1,
  kw: 1e3,
  mw: 1e6,
  gw: 1e9,
  // Milliwatt kollidiert nach Kleinschreibung mit Megawatt. HA liefert praktisch
  // nie mW fuer Leistungssensoren, deshalb gewinnt hier bewusst MW: ein als "mW"
  // gemeldeter Wert wuerde um Faktor 1e9 daneben liegen, ein "MW"-Wert nur um 1e-9.
  // Die Gross-/Kleinschreibung wird darum vor dem Lowercasing gesondert geprueft.
};

/** Einheiten, die eindeutig keine Momentanleistung sind. */
const NON_POWER_UNITS = new Set([
  'wh',
  'kwh',
  'mwh',
  'gwh',
  '%',
  'a',
  'v',
  'va',
  'var',
  'hz',
  '°c',
  '°f',
  'k',
]);

export interface UnitConversion {
  factor: number | null;
  /** Einheit ist bekannt, aber keine Leistung. */
  wrongUnit: boolean;
}

/**
 * Liefert den Faktor, mit dem ein Wert dieser Einheit in Watt umgerechnet wird.
 *
 * `factor === null` mit `wrongUnit === true` bedeutet: die Einheit ist bekannt,
 * misst aber keine Leistung (typischer Fall: jemand konfiguriert einen
 * kWh-Zaehler statt eines W-Sensors). Das muss dem Nutzer im Klartext gemeldet
 * werden und darf niemals stillschweigend als 0 W durchgehen.
 */
export function powerFactor(unit: string | undefined): UnitConversion {
  if (unit === undefined || unit === null) return { factor: null, wrongUnit: false };

  const trimmed = unit.trim();
  if (trimmed === '') return { factor: null, wrongUnit: false };

  // mW vor dem Lowercasing abfangen, sonst kollidiert es mit MW.
  if (trimmed === 'mW') return { factor: 1e-3, wrongUnit: false };
  if (trimmed === 'MW') return { factor: 1e6, wrongUnit: false };

  const key = trimmed.toLowerCase();
  const factor = POWER_FACTORS[key];
  if (factor !== undefined) return { factor, wrongUnit: false };

  return { factor: null, wrongUnit: NON_POWER_UNITS.has(key) };
}

/** Rundet auf ganze Watt — verhindert, dass Gleitkommarauschen Re-Renders ausloest. */
export function roundW(value: number): number {
  return Math.round(value);
}
