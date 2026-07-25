import type { HassEntity, HomeAssistant } from '../../src/types/hass';

export interface EntitySpec {
  state: string | number;
  unit?: string;
  friendlyName?: string;
  /** ISO-String oder ms seit Epoch. */
  lastChanged?: string | number;
  attributes?: Record<string, unknown>;
}

export function makeEntity(entityId: string, spec: EntitySpec): HassEntity {
  const lastChanged =
    typeof spec.lastChanged === 'number'
      ? new Date(spec.lastChanged).toISOString()
      : (spec.lastChanged ?? '2026-01-01T00:00:00.000Z');

  return {
    entity_id: entityId,
    state: String(spec.state),
    last_changed: lastChanged,
    last_updated: lastChanged,
    context: { id: 'test', parent_id: null, user_id: null },
    attributes: {
      ...(spec.unit !== undefined ? { unit_of_measurement: spec.unit } : {}),
      ...(spec.friendlyName !== undefined ? { friendly_name: spec.friendlyName } : {}),
      ...spec.attributes,
    },
  } as HassEntity;
}

/** Ein Eintrag im Entitaetsregister, wie ihn `hass.entities` fuehrt. */
export interface RegistrySpec {
  platform: string;
  translation_key?: string;
  device_id?: string;
}

/** Minimales hass-Objekt: nur was der Rechenkern tatsaechlich anfasst. */
export function makeHass(
  entities: Record<string, EntitySpec>,
  registry: Record<string, RegistrySpec> = {},
): HomeAssistant {
  const states: Record<string, HassEntity> = {};
  for (const [entityId, spec] of Object.entries(entities)) {
    states[entityId] = makeEntity(entityId, spec);
  }

  const registered: Record<string, unknown> = {};
  for (const [entityId, spec] of Object.entries(registry)) {
    registered[entityId] = { entity_id: entityId, ...spec };
  }

  return {
    states,
    entities: registered,
    locale: { language: 'de', number_format: 'comma_decimal', time_format: '24' },
    language: 'de',
  } as unknown as HomeAssistant;
}
