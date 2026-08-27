import { describe, expect, it } from 'vitest';
import { viewsFromIntegration, findIntegration } from '../src/lib/integration';
import { HANDS_OFF_BLOCKERS } from '../src/types/runtime';
import { makeHass, type EntitySpec, type RegistrySpec } from './fixtures/hass';

const NOW = Date.parse('2026-01-01T12:00:00.000Z');

/**
 * Die Stufenangaben eines regelbaren Verbrauchers, wie die Integration sie am
 * Ampel-Sensor hinterlaesst.
 *
 * Der Kern der Zusage: Die Karte leitet das Raster **nicht** selbst ab. Sie
 * kennt weder die Steuerentitaet noch die Umrechnung von Ampere in Watt —
 * beides laege sonst an zwei Stellen und liefe auseinander.
 */
function withConsumer(attrs: Record<string, unknown>, state = 'on_ok') {
  const states: Record<string, EntitySpec> = {
    'sensor.energy_manager_surplus': { state: 2000, unit: 'W', attributes: {} },
    'sensor.wallbox_status': {
      state,
      attributes: {
        switch_entity: 'switch.wallbox',
        consumer_id: 'sub-1',
        consumer_name: 'Wallbox',
        rank: 1,
        managed: true,
        is_on: true,
        power_w: 4800,
        required_w: 4140,
        headroom_w: 0,
        ...attrs,
      },
    },
  };
  const registry: Record<string, RegistrySpec> = {
    'sensor.energy_manager_surplus': {
      platform: 'energy_manager',
      translation_key: 'surplus',
      device_id: 'hub',
    },
    'sensor.wallbox_status': {
      platform: 'energy_manager',
      translation_key: 'status',
      device_id: 'wallbox',
    },
  };
  return makeHass(states, registry);
}

function view(attrs: Record<string, unknown>, state = 'on_ok') {
  const hass = withConsumer(attrs, state);
  const handle = findIntegration(hass);
  if (!handle) throw new Error('Integration nicht gefunden');
  return viewsFromIntegration(hass, handle, NOW)[0];
}

const LADDER = {
  level_source: 'number_a',
  level_count: 11,
  min_level_w: 4140,
  max_level_w: 11040,
  level_w: 6900,
  level_index: 5,
  setpoint_w: 7590,
  observed_max_w: null,
  level_capped: false,
};

describe('Stufen aus der Integration', () => {
  it('uebernimmt das Raster unveraendert', () => {
    const levels = view(LADDER).levels;

    expect(levels).toEqual({
      source: 'number_a',
      count: 11,
      minW: 4140,
      maxW: 11040,
      w: 6900,
      setpointW: 7590,
      index: 5,
      observedMaxW: null,
      capped: false,
    });
  });

  it('uebernimmt die beobachtete Grenze', () => {
    // Die Karte leitet sie nicht ab: Ob eine Last dem Sollwert folgt, sieht nur
    // die Integration — sie kennt den Verlauf ueber die Zeit.
    const levels = view({ ...LADDER, observed_max_w: 6900, level_capped: true }).levels;

    expect(levels?.observedMaxW).toBe(6900);
    expect(levels?.capped).toBe(true);
  });

  it('fehlt bei einem rein schaltbaren Verbraucher', () => {
    // Die Integration laesst die Angaben dann ganz weg. Daran — nicht an
    // consumer_type — erkennt die Zeile, dass es nichts zu regeln gibt.
    expect(view({}).levels).toBeUndefined();
  });

  it('fehlt bei einer aelteren Integration ohne diese Attribute', () => {
    // Weniger Anzeige statt eines Fehlers: dieselbe Regel wie bei der
    // Batteriezeile.
    expect(view({ level_source: 'number_a' }).levels).toBeUndefined();
  });

  it('nimmt eine unlesbare Stufe als null, nicht als 0', () => {
    // Eine Auswahlliste in der Aus-Stellung hat keine Stufe. Eine 0 hiesse
    // "laeuft mit null Watt" und ist etwas anderes als "nicht bekannt".
    const levels = view({ ...LADDER, level_w: null, level_index: null }).levels;

    expect(levels?.w).toBeNull();
    expect(levels?.index).toBeNull();
  });

  it('uebernimmt den Blockierungsgrund', () => {
    expect(view({ ...LADDER, blocked_by: 'level_hold' }).blockedBy).toBe('level_hold');
  });

  it('laesst den Grund weg, wenn keiner anliegt', () => {
    expect(view({ ...LADDER, blocked_by: null }).blockedBy).toBeUndefined();
  });
});

describe('HANDS_OFF_BLOCKERS', () => {
  it('enthaelt die Gruende, bei denen die Automatik absichtlich nichts tut', () => {
    expect([...HANDS_OFF_BLOCKERS].sort()).toEqual([
      'forced',
      'manual',
      'not_managed',
      'unavailable',
    ]);
  });

  it('enthaelt die Zeitbedingungen des Normalbetriebs nicht', () => {
    // Waeren sie dabei, wuerde der Statusbalken bei jedem gewoehnlichen
    // Schaltvorgang kurz grau: turn_on_delay laeuft vor jedem Einschalten,
    // settling nach jedem. Grau heisst "hier greift die Automatik nicht ein",
    // nicht "sie wartet gerade".
    for (const grund of [
      'settling',
      'turn_on_delay',
      'turn_off_delay',
      'min_runtime',
      'min_off_time',
      'level_hold',
    ]) {
      expect(HANDS_OFF_BLOCKERS.has(grund)).toBe(false);
    }
  });
});

