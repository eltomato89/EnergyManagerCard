/**
 * HA-kompatibles fireEvent.
 *
 * `composed: true` ist entscheidend: ohne das verlaesst das Event den
 * Shadow-Root der Karte nicht und der Lovelace-Editor bekommt Aenderungen
 * nie zu sehen.
 */
export function fireEvent<T>(
  node: HTMLElement | Window,
  type: string,
  detail?: T,
  options?: { bubbles?: boolean; cancelable?: boolean; composed?: boolean },
): CustomEvent<T> {
  const event = new CustomEvent<T>(type, {
    bubbles: options?.bubbles ?? true,
    cancelable: Boolean(options?.cancelable),
    composed: options?.composed ?? true,
    detail,
  });
  node.dispatchEvent(event);
  return event;
}

/** Oeffnet den more-info-Dialog von HA. */
export function fireMoreInfo(node: HTMLElement, entityId: string): void {
  fireEvent(node, 'hass-more-info', { entityId });
}
