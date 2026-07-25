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
    // hui-entities-card-editor importiert ha-form, ha-entity-picker,
    // ha-icon-button UND ha-sortable — genau die Elemente, die wir brauchen.
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

let sortableLoading: Promise<boolean> | undefined;

/**
 * Wartet darauf, dass `ha-sortable` verfuegbar ist.
 *
 * In jedem Lovelace-Dashboard ist es bereits registriert: `hui-view` importiert
 * `hui-masonry-view` statisch, das wiederum `hui-view-badges`, und das
 * `ha-sortable`. Es ist also nichts nachzuladen — der Editor-Umweg waere hier
 * unnoetiger Ballast. Lediglich sortablejs selbst holt sich `ha-sortable` beim
 * ersten Ziehen nach, und das erledigt es allein.
 *
 * Die kurze Wartezeit deckt nur den Fall ab, dass die Karte vor dem View fertig
 * ist. Kommt das Element nicht, ist das kein Fehler: die Karte zeigt dann die
 * Pfeiltasten, mit denen sich alles ebenso erledigen laesst.
 *
 * `ha-sortable` ist bewusst kein dokumentiertes API — es kann sich ohne
 * Ankuendigung aendern. Deshalb der Rueckfallweg.
 */
export function loadSortable(): Promise<boolean> {
  if (hasSortable()) return Promise.resolve(true);
  if (sortableLoading) return sortableLoading;

  sortableLoading = Promise.race([
    customElements.whenDefined('ha-sortable').then(() => true),
    new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 2000)),
  ]).catch(() => false);

  return sortableLoading;
}
