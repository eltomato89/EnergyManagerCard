import { describe, expect, it } from 'vitest';
import { haveTrackedStatesChanged, snapshotStates } from '../src/lib/diff';
import { makeHass } from './fixtures/hass';

describe('haveTrackedStatesChanged', () => {
  it('meldet eine Änderung an einer beobachteten Entität', () => {
    const alt = makeHass({ 'sensor.netz': { state: 100, unit: 'W' } });
    const neu = makeHass({ 'sensor.netz': { state: 200, unit: 'W' } });
    expect(haveTrackedStatesChanged(alt, neu, ['sensor.netz'])).toBe(true);
  });

  it('ignoriert Änderungen an nicht beobachteten Entitäten', () => {
    // Genau das ist der Zweck des Filters: der hass-Setter feuert bei jeder
    // Zustandsänderung im gesamten System.
    const alt = makeHass({
      'sensor.netz': { state: 100, unit: 'W' },
      'sensor.egal': { state: 1, unit: 'W' },
    });
    const neu = makeHass({
      'sensor.netz': { state: 100, unit: 'W' },
      'sensor.egal': { state: 999, unit: 'W' },
    });
    // makeHass erzeugt neue Objekte, der Referenzvergleich müsste also
    // anschlagen — aber nur für die beobachtete Entität, die hier gleich bleibt.
    neu.states['sensor.netz'] = alt.states['sensor.netz'];

    expect(haveTrackedStatesChanged(alt, neu, ['sensor.netz'])).toBe(false);
  });

  it('erkennt eine Änderung am Referenzwechsel, nicht am Wert', () => {
    // HA ersetzt Zustandsobjekte unveränderlich — deshalb genügt !==.
    const alt = makeHass({ 'sensor.netz': { state: 100, unit: 'W' } });
    const neu = makeHass({ 'sensor.netz': { state: 100, unit: 'W' } });
    expect(haveTrackedStatesChanged(alt, neu, ['sensor.netz'])).toBe(true);
  });

  it('behandelt den ersten hass-Wert als Änderung', () => {
    const neu = makeHass({ 'sensor.netz': { state: 100, unit: 'W' } });
    expect(haveTrackedStatesChanged(undefined, neu, ['sensor.netz'])).toBe(true);
  });

  it('meldet nichts ohne neues hass', () => {
    const alt = makeHass({ 'sensor.netz': { state: 100, unit: 'W' } });
    expect(haveTrackedStatesChanged(alt, undefined, ['sensor.netz'])).toBe(false);
  });

  it('meldet nichts bei leerer Beobachtungsmenge', () => {
    const alt = makeHass({ 'sensor.netz': { state: 100, unit: 'W' } });
    const neu = makeHass({ 'sensor.netz': { state: 999, unit: 'W' } });
    expect(haveTrackedStatesChanged(alt, neu, [])).toBe(false);
  });

  it('erkennt eine verschwundene Entität', () => {
    const alt = makeHass({ 'sensor.netz': { state: 100, unit: 'W' } });
    const neu = makeHass({});
    expect(haveTrackedStatesChanged(alt, neu, ['sensor.netz'])).toBe(true);
  });
});

describe('snapshotStates', () => {
  it('greift nur die beobachteten Zustände heraus', () => {
    const hass = makeHass({
      'sensor.a': { state: 1, unit: 'W' },
      'sensor.b': { state: 2, unit: 'W' },
    });
    const snapshot = snapshotStates(hass, ['sensor.a']);

    expect(Object.keys(snapshot)).toEqual(['sensor.a']);
    expect(snapshot['sensor.a']).toBe(hass.states['sensor.a']);
  });

  it('hält fehlende Entitäten als undefined fest', () => {
    const hass = makeHass({});
    expect(snapshotStates(hass, ['sensor.weg'])).toEqual({ 'sensor.weg': undefined });
  });

  it('liefert ein leeres Ergebnis ohne hass', () => {
    expect(snapshotStates(undefined, ['sensor.a'])).toEqual({});
  });
});
