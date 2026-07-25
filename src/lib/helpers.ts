import type { DeviceConfig } from '../types/config';
import type { HomeAssistant } from '../types/hass';

/**
 * Legt die Prioritaets- und Automatik-Helfer an, die zum Bedienen im Dashboard
 * noetig sind.
 *
 * Hintergrund: Eine Lovelace-Karte kann ihre eigene Konfiguration zur Laufzeit
 * nicht schreiben. Reihenfolge und Automatik-Teilnahme brauchen deshalb je einen
 * `input_number` und `input_boolean` — von Hand angelegt schnell ein Dutzend
 * Klicks und eine Fehlerquelle bei den Grenzen.
 */

interface CreatedItem {
  id: string;
}

interface RegistryEntry {
  entity_id: string;
  platform?: string;
  unique_id?: string;
}

export interface HelperResult {
  /** Index in devices[]. */
  index: number;
  priorityEntity?: string;
  autoEntity?: string;
  error?: string;
}

/** Nur Administratoren duerfen Helfer anlegen. */
export function canCreateHelpers(hass: HomeAssistant | undefined): boolean {
  return Boolean(hass?.user?.is_admin);
}

/**
 * Loest die entity_id eines frisch angelegten Helfers auf.
 *
 * Die Collection-`id` ist zugleich die `unique_id` in der Entity-Registry —
 * darueber gefunden ueberlebt die Zuordnung ein spaeteres Umbenennen der
 * entity_id. Die naheliegende Verkettung `domain.id` waere nur der Regelfall.
 */
async function resolveEntityId(
  hass: HomeAssistant,
  domain: string,
  uniqueId: string,
): Promise<string> {
  try {
    const registry = await hass.callWS<RegistryEntry[]>({ type: 'config/entity_registry/list' });
    const entry = registry.find((e) => e.platform === domain && e.unique_id === uniqueId);
    if (entry) return entry.entity_id;
  } catch {
    // Registry nicht lesbar — der Regelfall stimmt fast immer.
  }
  return `${domain}.${uniqueId}`;
}

/**
 * Name des Helfers — und damit zugleich seine entity_id, denn HA leitet sie per
 * slugify daraus ab.
 *
 * Bewusst ohne Umlaute: aus "Priorität" wird sonst `..._priorit_t`. Der Name
 * eines Verbrauchers kann trotzdem welche enthalten, das laesst sich nicht
 * vermeiden — die technischen Zusaetze aber schon.
 */
function helperName(device: DeviceConfig, fallback: string, suffix: 'Prio' | 'Auto'): string {
  const base = device.name?.trim() || fallback;
  return `EMC ${base} ${suffix}`;
}

/**
 * Legt fuer jeden Verbraucher die fehlenden Helfer an.
 *
 * Vorhandene bleiben unberuehrt — der Aufruf ist damit wiederholbar, etwa nach
 * dem Hinzufuegen eines weiteren Verbrauchers.
 */
export async function createMissingHelpers(
  hass: HomeAssistant,
  devices: DeviceConfig[],
): Promise<HelperResult[]> {
  const results: HelperResult[] = [];

  // Der Wertebereich muss bis zur Anzahl der Verbraucher reichen: input_number
  // clampt nicht, es weist Werte ausserhalb des Bereichs ab. Etwas Luft fuer
  // spaeter dazu, damit nicht jeder neue Verbraucher die Grenzen sprengt.
  const maxPriority = Math.max(10, devices.length + 5);

  for (const [index, device] of devices.entries()) {
    const result: HelperResult = { index };
    const fallback = device.switch_entity.split('.')[1] ?? device.switch_entity;

    try {
      if (!device.priority_entity) {
        const created = await hass.callWS<CreatedItem>({
          type: 'input_number/create',
          name: helperName(device, fallback, 'Prio'),
          min: 1,
          max: maxPriority,
          step: 1,
          mode: 'box',
          icon: 'mdi:sort-numeric-variant',
        });
        result.priorityEntity = await resolveEntityId(hass, 'input_number', created.id);

        // `initial` waere zwecklos: HA verwirft es beim Laden wieder. Der
        // Startwert wird deshalb direkt gesetzt.
        await hass.callService('input_number', 'set_value', {
          entity_id: result.priorityEntity,
          value: index + 1,
        });
      }

      if (!device.auto_entity) {
        const created = await hass.callWS<CreatedItem>({
          type: 'input_boolean/create',
          name: helperName(device, fallback, 'Auto'),
          icon: 'mdi:robot',
        });
        result.autoEntity = await resolveEntityId(hass, 'input_boolean', created.id);

        // Standardmaessig nimmt ein Verbraucher an der Automatik teil.
        await hass.callService('input_boolean', 'turn_on', {
          entity_id: result.autoEntity,
        });
      }
    } catch (err) {
      result.error = err instanceof Error ? err.message : String(err);
    }

    results.push(result);
  }

  return results;
}

/** Traegt die angelegten Helfer in die Geraetekonfiguration ein. */
export function applyHelperResults(
  devices: DeviceConfig[],
  results: HelperResult[],
): DeviceConfig[] {
  const byIndex = new Map(results.map((result) => [result.index, result]));

  return devices.map((device, index) => {
    const result = byIndex.get(index);
    if (!result || result.error) return device;

    return {
      ...device,
      ...(result.priorityEntity ? { priority_entity: result.priorityEntity } : {}),
      ...(result.autoEntity ? { auto_entity: result.autoEntity } : {}),
    };
  });
}
