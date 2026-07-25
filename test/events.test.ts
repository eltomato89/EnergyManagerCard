import { describe, expect, it } from 'vitest';
import { fireEvent, fireMoreInfo } from '../src/lib/events';

/**
 * EventTarget genügt: fireEvent ruft nur dispatchEvent auf. Die HTMLElement-
 * Signatur ist reine Typsicherheit für die Aufrufstellen.
 */
function target() {
  return new EventTarget() as unknown as HTMLElement;
}

describe('fireEvent', () => {
  it('setzt bubbles und composed standardmäßig', () => {
    // composed: true ist entscheidend — ohne das verlässt config-changed den
    // Shadow-Root nicht und der Lovelace-Editor speichert nie.
    const node = target();
    let received: CustomEvent | undefined;
    node.addEventListener('test', (ev) => (received = ev as CustomEvent));

    fireEvent(node, 'test', { a: 1 });

    expect(received?.bubbles).toBe(true);
    expect(received?.composed).toBe(true);
    expect(received?.cancelable).toBe(false);
    expect(received?.detail).toEqual({ a: 1 });
  });

  it('lässt die Vorgaben überschreiben', () => {
    const node = target();
    let received: CustomEvent | undefined;
    node.addEventListener('test', (ev) => (received = ev as CustomEvent));

    fireEvent(node, 'test', undefined, { bubbles: false, composed: false, cancelable: true });

    expect(received?.bubbles).toBe(false);
    expect(received?.composed).toBe(false);
    expect(received?.cancelable).toBe(true);
  });

  it('gibt das erzeugte Event zurück', () => {
    const event = fireEvent(target(), 'test', { b: 2 });
    expect(event.type).toBe('test');
    expect(event.detail).toEqual({ b: 2 });
  });
});

describe('fireMoreInfo', () => {
  it('feuert hass-more-info mit der Entitäts-ID', () => {
    const node = target();
    let received: CustomEvent<{ entityId: string }> | undefined;
    node.addEventListener('hass-more-info', (ev) => {
      received = ev as CustomEvent<{ entityId: string }>;
    });

    fireMoreInfo(node, 'switch.wallbox');

    expect(received?.detail.entityId).toBe('switch.wallbox');
    expect(received?.composed).toBe(true);
  });
});
