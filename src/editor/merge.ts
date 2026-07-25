/**
 * Entfernt leere Werte, statt sie ins YAML zu schreiben.
 *
 * `ha-form` liefert geleerte Felder als `''` bzw. `undefined` zurueck. Wuerde
 * man die uebernehmen, sammelte die Lovelace-Config mit der Zeit Dutzende
 * bedeutungsloser `feld: ""`-Zeilen an — und `''` ist etwas anderes als "nicht
 * gesetzt", was die Default-Logik aushebelt.
 */
export function stripEmpty<T extends object>(value: T): T {
  const result: Record<string, unknown> = {};

  for (const [key, entry] of Object.entries(value)) {
    if (entry === undefined || entry === null || entry === '') continue;
    result[key] = entry;
  }

  return result as T;
}

/** Erzeugt immer eine neue Referenz — sonst erkennt HA die Aenderung nicht. */
export function mergeConfig<T extends object>(base: T, patch: Partial<T>): T {
  return stripEmpty({ ...base, ...patch });
}

/** Stabile ID fuer neue Geraete; Schluessel fuer repeat() und die Integration. */
export function newDeviceId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // Fallback fuer Kontexte ohne sichere Herkunft (http statt https).
  return `emc-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
}
