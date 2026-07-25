import { describe, expect, it } from 'vitest';
import { computeDeviceViews, computeGrossSurplus, resolveScaleMax } from '../src/lib/device-status';
import type { DeviceConfig } from '../src/types/config';
import { makeHass } from './fixtures/hass';

const NOW = Date.parse('2026-07-25T12:00:00.000Z');

function device(overrides: Partial<DeviceConfig> & { switch_entity: string }): DeviceConfig {
  return { ...overrides };
}

describe('computeDeviceViews — Budgetkaskade', () => {
  it('gibt den Ueberschuss nur einmal aus, statt ihn jedem Geraet zu versprechen', () => {
    const devices = Array.from({ length: 5 }, (_, i) =>
      device({ switch_entity: `switch.g${i}`, max_power: 1500 }),
    );
    const hass = makeHass(
      Object.fromEntries(devices.map((d) => [d.switch_entity, { state: 'off' }])),
    );

    const views = computeDeviceViews(devices, hass, 2000, NOW);

    expect(views.filter((v) => v.status === 'off_ready')).toHaveLength(1);
    expect(views[0].status).toBe('off_ready');
    // Rest: 500 W. Fuer 1500 W reicht das nicht, ist aber auch nicht "fast".
    expect(views[1].status).toBe('off_insufficient');
  });

  it('folgt der Config-Reihenfolge als Prioritaet', () => {
    const klein = device({ switch_entity: 'switch.klein', max_power: 500 });
    const gross = device({ switch_entity: 'switch.gross', max_power: 1500 });
    const hass = makeHass({ 'switch.klein': { state: 'off' }, 'switch.gross': { state: 'off' } });

    // 1600 W reichen fuer jedes der beiden Geraete allein, aber nicht fuer beide.
    // Wer zuerst in der Liste steht, bekommt sie.
    const kleinZuerst = computeDeviceViews([klein, gross], hass, 1600, NOW);
    expect(kleinZuerst[0].status).toBe('off_ready');
    expect(kleinZuerst[1].status).toBe('off_insufficient'); // Rest 1100 W < 1500 W

    const grossZuerst = computeDeviceViews([gross, klein], hass, 1600, NOW);
    expect(grossZuerst[0].status).toBe('off_ready');
    expect(grossZuerst[1].status).toBe('off_insufficient'); // Rest 100 W < 500 W
  });

  it('markiert knapp verfehlte Geraete als off_close', () => {
    const devices = [device({ switch_entity: 'switch.a', max_power: 1000 })];
    const hass = makeHass({ 'switch.a': { state: 'off' } });

    expect(computeDeviceViews(devices, hass, 850, NOW)[0].status).toBe('off_close');
    expect(computeDeviceViews(devices, hass, 750, NOW)[0].status).toBe('off_insufficient');
  });

  it('laesst eingeschaltete Geraete kein Budget verbrauchen', () => {
    // Der Verbrauch eines laufenden Geraets steckt bereits im Ueberschuss.
    const devices = [
      device({ switch_entity: 'switch.laeuft', max_power: 1500 }),
      device({ switch_entity: 'switch.wartet', max_power: 1000 }),
    ];
    const hass = makeHass({ 'switch.laeuft': { state: 'on' }, 'switch.wartet': { state: 'off' } });

    const views = computeDeviceViews(devices, hass, 1200, NOW);

    expect(views[0].status).toBe('on_ok');
    expect(views[1].status).toBe('off_ready');
  });

  it('meldet ein laufendes Geraet bei Netzbezug als Defizit', () => {
    const devices = [device({ switch_entity: 'switch.a' })];
    const hass = makeHass({ 'switch.a': { state: 'on' } });

    expect(computeDeviceViews(devices, hass, -300, NOW)[0].status).toBe('on_deficit');
  });

  it('nutzt die Hysterese als Totband um den Nullpunkt', () => {
    const devices = [device({ switch_entity: 'switch.a', hysteresis: 300 })];
    const hass = makeHass({ 'switch.a': { state: 'on' } });

    expect(computeDeviceViews(devices, hass, -250, NOW)[0].status).toBe('on_ok');
    expect(computeDeviceViews(devices, hass, -400, NOW)[0].status).toBe('on_deficit');
  });
});

