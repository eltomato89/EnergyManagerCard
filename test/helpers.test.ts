import { describe, expect, it, vi } from 'vitest';
import { applyHelperResults, canCreateHelpers, createMissingHelpers } from '../src/lib/helpers';
import type { DeviceConfig } from '../src/types/config';
import type { HomeAssistant } from '../src/types/hass';

interface Call {
  domain: string;
  service: string;
  data: Record<string, unknown>;
}

/** hass-Attrappe, die Create-Aufrufe protokolliert und IDs vergibt. */
function fakeHass(options: { admin?: boolean; failOn?: string; registry?: unknown[] } = {}) {
  const wsCalls: Array<Record<string, unknown>> = [];
  const serviceCalls: Call[] = [];

  const hass = {
    user: { is_admin: options.admin ?? true },
    callWS: vi.fn(async (msg: Record<string, unknown>) => {
      wsCalls.push(msg);
      if (msg.type === 'config/entity_registry/list') return options.registry ?? [];
      if (options.failOn && msg.type === options.failOn) throw new Error('nicht erlaubt');
      // HA leitet die id aus slugify(name) ab.
      const name = String(msg.name ?? '');
      return {
        id: name
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '_')
          .replace(/^_|_$/g, ''),
      };
    }),
    callService: vi.fn(async (domain: string, service: string, data: Record<string, unknown>) => {
      serviceCalls.push({ domain, service, data });
    }),
  } as unknown as HomeAssistant;

  return { hass, wsCalls, serviceCalls };
}

describe('canCreateHelpers', () => {
  it('erlaubt es nur Administratoren', () => {
    expect(canCreateHelpers(fakeHass({ admin: true }).hass)).toBe(true);
    expect(canCreateHelpers(fakeHass({ admin: false }).hass)).toBe(false);
    expect(canCreateHelpers(undefined)).toBe(false);
  });
});

