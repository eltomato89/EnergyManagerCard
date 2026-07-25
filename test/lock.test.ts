import { describe, expect, it } from 'vitest';
import { computeLock } from '../src/lib/lock';
import { makeEntity } from './fixtures/hass';

const NOW = Date.parse('2026-07-25T12:00:00.000Z');

function entity(state: string, secondsAgo: number) {
  return makeEntity('switch.a', { state, lastChanged: NOW - secondsAgo * 1000 });
}

describe('computeLock', () => {
  it('zaehlt die Mindestlaufzeit eines eingeschalteten Geraets herunter', () => {
    const lock = computeLock(
      entity('on', 120),
      { switch_entity: 'switch.a', min_runtime: 300 },
      NOW,
    );
    expect(lock).toEqual({ kind: 'min_runtime', remainingS: 180 });
  });

  it('zaehlt die Mindest-Aus-Zeit eines ausgeschalteten Geraets herunter', () => {
    const lock = computeLock(
      entity('off', 45),
      { switch_entity: 'switch.a', min_off_time: 600 },
      NOW,
    );
    expect(lock).toEqual({ kind: 'min_off_time', remainingS: 555 });
  });

  it('meldet keine Sperre, sobald die Zeit abgelaufen ist', () => {
    const lock = computeLock(
      entity('off', 900),
      { switch_entity: 'switch.a', min_off_time: 600 },
      NOW,
    );
    expect(lock.kind).toBe('none');
    expect(lock.remainingS).toBe(0);
  });

  it('wendet min_runtime nicht auf ein ausgeschaltetes Geraet an', () => {
    // Umgekehrt gilt dasselbe: die beiden Felder duerfen sich nicht vermischen.
    expect(
      computeLock(entity('off', 10), { switch_entity: 'switch.a', min_runtime: 3600 }, NOW).kind,
    ).toBe('none');
    expect(
      computeLock(entity('on', 10), { switch_entity: 'switch.a', min_off_time: 3600 }, NOW).kind,
    ).toBe('none');
  });

  it('meldet keine Sperre ohne konfigurierte Zeiten', () => {
    expect(computeLock(entity('on', 10), { switch_entity: 'switch.a' }, NOW).kind).toBe('none');
    expect(
      computeLock(entity('on', 10), { switch_entity: 'switch.a', min_runtime: 0 }, NOW).kind,
    ).toBe('none');
  });

  it('meldet keine Sperre fuer fehlende oder nicht verfuegbare Entitaeten', () => {
    expect(computeLock(undefined, { switch_entity: 'switch.a', min_runtime: 300 }, NOW).kind).toBe(
      'none',
    );
    expect(
      computeLock(entity('unavailable', 10), { switch_entity: 'switch.a', min_runtime: 300 }, NOW)
        .kind,
    ).toBe('none');
  });

  it('meldet statt eines hochzaehlenden Countdowns keine Sperre, wenn die Uhren auseinanderlaufen', () => {
    const future = makeEntity('switch.a', { state: 'on', lastChanged: NOW + 60_000 });
    expect(computeLock(future, { switch_entity: 'switch.a', min_runtime: 300 }, NOW).kind).toBe(
      'none',
    );
  });

  it('kommt mit einem unlesbaren Zeitstempel zurecht', () => {
    const broken = makeEntity('switch.a', { state: 'on', lastChanged: 'keine-zeit' });
    expect(computeLock(broken, { switch_entity: 'switch.a', min_runtime: 300 }, NOW).kind).toBe(
      'none',
    );
  });

  it('rundet angebrochene Sekunden auf', () => {
    const e = makeEntity('switch.a', { state: 'on', lastChanged: NOW - 500 });
    expect(computeLock(e, { switch_entity: 'switch.a', min_runtime: 10 }, NOW).remainingS).toBe(10);
  });
});