describe('computeDeviceViews — Bedarfsschaetzung', () => {
  it('zieht min_power der Nennleistung vor', () => {
    const devices = [device({ switch_entity: 'switch.a', min_power: 800, max_power: 3000 })];
    const hass = makeHass({ 'switch.a': { state: 'off' } });
    expect(computeDeviceViews(devices, hass, 0, NOW)[0].requiredW).toBe(800);
  });

  it('faellt auf die gemessene Leistung zurueck', () => {
    const devices = [device({ switch_entity: 'switch.a', power_entity: 'sensor.a' })];
    const hass = makeHass({
      'switch.a': { state: 'on' },
      'sensor.a': { state: 1.2, unit: 'kW' },
    });
    const view = computeDeviceViews(devices, hass, 0, NOW)[0];
    expect(view.powerW).toBe(1200);
    expect(view.requiredW).toBe(1200);
  });

  it('nimmt einen konservativen Vorgabewert, wenn nichts bekannt ist', () => {
    const devices = [device({ switch_entity: 'switch.a' })];
    const hass = makeHass({ 'switch.a': { state: 'off' } });
    expect(computeDeviceViews(devices, hass, 0, NOW)[0].requiredW).toBe(500);
  });
});

describe('computeDeviceViews — fehlende Daten', () => {
  it('markiert Geraete ohne Schalt-Entity als unavailable', () => {
    const devices = [device({ switch_entity: 'switch.gibtsnicht' })];
    const view = computeDeviceViews(devices, makeHass({}), 5000, NOW)[0];
    expect(view.status).toBe('unavailable');
    expect(view.available).toBe(false);
  });

  it('markiert alles als unavailable, solange der Ueberschuss unbekannt ist', () => {
    const devices = [device({ switch_entity: 'switch.a' })];
    const hass = makeHass({ 'switch.a': { state: 'off' } });
    expect(computeDeviceViews(devices, hass, null, NOW)[0].status).toBe('unavailable');
  });

  it('laesst powerW null, wenn der Leistungssensor ausfaellt', () => {
    const devices = [device({ switch_entity: 'switch.a', power_entity: 'sensor.a' })];
    const hass = makeHass({
      'switch.a': { state: 'on' },
      'sensor.a': { state: 'unavailable', unit: 'W' },
    });
    expect(computeDeviceViews(devices, hass, 100, NOW)[0].powerW).toBeNull();
  });

  it('nimmt den friendly_name, wenn kein Name konfiguriert ist', () => {
    const devices = [device({ switch_entity: 'switch.a' })];
    const hass = makeHass({ 'switch.a': { state: 'off', friendlyName: 'Wallbox' } });
    expect(computeDeviceViews(devices, hass, 0, NOW)[0].name).toBe('Wallbox');
  });

  it('laesst den konfigurierten Namen gewinnen', () => {
    const devices = [device({ switch_entity: 'switch.a', name: 'Eigener Name' })];
    const hass = makeHass({ 'switch.a': { state: 'off', friendlyName: 'Wallbox' } });
    expect(computeDeviceViews(devices, hass, 0, NOW)[0].name).toBe('Eigener Name');
  });
});

