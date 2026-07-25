import { describe, expect, it } from 'vitest';
import {
  collectWarnings,
  hasBattery,
  missingSource,
  resolveMeterMode,
  trackedEntities,
  validateConfig,
} from '../src/lib/validate';
import type { EnergyManagerCardConfig } from '../src/types/config';

function config(overrides: Partial<EnergyManagerCardConfig> = {}): EnergyManagerCardConfig {
  return {
    type: 'custom:energy-manager-card',
    grid_entity: 'sensor.netz',
    devices: [{ switch_entity: 'switch.a' }],
    ...overrides,
  };
}

describe('resolveMeterMode', () => {
  it('leitet den Modus aus den konfigurierten Entitaeten ab', () => {
    expect(resolveMeterMode({ grid_entity: 'sensor.netz' })).toBe('grid');
    expect(resolveMeterMode({ production_entity: 'sensor.pv' })).toBe('split');
  });

  it('respektiert eine ausdrueckliche Angabe', () => {
    expect(resolveMeterMode({ meter_mode: 'split', grid_entity: 'sensor.netz' })).toBe('split');
  });
});

describe('hasBattery', () => {
  it('erkennt jede Form der Batteriekonfiguration', () => {
    expect(hasBattery({ battery_power_entity: 'sensor.b' })).toBe(true);
    expect(hasBattery({ battery_charge_entity: 'sensor.b' })).toBe(true);
    expect(hasBattery({ battery_soc_entity: 'sensor.b' })).toBe(true);
    expect(hasBattery({})).toBe(false);
  });
});

describe('validateConfig', () => {
  it('akzeptiert eine vollstaendige Konfiguration', () => {
    expect(() => validateConfig(config())).not.toThrow();
  });

  it('weist eine Geraeteliste zurueck, die keine Liste ist', () => {
    expect(() => validateConfig({ ...config(), devices: 'switch.a' as never })).toThrow(/devices/);
  });

  it('nimmt eine Karte ganz ohne Felder an', () => {
    // Lovelace ruft setConfig VOR dem hass-Setter — dort ist nicht zu sehen, ob
    // die Integration laeuft und die Sensoren stellt. Wuerde hier geworfen,
    // waere jede Karte ohne eigene Sensoren dauerhaft eine Fehlerkarte.
    expect(() => validateConfig({ type: 'custom:energy-manager-card' })).not.toThrow();
  });

  it('meldet fehlende Sensoren stattdessen ueber missingSource', () => {
    // Dieselbe Prüfung, nur verschoben: sie greift beim Rendern, wo feststeht,
    // ob die Integration die Sensoren stellt.
    expect(missingSource(config({ grid_entity: undefined, meter_mode: 'grid' }))).toBe('grid');
    expect(missingSource(config({ grid_entity: undefined, meter_mode: 'split' }))).toBe('split');
    expect(
      missingSource(
        config({ grid_entity: undefined, meter_mode: 'split', production_entity: 'sensor.pv' }),
      ),
    ).toBe('split');
  });

  it('meldet nichts, sobald die Sensoren vollstaendig sind', () => {
    expect(missingSource(config())).toBeNull();
    expect(
      missingSource(
        config({
          grid_entity: undefined,
          meter_mode: 'split',
          production_entity: 'sensor.pv',
          consumption_entity: 'sensor.haus',
        }),
      ),
    ).toBeNull();
  });

  it('nennt den Index eines Geraets ohne Schalt-Entity', () => {
    expect(() =>
      validateConfig(config({ devices: [{ switch_entity: 'switch.a' }, { switch_entity: '' }] })),
    ).toThrow(/devices\[1\]/);
  });

  it('laesst eine leere Geraeteliste zu', () => {
    // Ein frisch aus dem Picker eingefuegte Karte hat noch keine Geraete.
    expect(() => validateConfig(config({ devices: [] }))).not.toThrow();
  });

  it('prueft den Wertebereich von battery_min_soc', () => {
    expect(() => validateConfig(config({ battery_min_soc: 150 }))).toThrow(/battery_min_soc/);
    expect(() => validateConfig(config({ battery_min_soc: -1 }))).toThrow(/battery_min_soc/);
    expect(() => validateConfig(config({ battery_min_soc: 20 }))).not.toThrow();
  });

  it('wirft ohne Konfiguration', () => {
    expect(() => validateConfig(undefined)).toThrow();
  });
});

