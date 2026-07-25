/**
 * Erzwingt, dass die HA-eigenen Formular-Elemente registriert sind.
 *
 * `ha-form`, `ha-entity-picker`, `ha-icon-picker` und `ha-sortable` liegen in
 * lazy geladenen Chunks des HA-Frontends. Oeffnet der Nutzer den Karten-Editor
 * als Erstes, sind sie noch nicht definiert und der Editor bliebe leer.
 *
 * Der belastbare Trick: den Editor einer eingebauten Karte laden. Der
 * hui-entities-card-editor importiert genau die Elemente, die wir brauchen.
 *
 * Ausdruecklich NICHT tun: HA-Klassen per customElements.get() holen und
 * ableiten — das bricht mit Scoped Registries. Nur die Tags im Template nutzen.
 */
let loading: Promise<void> | undefined;

export function loadHaComponents(): Promise<void> {
  if (loading) return loading;

  loading = (async () => {
    if (customElements.get('ha-form') && customElements.get('ha-entity-picker')) return;

    const helpers = await window.loadCardHelpers?.();
    if (!helpers) return;

    const card = await helpers.createCardElement({ type: 'entities', entities: [] });
    const ctor = card.constructor as { getConfigElement?: () => Promise<unknown> };
    await ctor.getConfigElement?.();

    await Promise.all([
      customElements.whenDefined('ha-form'),
      customElements.whenDefined('ha-entity-picker'),
    ]);
  })().catch(() => {
    // Nicht durchreichen: schlaegt das Nachladen fehl, rendert der Editor mit
    // dem, was da ist. Ein leeres Formular ist besser als eine kaputte Karte.
    loading = undefined;
  });

  return loading;
}

/** true, wenn HAs sortierbare Liste zur Verfuegung steht. */
export function hasSortable(): boolean {
  return customElements.get('ha-sortable') !== undefined;
}