describe('computeDeviceViews — Automatik-Teilnahme', () => {
  it('liest die Teilnahme aus dem Helfer', () => {
    const devices = [device({ switch_entity: 'switch.a', auto_entity: 'input_boolean.a' })];
    const hass = makeHass({
      'switch.a': { state: 'off' },
      'input_boolean.a': { state: 'off' },
    });

    const view = computeDeviceViews(devices, hass, 1000, NOW)[0];
    expect(view.managed).toBe(false);
    expect(view.autoSwitchable).toBe(true);
  });

  it('fällt ohne Helfer auf das statische managed zurück', () => {
    const hass = makeHass({ 'switch.a': { state: 'off' } });

    expect(
      computeDeviceViews([device({ switch_entity: 'switch.a', managed: false })], hass, 0, NOW)[0]
        .managed,
    ).toBe(false);
    expect(
      computeDeviceViews([device({ switch_entity: 'switch.a' })], hass, 0, NOW)[0].managed,
    ).toBe(true);
  });

  it('meldet einen ausgefallenen Helfer als nicht schaltbar', () => {
    const devices = [device({ switch_entity: 'switch.a', auto_entity: 'input_boolean.a' })];
    const hass = makeHass({
      'switch.a': { state: 'off' },
      'input_boolean.a': { state: 'unavailable' },
    });

    const view = computeDeviceViews(devices, hass, 0, NOW)[0];
    expect(view.autoSwitchable).toBe(false);
    expect(view.managed).toBe(true); // Rückfall auf den Standard
  });

  it('lässt ein nicht verwaltetes Gerät weiterhin in der Ampel erscheinen', () => {
    // Wer nicht an der Automatik teilnimmt, soll trotzdem sehen, ob der
    // Überschuss reichen würde — sonst ist die Anzeige wertlos.
    const devices = [
      device({ switch_entity: 'switch.a', auto_entity: 'input_boolean.a', max_power: 500 }),
    ];
    const hass = makeHass({
      'switch.a': { state: 'off' },
      'input_boolean.a': { state: 'off' },
    });

    expect(computeDeviceViews(devices, hass, 1000, NOW)[0].status).toBe('off_ready');
  });
});

describe('computeDeviceViews — Reihenfolge aus Prioritäts-Helfern', () => {
  it('verteilt das Budget nach Helferwert, nicht nach Array-Position', () => {
    const devices = [
      device({
        switch_entity: 'switch.spaet',
        priority_entity: 'input_number.spaet',
        max_power: 900,
      }),
      device({
        switch_entity: 'switch.frueh',
        priority_entity: 'input_number.frueh',
        max_power: 900,
      }),
    ];
    const hass = makeHass({
      'switch.spaet': { state: 'off' },
      'switch.frueh': { state: 'off' },
      'input_number.spaet': { state: 2 },
      'input_number.frueh': { state: 1 },
    });

    // 1000 W reichen nur für eines der beiden.
    const views = computeDeviceViews(devices, hass, 1000, NOW);

    expect(views[0].config.switch_entity).toBe('switch.frueh');
    expect(views[0].status).toBe('off_ready');
    expect(views[1].status).toBe('off_insufficient');
    // configIndex bleibt die Array-Position, index der Rang.
    expect(views[0].configIndex).toBe(1);
    expect(views[0].index).toBe(0);
  });
});

describe('computeGrossSurplus', () => {
  it('rechnet die laufenden Verbraucher zurueck', () => {
    const devices = [
      device({ switch_entity: 'switch.a', power_entity: 'sensor.a' }),
      device({ switch_entity: 'switch.b', power_entity: 'sensor.b' }),
    ];
    const hass = makeHass({
      'switch.a': { state: 'on' },
      'sensor.a': { state: 900, unit: 'W' },
      'switch.b': { state: 'off' },
      'sensor.b': { state: 0, unit: 'W' },
    });

    const views = computeDeviceViews(devices, hass, 1200, NOW);
    expect(computeGrossSurplus(views, 1200)).toEqual({ grossW: 2100, allocatedW: 900 });
  });

  it('liefert grossW null, wenn der Ueberschuss unbekannt ist', () => {
    expect(computeGrossSurplus([], null)).toEqual({ grossW: null, allocatedW: 0 });
  });
});

describe('resolveScaleMax', () => {
  it('nimmt den konfigurierten Wert unveraendert', () => {
    expect(resolveScaleMax([], 8000, 500)).toBe(8000);
  });

  it('haelt eine Untergrenze ein', () => {
    expect(resolveScaleMax([], undefined, 0)).toBe(3000);
  });

  it('leitet die Skala aus den Nennleistungen ab und rastert sie', () => {
    const devices = [
      device({ switch_entity: 'switch.a', max_power: 11000 }),
      device({ switch_entity: 'switch.b', max_power: 2200 }),
    ];
    expect(resolveScaleMax(devices, undefined, 0)).toBe(13500);
  });

  it('waechst mit, wenn der Ueberschuss die Nennleistungen uebersteigt', () => {
    expect(resolveScaleMax([], undefined, 7100)).toBe(7500);
  });
});
