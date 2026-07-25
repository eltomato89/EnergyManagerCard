import type { DeviceConfig } from '../types/config';
import type { HomeAssistant } from '../types/hass';
import { isUnavailableState } from './state';

/**
 * Prioritaetsreihenfolge der Verbraucher.
 *
 * Es gibt zwei moegliche Quellen, und das ist eine bewusste Abwaegung: Die
 * Array-Reihenfolge ist die einfachere, aber eine Karte kann ihre eigene
 * Konfiguration zur Laufzeit nicht schreiben — Sortieren im Dashboard geht
 * also nur ueber Entitaeten.
 *
 * Regel: Hat ein Verbraucher einen `priority_entity` mit gueltigem Wert, zaehlt
 * dieser. Alle anderen behalten ihre Array-Position als Rang. Bei gleichem Wert
 * entscheidet die Array-Position, damit die Reihenfolge nie springt.
 */
export function usesPriorityEntities(devices: DeviceConfig[]): boolean {
  return devices.some((device) => Boolean(device.priority_entity));
}

/** true, wenn ALLE Verbraucher einen Prioritaets-Helfer haben. */
export function hasCompletePriorityEntities(devices: DeviceConfig[]): boolean {
  return devices.length > 0 && devices.every((device) => Boolean(device.priority_entity));
}

export function readPriority(hass: HomeAssistant | undefined, device: DeviceConfig): number | null {
  if (!device.priority_entity) return null;

  const stateObj = hass?.states?.[device.priority_entity];
  if (!stateObj || isUnavailableState(stateObj.state)) return null;

  const value = Number(stateObj.state);
  return Number.isFinite(value) ? value : null;
}

export interface OrderedDevice {
  device: DeviceConfig;
  /** Position im urspruenglichen devices-Array. */
  configIndex: number;
  /** Wert aus dem Prioritaets-Helfer, oder null. */
  priority: number | null;
}

/**
 * Sortiert die Verbraucher nach Prioritaet.
 *
 * Verbraucher ohne verwertbaren Helfer-Wert behalten ihre Array-Position als
 * Rang — so bleibt eine halb migrierte Konfiguration benutzbar, statt die
 * Reihenfolge willkuerlich durcheinanderzuwerfen.
 */
export function orderDevices(
  devices: DeviceConfig[],
  hass: HomeAssistant | undefined,
): OrderedDevice[] {
  const entries: OrderedDevice[] = devices.map((device, configIndex) => ({
    device,
    configIndex,
    priority: readPriority(hass, device),
  }));

  return entries
    .map((entry, i) => ({ entry, sortKey: entry.priority ?? entry.configIndex, i }))
    .sort((a, b) => a.sortKey - b.sortKey || a.i - b.i)
    .map(({ entry }) => entry);
}

/**
 * Prioritaetswerte fuer eine neue Reihenfolge.
 *
 * Vergibt luecklos 1..n statt die vorhandenen Werte zu verschieben: nur so ist
 * das Ergebnis unabhaengig davon, wie krumm die Ausgangswerte waren.
 * Zurueckgegeben werden nur die Verbraucher, deren Wert sich tatsaechlich
 * aendert — jeder Aufruf ist ein Service-Call, und beim Verschieben um eine
 * Position aendern sich meist nur zwei.
 */
export function priorityUpdates(
  ordered: OrderedDevice[],
  hass: HomeAssistant | undefined,
): Array<{ entityId: string; value: number }> {
  const updates: Array<{ entityId: string; value: number }> = [];

  ordered.forEach((entry, rank) => {
    const entityId = entry.device.priority_entity;
    if (!entityId) return;

    const target = rank + 1;
    const current = readPriority(hass, entry.device);
    if (current === target) return;

    updates.push({ entityId, value: target });
  });

  return updates;
}

/** Liste nach dem Verschieben eines Eintrags von `from` nach `to`. */
export function moveItem<T>(items: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= items.length || to >= items.length) {
    return items;
  }
  const next = [...items];
  next.splice(to, 0, next.splice(from, 1)[0]);
  return next;
}
