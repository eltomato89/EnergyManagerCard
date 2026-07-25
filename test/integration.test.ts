import { describe, expect, it } from 'vitest';
import {
  batteryReadingFromIntegration,
  findIntegration,
  surplusFromIntegration,
  trackedFromIntegration,
  viewsFromIntegration,
} from '../src/lib/integration';
import { makeHass, type EntitySpec, type RegistrySpec } from './fixtures/hass';

const NOW = Date.parse('2026-01-01T12:00:00.000Z');

/**
 * Baut ein hass-Objekt so auf, wie es die Energy-Manager-Integration
 * hinterlaesst: ein Hub-Geraet plus je Verbraucher ein Geraet, alle Rollen
 * ueber `translation_key` gekennzeichnet.
 */
function withIntegration(
  hubAttrs: Record<string, unknown>,
  consumers: Array<{
    deviceId: string;
    status: EntitySpec;
    lockedUntil?: EntitySpec;
    withHelpers?: boolean;
  }> = [],
) {
  const states: Record<string, EntitySpec> = {
    'sensor.energy_manager_surplus': { state: 2000, unit: 'W', attributes: hubAttrs },
    'switch.energy_manager_automation': { state: 'on' },
  };
  const registry: Record<string, RegistrySpec> = {
    'sensor.energy_manager_surplus': {
      platform: 'energy_manager',
      translation_key: 'surplus',
      device_id: 'hub',
    },
    'switch.energy_manager_automation': {
      platform: 'energy_manager',
      translation_key: 'automation',
      device_id: 'hub',
    },
  };

  for (const consumer of consumers) {
    const base = `${consumer.deviceId}`;
    states[`sensor.${base}_status`] = consumer.status;
    registry[`sensor.${base}_status`] = {
      platform: 'energy_manager',
      translation_key: 'status',
      device_id: consumer.deviceId,
    };

    if (consumer.lockedUntil) {
      states[`sensor.${base}_until`] = consumer.lockedUntil;
      registry[`sensor.${base}_until`] = {
        platform: 'energy_manager',
        translation_key: 'locked_until',
        device_id: consumer.deviceId,
      };
    }

    if (consumer.withHelpers !== false) {
      states[`number.${base}_priority`] = { state: 1 };
      registry[`number.${base}_priority`] = {
        platform: 'energy_manager',
        translation_key: 'priority',
        device_id: consumer.deviceId,
      };
      states[`switch.${base}_managed`] = { state: 'on' };
      registry[`switch.${base}_managed`] = {
        platform: 'energy_manager',
        translation_key: 'managed',
        device_id: consumer.deviceId,
      };
    }
  }

  return makeHass(states, registry);
}

function status(attrs: Record<string, unknown>, state = 'off_ready'): EntitySpec {
  return {
    state,
    attributes: {
      switch_entity: 'switch.wallbox',
      consumer_id: 'sub-1',
      consumer_name: 'Wallbox',
      rank: 1,
      managed: true,
      is_on: false,
      power_w: 0,
      required_w: 1500,
      headroom_w: 500,
      ...attrs,
    },
  };
}

