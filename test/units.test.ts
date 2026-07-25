import { describe, expect, it } from 'vitest';
import { powerFactor, roundW } from '../src/lib/units';
import { combineBatteryReadings, invertReading, readPercent, readPowerW } from '../src/lib/state';
import { makeHass } from './fixtures/hass';

describe('powerFactor', () => {
  it('erkennt die gaengigen Leistungseinheiten', () => {
    expect(powerFactor('W').factor).toBe(1);
    expect(powerFactor('kW').factor).toBe(1000);
    expect(powerFactor('MW').factor).toBe(1e6);
    expect(powerFactor('GW').factor).toBe(1e9);
    expect(powerFactor('mW').factor).toBe(1e-3);
  });

  it('ist tolerant gegenueber Schreibweise und Leerzeichen', () => {
    expect(powerFactor(' kw ').factor).toBe(1000);
    expect(powerFactor('KW').factor).toBe(1000);
    expect(powerFactor('w').factor).toBe(1);
  });

  it('meldet Energie- und Fremdeinheiten als falsch statt sie zu raten', () => {
    for (const unit of ['kWh', 'Wh', 'MWh', '%', 'A', 'V', '°C']) {
      const result = powerFactor(unit);
      expect(result.factor, unit).toBeNull();
      expect(result.wrongUnit, unit).toBe(true);
    }
  });

  it('behandelt eine fehlende Einheit nicht als Fehler', () => {
    expect(powerFactor(undefined)).toEqual({ factor: null, wrongUnit: false });
    expect(powerFactor('')).toEqual({ factor: null, wrongUnit: false });
  });

  it('meldet eine unbekannte Fantasieeinheit weder als Leistung noch als falsch', () => {
    expect(powerFactor('Blubb')).toEqual({ factor: null, wrongUnit: false });
  });
});

describe('roundW', () => {
  it('rundet auf ganze Watt', () => {
    expect(roundW(1234.4)).toBe(1234);
    expect(roundW(-1234.6)).toBe(-1235);
  });
});

describe('readPowerW', () => {
  it('rechnet kW auf W um', () => {
    const hass = makeHass({ 'sensor.pv': { state: 3.5, unit: 'kW' } });
    expect(readPowerW(hass, 'sensor.pv').w).toBe(3500);
  });

  it('reicht W unveraendert durch', () => {
    const hass = makeHass({ 'sensor.pv': { state: -750, unit: 'W' } });
    expect(readPowerW(hass, 'sensor.pv').w).toBe(-750);
  });

  it('nimmt bei fehlender Einheit W an und markiert das', () => {
    const hass = makeHass({ 'sensor.pv': { state: 900 } });
    const reading = readPowerW(hass, 'sensor.pv');
    expect(reading.w).toBe(900);
    expect(reading.assumedUnit).toBe(true);
  });

  it('lehnt einen kWh-Sensor ab statt still 0 zu liefern', () => {
    const hass = makeHass({ 'sensor.zaehler': { state: 4211.5, unit: 'kWh' } });
    const reading = readPowerW(hass, 'sensor.zaehler');
    expect(reading.w).toBeNull();
    expect(reading.reason).toBe('wrong-unit');
    expect(reading.unit).toBe('kWh');
  });

  it('meldet unavailable und unknown getrennt von fehlenden Entitaeten', () => {
    const hass = makeHass({
      'sensor.weg': { state: 'unavailable', unit: 'W' },
      'sensor.neu': { state: 'unknown', unit: 'W' },
    });
    expect(readPowerW(hass, 'sensor.weg').reason).toBe('unavailable');
    expect(readPowerW(hass, 'sensor.neu').reason).toBe('unavailable');
    expect(readPowerW(hass, 'sensor.gibtsnicht').reason).toBe('missing');
    expect(readPowerW(hass, undefined).reason).toBe('missing');
  });

  it('faengt nicht-numerische Zustaende ab, bevor sie zu NaN werden', () => {
    const hass = makeHass({ 'sensor.text': { state: 'kaputt', unit: 'W' } });
    const reading = readPowerW(hass, 'sensor.text');
    expect(reading.w).toBeNull();
    expect(reading.reason).toBe('nan');
  });

  it('behandelt einen leeren Zustand als unavailable', () => {
    const hass = makeHass({ 'sensor.leer': { state: '', unit: 'W' } });
    expect(readPowerW(hass, 'sensor.leer').reason).toBe('unavailable');
  });

  it('kommt ohne hass-Objekt zurecht', () => {
    expect(readPowerW(undefined, 'sensor.pv').reason).toBe('missing');
  });
});

describe('readPercent', () => {
  it('liest den Ladestand und klemmt ihn auf 0..100', () => {
    const hass = makeHass({
      'sensor.soc': { state: 62, unit: '%' },
      'sensor.zuviel': { state: 140, unit: '%' },
      'sensor.zuwenig': { state: -5, unit: '%' },
    });
    expect(readPercent(hass, 'sensor.soc')).toBe(62);
    expect(readPercent(hass, 'sensor.zuviel')).toBe(100);
    expect(readPercent(hass, 'sensor.zuwenig')).toBe(0);
  });

  it('liefert null fuer fehlende oder unbrauchbare Werte', () => {
    const hass = makeHass({ 'sensor.weg': { state: 'unavailable' } });
    expect(readPercent(hass, 'sensor.weg')).toBeNull();
    expect(readPercent(hass, 'sensor.gibtsnicht')).toBeNull();
    expect(readPercent(hass, undefined)).toBeNull();
  });
});

describe('invertReading', () => {
  it('kehrt das Vorzeichen nur bei gesetztem Flag um', () => {
    expect(invertReading({ w: 500 }, true).w).toBe(-500);
    expect(invertReading({ w: 500 }, false).w).toBe(500);
    expect(invertReading({ w: 500 }, undefined).w).toBe(500);
  });

  it('macht aus null keine 0', () => {
    expect(invertReading({ w: null, reason: 'missing' }, true).w).toBeNull();
  });
});

describe('combineBatteryReadings', () => {
  it('bildet Laden minus Entladen', () => {
    expect(combineBatteryReadings({ w: 800 }, { w: 0 }).w).toBe(800);
    expect(combineBatteryReadings({ w: 0 }, { w: 1200 }).w).toBe(-1200);
  });

  it('nutzt den vorhandenen Sensor, wenn nur einer meldet', () => {
    expect(combineBatteryReadings({ w: 800 }, { w: null }).w).toBe(800);
    expect(combineBatteryReadings({ w: null }, { w: 500 }).w).toBe(-500);
  });

  it('liefert null, wenn beide fehlen', () => {
    const result = combineBatteryReadings({ w: null, reason: 'unavailable' }, { w: null });
    expect(result.w).toBeNull();
    expect(result.reason).toBe('unavailable');
  });
});