describe('createMissingHelpers', () => {
  it('legt für jeden Verbraucher beide Helfer an', async () => {
    const { hass, wsCalls } = fakeHass();
    const devices: DeviceConfig[] = [{ switch_entity: 'switch.pumpe', name: 'Poolpumpe' }];

    const results = await createMissingHelpers(hass, devices);

    expect(wsCalls.filter((c) => c.type === 'input_number/create')).toHaveLength(1);
    expect(wsCalls.filter((c) => c.type === 'input_boolean/create')).toHaveLength(1);
    expect(results[0].priorityEntity).toContain('input_number.');
    expect(results[0].autoEntity).toContain('input_boolean.');
    expect(results[0].error).toBeUndefined();
  });

  it('vermeidet Umlaute im Namen, weil daraus die entity_id entsteht', () => {
    // "Priorität" ergäbe per slugify input_number.*_priorit_t.
    const { hass, wsCalls } = fakeHass();
    return createMissingHelpers(hass, [{ switch_entity: 'switch.a', name: 'Pumpe' }]).then(() => {
      const names = wsCalls
        .filter((c) => String(c.type).endsWith('/create'))
        .map((c) => String(c.name));
      expect(names.every((n) => /^[\x20-\x7E]+$/.test(n))).toBe(true);
      expect(names).toContain('EMC Pumpe Prio');
      expect(names).toContain('EMC Pumpe Auto');
    });
  });

  it('lässt vorhandene Helfer unangetastet', async () => {
    const { hass, wsCalls } = fakeHass();
    const devices: DeviceConfig[] = [
      {
        switch_entity: 'switch.a',
        priority_entity: 'input_number.schon_da',
        auto_entity: 'input_boolean.schon_da',
      },
    ];

    const results = await createMissingHelpers(hass, devices);

    expect(wsCalls.filter((c) => String(c.type).endsWith('/create'))).toHaveLength(0);
    expect(results[0].priorityEntity).toBeUndefined();
  });

  it('ergänzt nur den fehlenden der beiden', async () => {
    const { hass, wsCalls } = fakeHass();
    const devices: DeviceConfig[] = [
      { switch_entity: 'switch.a', priority_entity: 'input_number.schon_da' },
    ];

    await createMissingHelpers(hass, devices);

    expect(wsCalls.filter((c) => c.type === 'input_number/create')).toHaveLength(0);
    expect(wsCalls.filter((c) => c.type === 'input_boolean/create')).toHaveLength(1);
  });

  it('wählt den Wertebereich groß genug für alle Verbraucher', async () => {
    // input_number clampt nicht, sondern weist Werte außerhalb des Bereichs ab.
    const { hass, wsCalls } = fakeHass();
    const devices: DeviceConfig[] = Array.from({ length: 12 }, (_, i) => ({
      switch_entity: `switch.g${i}`,
    }));

    await createMissingHelpers(hass, devices);

    const create = wsCalls.find((c) => c.type === 'input_number/create');
    expect(Number(create?.max)).toBeGreaterThanOrEqual(12);
    expect(create?.min).toBe(1);
  });

  it('setzt Startwerte, weil initial einen Neustart nicht überlebt', async () => {
    const { hass, serviceCalls } = fakeHass();
    const devices: DeviceConfig[] = [{ switch_entity: 'switch.a' }, { switch_entity: 'switch.b' }];

    await createMissingHelpers(hass, devices);

    const values = serviceCalls.filter((c) => c.service === 'set_value').map((c) => c.data.value);
    expect(values).toEqual([1, 2]);
    // Automatik ist standardmäßig eingeschaltet.
    expect(serviceCalls.filter((c) => c.service === 'turn_on')).toHaveLength(2);
  });

  it('löst die entity_id über die Registry auf, wenn sie abweicht', async () => {
    const { hass } = fakeHass({
      registry: [
        {
          entity_id: 'input_number.eigener_name',
          platform: 'input_number',
          unique_id: 'emc_poolpumpe_prio',
        },
      ],
    });
    const devices: DeviceConfig[] = [{ switch_entity: 'switch.a', name: 'Poolpumpe' }];

    const results = await createMissingHelpers(hass, devices);
    // slugify der Attrappe erzeugt genau diese unique_id.
    expect(results[0].priorityEntity).toBe('input_number.eigener_name');
  });

  it('meldet Fehler je Verbraucher, statt alles abzubrechen', async () => {
    const { hass } = fakeHass({ failOn: 'input_number/create' });
    const devices: DeviceConfig[] = [{ switch_entity: 'switch.a' }];

    const results = await createMissingHelpers(hass, devices);

    expect(results[0].error).toBeTruthy();
    expect(results).toHaveLength(1);
  });
});

describe('applyHelperResults', () => {
  it('trägt die angelegten Helfer ein', () => {
    const devices: DeviceConfig[] = [{ switch_entity: 'switch.a' }];
    const next = applyHelperResults(devices, [
      { index: 0, priorityEntity: 'input_number.a', autoEntity: 'input_boolean.a' },
    ]);

    expect(next[0].priority_entity).toBe('input_number.a');
    expect(next[0].auto_entity).toBe('input_boolean.a');
  });

  it('lässt fehlgeschlagene Einträge unverändert', () => {
    const devices: DeviceConfig[] = [{ switch_entity: 'switch.a' }];
    const next = applyHelperResults(devices, [
      { index: 0, priorityEntity: 'input_number.a', error: 'kaputt' },
    ]);

    expect(next[0].priority_entity).toBeUndefined();
  });

  it('verändert das Original nicht', () => {
    const devices: DeviceConfig[] = [{ switch_entity: 'switch.a' }];
    applyHelperResults(devices, [{ index: 0, priorityEntity: 'input_number.a' }]);
    expect(devices[0].priority_entity).toBeUndefined();
  });

  it('kommt mit unvollständigen Ergebnissen zurecht', () => {
    const devices: DeviceConfig[] = [{ switch_entity: 'switch.a' }, { switch_entity: 'switch.b' }];
    const next = applyHelperResults(devices, [{ index: 1, autoEntity: 'input_boolean.b' }]);

    expect(next[0].auto_entity).toBeUndefined();
    expect(next[1].auto_entity).toBe('input_boolean.b');
  });
});