describe('Manuelle Uebersteuerung', () => {
  it('rechnet den Zeitstempel in verbleibende Sekunden um', () => {
    // Die Integration liefert den Endzeitpunkt, nicht die Restdauer: Ein
    // Zeitstempel bleibt richtig, waehrend eine Restdauer mit jeder Sekunde
    // veraltet — und die Karte zeichnet nicht jede Sekunde neu.
    const bis = new Date(NOW + 90_000).toISOString();

    expect(view({ manual_until: bis }).manualRemainingS).toBe(90);
  });

  it('ist 0, wenn die Sperre abgelaufen ist', () => {
    const vorbei = new Date(NOW - 5_000).toISOString();

    expect(view({ manual_until: vorbei }).manualRemainingS).toBe(0);
  });

  it('ist 0 ohne Sperre', () => {
    expect(view({ manual_until: null }).manualRemainingS).toBe(0);
    expect(view({}).manualRemainingS).toBe(0);
  });

  it('daempft den Statusbalken', () => {
    // Der Grund gehoert zu denen, bei denen die Automatik absichtlich nichts
    // tut — anders als die Zeitbedingungen des Normalbetriebs.
    expect(HANDS_OFF_BLOCKERS.has('manual')).toBe(true);
  });
});

describe('Tagesziel', () => {
  it('uebernimmt Ziel, Fortschritt und Prognose', () => {
    const daily = view({
      daily_target_kwh: 3,
      daily_done_kwh: 1.2,
      daily_forecast_kwh: 5,
      must_run: false,
    }).daily;

    expect(daily).toEqual({
      targetKwh: 3,
      doneKwh: 1.2,
      forecastKwh: 5,
      targetH: null,
      doneH: null,
      mustRun: false,
    });
  });

  it('uebernimmt die Stunden eines schaltbaren Verbrauchers', () => {
    // Eingetragen sind dort Stunden. Die Umrechnung macht die Integration —
    // sie kennt die angenommene Leistung, mit der sie das Ziel selbst in kWh
    // umgerechnet hat, und die Karte kennt sie nicht.
    const daily = view({
      daily_target_kwh: 3,
      daily_done_kwh: 0.5,
      daily_target_h: 6,
      daily_done_h: 1,
    }).daily;

    expect(daily?.targetH).toBe(6);
    expect(daily?.doneH).toBe(1);
    // Die kWh bleiben daneben stehen: damit rechnet die Automatik.
    expect(daily?.targetKwh).toBe(3);
  });

  it('nimmt Stunden nur, wenn beide Werte da sind', () => {
    // Ein Ziel in Stunden neben einem Fortschritt in kWh waere schlechter als
    // beides in kWh: Die Zeile stellt sie nebeneinander.
    const daily = view({ daily_target_kwh: 3, daily_target_h: 6 }).daily;

    expect(daily?.targetH).toBeNull();
    expect(daily?.doneH).toBeNull();
  });

  it('fehlt ohne eingetragenes Ziel', () => {
    // Die Integration laesst die Angaben dann ganz weg. Daran erkennt die Zeile,
    // dass es nichts zu zeigen gibt.
    expect(view({}).daily).toBeUndefined();
    expect(view({ daily_target_kwh: 0 }).daily).toBeUndefined();
  });

  it('nimmt eine fehlende Prognose als null, nicht als 0', () => {
    // 0 hiesse "es kommt nichts mehr" und liesse jedes Tagesziel sofort auf
    // Netzstrom laufen. Ohne Sensor greift die Regel dagegen gar nicht.
    const daily = view({ daily_target_kwh: 3, daily_forecast_kwh: null }).daily;

    expect(daily?.forecastKwh).toBeNull();
  });

  it('uebernimmt must_run', () => {
    expect(view({ daily_target_kwh: 3, must_run: true }).daily?.mustRun).toBe(true);
  });
});

describe('Leiter mit einer Stufe', () => {
  it('wird als solche erkannt', () => {
    // Erreicht ein Geraet nicht einmal seine kleinste Stufe, kappt die
    // Integration auf eine Stufe. Ein Segment ueber die volle Breite und
    // "Stufe 1/1" saehe aus wie ein Geraet mit einer Stufe — tatsaechlich ist
    // es meist eine falsche Konfiguration.
    const levels = view({
      level_source: 'number_a',
      level_count: 1,
      min_level_w: 4140,
      max_level_w: 4140,
      level_w: 4140,
      level_index: 1,
      observed_max_w: 1779,
      level_capped: true,
    }).levels;

    expect(levels?.count).toBe(1);
    expect(levels?.observedMaxW).toBe(1779);
    expect(levels?.capped).toBe(true);
  });
});