describe('findIntegration', () => {
  it('gibt null zurueck, wenn die Integration nicht installiert ist', () => {
    expect(findIntegration(makeHass({}))).toBeNull();
  });

  it('gibt null zurueck, wenn hass noch nicht gesetzt ist', () => {
    expect(findIntegration(undefined)).toBeNull();
  });

  it('erkennt Hub und Verbraucher an ihren Rollen', () => {
    const hass = withIntegration({}, [{ deviceId: 'wallbox', status: status({}) }]);
    const handle = findIntegration(hass);

    expect(handle).not.toBeNull();
    expect(handle?.surplusEntity).toBe('sensor.energy_manager_surplus');
    expect(handle?.automationEntity).toBe('switch.energy_manager_automation');
    expect(handle?.devices).toHaveLength(1);
    expect(handle?.devices[0].roles.priority).toBe('number.wallbox_priority');
  });

  it('zaehlt den Hub nicht als Verbraucher', () => {
    // Der Hub hat selbst einen Status-Sensor — ohne die Ausnahme stuende er als
    // Verbraucher in der Liste.
    const hass = withIntegration({});
    hass.states['sensor.energy_manager_status'] = makeHass({
      'sensor.energy_manager_status': { state: 'active' },
    }).states['sensor.energy_manager_status'];
    (hass.entities as Record<string, unknown>)['sensor.energy_manager_status'] = {
      entity_id: 'sensor.energy_manager_status',
      platform: 'energy_manager',
      translation_key: 'status',
      device_id: 'hub',
    };

    expect(findIntegration(hass)?.devices).toEqual([]);
  });

  it('ignoriert Entitaeten anderer Integrationen', () => {
    const hass = withIntegration({});
    (hass.entities as Record<string, unknown>)['sensor.fremd'] = {
      entity_id: 'sensor.fremd',
      platform: 'demo',
      translation_key: 'status',
      device_id: 'fremdgeraet',
    };

    expect(findIntegration(hass)?.devices).toEqual([]);
  });
});

describe('surplusFromIntegration', () => {
  it('uebernimmt den gerechneten Wert statt neu zu rechnen', () => {
    const hass = withIntegration({
      grid_w: -2500,
      battery_w: 500,
      battery_correction_w: 500,
      battery_soc: 80,
      coverage: 1,
      smoothing_window: 60,
    });
    const surplus = surplusFromIntegration(hass, findIntegration(hass)!);

    expect(surplus.available).toBe(2000);
    expect(surplus.gridW).toBe(-2500);
    expect(surplus.batterySoc).toBe(80);
    expect(surplus.smoothingWindow).toBe(60);
    expect(surplus.degraded).toBe(false);
  });

  it('meldet einen unbrauchbaren Sensor als unbekannt, nicht als 0 W', () => {
    const hass = withIntegration({ errors: ['grid_unavailable'] });
    hass.states['sensor.energy_manager_surplus'].state = 'unknown';

    const surplus = surplusFromIntegration(hass, findIntegration(hass)!);
    expect(surplus.available).toBeNull();
    expect(surplus.errors).toContain('grid-unavailable');
  });

  it('reicht die Batterieleistung fuer das Badge durch', () => {
    const hass = withIntegration({ battery_w: -800 });
    expect(batteryReadingFromIntegration(hass, findIntegration(hass)!)).toEqual({ w: -800 });
  });

  it('meldet eine fehlende Batterie als fehlend', () => {
    const hass = withIntegration({});
    expect(batteryReadingFromIntegration(hass, findIntegration(hass)!).reason).toBe('missing');
  });
});

describe('trackedFromIntegration', () => {
  it('beobachtet auch den Schalter des echten Geraets', () => {
    // Er aendert sich, ohne dass eine Entitaet der Integration mitzieht — fehlt
    // er hier, sieht man das Schalten erst beim naechsten Zeittakt.
    const hass = withIntegration({}, [{ deviceId: 'wallbox', status: status({}) }]);
    const tracked = trackedFromIntegration(hass, findIntegration(hass)!);

    expect(tracked).toContain('sensor.energy_manager_surplus');
    expect(tracked).toContain('switch.energy_manager_automation');
    expect(tracked).toContain('sensor.wallbox_status');
    expect(tracked).toContain('number.wallbox_priority');
    expect(tracked).toContain('switch.wallbox');
  });

  it('kommt ohne Hauptschalter und ohne Verbraucher aus', () => {
    const hass = withIntegration({});
    delete (hass.entities as Record<string, unknown>)['switch.energy_manager_automation'];

    expect(trackedFromIntegration(hass, findIntegration(hass)!)).toEqual([
      'sensor.energy_manager_surplus',
    ]);
  });

  it('ueberspringt einen Verbraucher ohne Schalt-Entitaet', () => {
    const hass = withIntegration({}, [
      { deviceId: 'wallbox', status: status({ switch_entity: undefined }) },
    ]);
    expect(trackedFromIntegration(hass, findIntegration(hass)!)).not.toContain(undefined);
  });
});

