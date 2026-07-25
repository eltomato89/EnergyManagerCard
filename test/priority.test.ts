import { describe, expect, it } from 'vitest';
import {
  hasCompletePriorityEntities,
  moveItem,
  orderDevices,
  priorityUpdates,
  readPriority,
  usesPriorityEntities,
} from '../src/lib/priority';
import type { DeviceConfig } from '../src/types/config';
import { makeHass } from './fixtures/hass';

const A: DeviceConfig = { switch_entity: 'switch.a', priority_entity: 'input_number.a' };
const B: DeviceConfig = { switch_entity: 'switch.b', priority_entity: 'input_number.b' };
const C: DeviceConfig = { switch_entity: 'switch.c', priority_entity: 'input_number.c' };

function prios(values: Record<string, string | number>) {
  return makeHass(Object.fromEntries(Object.entries(values).map(([id, state]) => [id, { state }])));
}

describe('usesPriorityEntities / hasCompletePriorityEntities', () => {
  it('erkennt teilweise und vollständige Ausstattung', () => {
    const ohne: DeviceConfig = { switch_entity: 'switch.x' };

    expect(usesPriorityEntities([A, ohne])).toBe(true);
    expect(usesPriorityEntities([ohne])).toBe(false);

    expect(hasCompletePriorityEntities([A, B])).toBe(true);
    expect(hasCompletePriorityEntities([A, ohne])).toBe(false);
    expect(hasCompletePriorityEntities([])).toBe(false);
  });
});

describe('readPriority', () => {
  it('liest den Zahlenwert', () => {
    expect(readPriority(prios({ 'input_number.a': 3 }), A)).toBe(3);
  });

  it('liefert null bei fehlendem, unbrauchbarem oder nicht konfiguriertem Helfer', () => {
    expect(readPriority(prios({}), A)).toBeNull();
    expect(readPriority(prios({ 'input_number.a': 'unavailable' }), A)).toBeNull();
    expect(readPriority(prios({ 'input_number.a': 'kaputt' }), A)).toBeNull();
    expect(readPriority(prios({}), { switch_entity: 'switch.x' })).toBeNull();
  });
});

describe('orderDevices', () => {
  it('sortiert nach dem Helferwert statt nach der Array-Position', () => {
    const hass = prios({ 'input_number.a': 3, 'input_number.b': 1, 'input_number.c': 2 });
    const order = orderDevices([A, B, C], hass).map((e) => e.device.switch_entity);
    expect(order).toEqual(['switch.b', 'switch.c', 'switch.a']);
  });

  it('behält den Array-Index als Rang, wo kein Helfer greift', () => {
    const ohne: DeviceConfig = { switch_entity: 'switch.x' };
    // ohne steht an Position 1 und behält Rang 1; A hat Priorität 0 und rückt davor.
    const hass = prios({ 'input_number.a': 0 });
    const order = orderDevices([A, ohne], hass).map((e) => e.device.switch_entity);
    expect(order).toEqual(['switch.a', 'switch.x']);
  });

  it('hält die Reihenfolge bei gleichen Werten stabil', () => {
    const hass = prios({ 'input_number.a': 1, 'input_number.b': 1, 'input_number.c': 1 });
    const order = orderDevices([A, B, C], hass).map((e) => e.device.switch_entity);
    expect(order).toEqual(['switch.a', 'switch.b', 'switch.c']);
  });

  it('merkt sich die ursprüngliche Array-Position', () => {
    const hass = prios({ 'input_number.a': 2, 'input_number.b': 1 });
    const ordered = orderDevices([A, B], hass);
    expect(ordered[0].configIndex).toBe(1);
    expect(ordered[1].configIndex).toBe(0);
  });

  it('fällt ohne hass auf die Array-Reihenfolge zurück', () => {
    const order = orderDevices([A, B, C], undefined).map((e) => e.device.switch_entity);
    expect(order).toEqual(['switch.a', 'switch.b', 'switch.c']);
  });
});

describe('priorityUpdates', () => {
  it('vergibt lückenlos 1..n', () => {
    const hass = prios({ 'input_number.a': 7, 'input_number.b': 42, 'input_number.c': 99 });
    const updates = priorityUpdates(orderDevices([A, B, C], hass), hass);

    expect(updates).toEqual([
      { entityId: 'input_number.a', value: 1 },
      { entityId: 'input_number.b', value: 2 },
      { entityId: 'input_number.c', value: 3 },
    ]);
  });

  it('schreibt nur, was sich tatsächlich ändert', () => {
    // Jeder Eintrag ist ein Service-Call — beim Verschieben um eine Position
    // sollen nicht alle Verbraucher neu geschrieben werden.
    const hass = prios({ 'input_number.a': 1, 'input_number.b': 2, 'input_number.c': 3 });
    expect(priorityUpdates(orderDevices([A, B, C], hass), hass)).toEqual([]);
  });

  it('überspringt Verbraucher ohne Helfer', () => {
    const ohne: DeviceConfig = { switch_entity: 'switch.x' };
    const hass = prios({ 'input_number.a': 5 });
    const updates = priorityUpdates(orderDevices([ohne, A], hass), hass);
    expect(updates.every((u) => u.entityId === 'input_number.a')).toBe(true);
  });
});

describe('moveItem', () => {
  it('verschiebt nach unten und nach oben', () => {
    expect(moveItem(['a', 'b', 'c'], 0, 2)).toEqual(['b', 'c', 'a']);
    expect(moveItem(['a', 'b', 'c'], 2, 0)).toEqual(['c', 'a', 'b']);
  });

  it('lässt die Liste bei unsinnigen Indizes unverändert', () => {
    const items = ['a', 'b', 'c'];
    expect(moveItem(items, 1, 1)).toBe(items);
    expect(moveItem(items, -1, 1)).toBe(items);
    expect(moveItem(items, 0, 9)).toBe(items);
  });

  it('verändert das Original nicht', () => {
    const items = ['a', 'b', 'c'];
    moveItem(items, 0, 2);
    expect(items).toEqual(['a', 'b', 'c']);
  });
});