describe('collectWarnings', () => {
  it('warnt vor Geraeten, deren Bedarf nur geraten werden kann', () => {
    const warnings = collectWarnings(
      config({ devices: [{ switch_entity: 'switch.a', name: 'Pumpe' }] }),
    );
    expect(warnings).toContainEqual({
      code: 'device-no-power-estimate',
      deviceIndex: 0,
      detail: 'Pumpe',
    });
  });

  it('schweigt, sobald eine Leistungsangabe vorliegt', () => {
    const codes = collectWarnings(
      config({ devices: [{ switch_entity: 'switch.a', max_power: 2000 }] }),
    ).map((w) => w.code);
    expect(codes).not.toContain('device-no-power-estimate');
  });

  it('warnt bei min_power ueber max_power', () => {
    const codes = collectWarnings(
      config({ devices: [{ switch_entity: 'switch.a', min_power: 3000, max_power: 2000 }] }),
    ).map((w) => w.code);
    expect(codes).toContain('min-power-above-max');
  });

  it('warnt bei leerer Geraeteliste', () => {
    expect(collectWarnings(config({ devices: [] })).map((w) => w.code)).toContain('no-devices');
  });

  it('warnt bei Ladestand ohne Leistungssensor', () => {
    const codes = collectWarnings(config({ battery_soc_entity: 'sensor.soc' })).map((w) => w.code);
    expect(codes).toContain('battery-soc-without-power');
  });

  it('warnt vor einem wirkungslosen Mittelungsfenster', () => {
    const codes = collectWarnings(config({ smoothing_window: 5, update_interval: 30 })).map(
      (w) => w.code,
    );
    expect(codes).toContain('smoothing-below-interval');
  });

  it('warnt vor teilweise ausgestatteten Prioritäts-Helfern', () => {
    const codes = collectWarnings(
      config({
        devices: [
          { switch_entity: 'switch.a', max_power: 100, priority_entity: 'input_number.a' },
          { switch_entity: 'switch.b', max_power: 100 },
        ],
      }),
    ).map((w) => w.code);
    expect(codes).toContain('mixed-priority-entities');
  });

  it('schweigt, wenn alle oder keiner einen Prioritäts-Helfer hat', () => {
    const alle = collectWarnings(
      config({
        devices: [
          { switch_entity: 'switch.a', max_power: 100, priority_entity: 'input_number.a' },
          { switch_entity: 'switch.b', max_power: 100, priority_entity: 'input_number.b' },
        ],
      }),
    ).map((w) => w.code);
    expect(alle).not.toContain('mixed-priority-entities');

    const keiner = collectWarnings(
      config({ devices: [{ switch_entity: 'switch.a', max_power: 100 }] }),
    ).map((w) => w.code);
    expect(keiner).not.toContain('mixed-priority-entities');
  });

  it('warnt, wenn Sortieren ohne vollständige Helfer eingeschaltet ist', () => {
    const codes = collectWarnings(
      config({
        allow_reorder: true,
        devices: [{ switch_entity: 'switch.a', max_power: 100 }],
      }),
    ).map((w) => w.code);
    expect(codes).toContain('reorder-without-priority-entities');
  });

  it('meldet nichts bei sinnvoller Konfiguration', () => {
    const warnings = collectWarnings(
      config({
        devices: [{ switch_entity: 'switch.a', max_power: 2000 }],
        smoothing_window: 60,
        update_interval: 5,
      }),
    );
    expect(warnings).toEqual([]);
  });
});

describe('trackedEntities', () => {
  it('sammelt alle Entitaeten, die die Karte betreffen', () => {
    const ids = trackedEntities(
      config({
        battery_soc_entity: 'sensor.soc',
        battery_power_entity: 'sensor.bat',
        devices: [
          { switch_entity: 'switch.a', power_entity: 'sensor.a' },
          { switch_entity: 'switch.b' },
        ],
      }),
    );

    expect(ids).toEqual(
      new Set(['sensor.netz', 'sensor.soc', 'sensor.bat', 'switch.a', 'sensor.a', 'switch.b']),
    );
  });

  it('kommt mit fehlender Geraeteliste zurecht', () => {
    const ids = trackedEntities({ ...config(), devices: undefined as never });
    expect(ids).toEqual(new Set(['sensor.netz']));
  });
});