describe('viewsFromIntegration', () => {
  it('baut die Verbraucherliste allein aus den Attributen', () => {
    const hass = withIntegration({}, [{ deviceId: 'wallbox', status: status({}) }]);
    const views = viewsFromIntegration(hass, findIntegration(hass)!, NOW);

    expect(views).toHaveLength(1);
    expect(views[0].name).toBe('Wallbox');
    expect(views[0].config.switch_entity).toBe('switch.wallbox');
    expect(views[0].status).toBe('off_ready');
    expect(views[0].requiredW).toBe(1500);
    expect(views[0].headroomW).toBe(500);
    expect(views[0].autoSwitchable).toBe(true);
  });

  it('sortiert nach dem Rang der Integration, nicht nach Fundreihenfolge', () => {
    const hass = withIntegration({}, [
      {
        deviceId: 'wallbox',
        status: status({ rank: 2, consumer_name: 'Wallbox', switch_entity: 'switch.wallbox' }),
      },
      {
        deviceId: 'heizstab',
        status: status({ rank: 1, consumer_name: 'Heizstab', switch_entity: 'switch.heizstab' }),
      },
    ]);
    const views = viewsFromIntegration(hass, findIntegration(hass)!, NOW);

    expect(views.map((v) => v.name)).toEqual(['Heizstab', 'Wallbox']);
  });

  it('ueberspringt einen Verbraucher ohne Schalt-Entitaet', () => {
    // Kann waehrend des Starts auftreten, bevor die Attribute stehen.
    const hass = withIntegration({}, [
      { deviceId: 'wallbox', status: status({ switch_entity: undefined }) },
    ]);
    expect(viewsFromIntegration(hass, findIntegration(hass)!, NOW)).toEqual([]);
  });

  it('nimmt die Sperrzeit aus dem Zeitstempel statt sie zu schaetzen', () => {
    // Das ist der Gewinn gegenueber last_changed: der exakte Zeitpunkt, den
    // manuelles Schalten und Neustarts nicht verfaelschen.
    const hass = withIntegration({}, [
      {
        deviceId: 'heizstab',
        status: status({}, 'off_ready'),
        lockedUntil: {
          state: new Date(NOW + 300_000).toISOString(),
          attributes: { lock_kind: 'min_off_time' },
        },
      },
    ]);
    const view = viewsFromIntegration(hass, findIntegration(hass)!, NOW)[0];

    expect(view.lock).toEqual({ kind: 'min_off_time', remainingS: 300 });
  });

  it('meldet eine abgelaufene Sperre als keine', () => {
    const hass = withIntegration({}, [
      {
        deviceId: 'heizstab',
        status: status({}),
        lockedUntil: { state: new Date(NOW - 1000).toISOString() },
      },
    ]);
    const view = viewsFromIntegration(hass, findIntegration(hass)!, NOW)[0];

    expect(view.lock.kind).toBe('none');
  });

  it('kommt mit einem leeren Zeitstempel zurecht', () => {
    // `unknown`, solange nie geschaltet wurde.
    const hass = withIntegration({}, [
      { deviceId: 'heizstab', status: status({}), lockedUntil: { state: 'unknown' } },
    ]);
    expect(viewsFromIntegration(hass, findIntegration(hass)!, NOW)[0].lock.kind).toBe('none');
  });

  it('erkennt einen ausgefallenen Verbraucher', () => {
    const hass = withIntegration({}, [{ deviceId: 'wallbox', status: status({}, 'unavailable') }]);
    const view = viewsFromIntegration(hass, findIntegration(hass)!, NOW)[0];

    expect(view.available).toBe(false);
  });
});
