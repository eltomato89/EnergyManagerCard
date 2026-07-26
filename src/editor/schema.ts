import { mdiBattery, mdiCog, mdiRobot } from '@mdi/js';
import { SWITCHABLE_DOMAINS } from '../const';
import { resolveMeterMode } from '../lib/validate';
import type { EnergyManagerCardConfig } from '../types/config';

/** Moderne Filter-Schreibweise; das Array wirkt als ODER-Verknuepfung. */
const powerSensor = {
  entity: { filter: [{ domain: 'sensor', device_class: 'power' }] },
} as const;

const batterySensor = {
  entity: { filter: [{ domain: 'sensor', device_class: 'battery' }] },
} as const;

const watts = (max: number) => ({
  number: { min: 0, max, step: 50, unit_of_measurement: 'W', mode: 'box' as const },
});

const seconds = (max: number, step: number) => ({
  number: { min: 0, max, step, unit_of_measurement: 's', mode: 'box' as const },
});

export interface SchemaOptions {
  /**
   * false, wenn die Energy-Manager-Integration die Datenquelle ist.
   *
   * Dann entfallen alle Felder, die sie bereits fuehrt: Zaehler, Batterie,
   * Glaettung. Sie doppelt anzubieten waere schlimmer als sie wegzulassen —
   * zwei Stellen fuer dieselbe Angabe, von denen nur eine wirkt.
   */
  standalone?: boolean;
}

/**
 * Hauptschema. Bewusst eine Funktion: der Zaehlermodus blendet Felder um, und
 * `visible`-Conditions gibt es erst in neueren HA-Versionen.
 */
export function mainSchema(config: Partial<EnergyManagerCardConfig>, options: SchemaOptions = {}) {
  const mode = resolveMeterMode(config);
  const standalone = options.standalone ?? true;

  const sources = standalone
    ? ([
        {
          name: 'meter_mode',
          selector: {
            select: {
              mode: 'dropdown',
              options: [
                { value: 'grid', label: 'grid' },
                { value: 'split', label: 'split' },
              ],
            },
          },
        },
        ...(mode === 'grid'
          ? [
              { name: 'grid_entity', required: true, selector: powerSensor },
              { name: 'invert_grid', selector: { boolean: {} } },
            ]
          : [
              { name: 'production_entity', required: true, selector: powerSensor },
              { name: 'consumption_entity', required: true, selector: powerSensor },
              { name: 'consumption_includes_battery', selector: { boolean: {} } },
            ]),
        {
          name: 'battery',
          type: 'expandable',
          iconPath: mdiBattery,
          flatten: true,
          schema: [
            { name: 'battery_soc_entity', selector: batterySensor },
            { name: 'battery_power_entity', selector: powerSensor },
            { name: 'battery_invert', selector: { boolean: {} } },
            { name: 'battery_charge_entity', selector: powerSensor },
            { name: 'battery_discharge_entity', selector: powerSensor },
            {
              name: 'battery_mode',
              selector: {
                select: {
                  mode: 'dropdown',
                  options: [
                    { value: 'charge_only', label: 'charge_only' },
                    { value: 'full', label: 'full' },
                  ],
                },
              },
            },
            {
              name: 'battery_min_soc',
              selector: {
                number: { min: 0, max: 100, step: 1, unit_of_measurement: '%', mode: 'slider' },
              },
            },
            { name: 'battery_reserve_w', selector: watts(20000) },
          ],
        },
      ] as const)
    : ([] as const);

  const smoothing = standalone
    ? ([
        {
          name: 'smoothing_window',
          selector: {
            number: { min: 0, max: 900, step: 5, unit_of_measurement: 's', mode: 'slider' },
          },
        },
      ] as const)
    : ([] as const);

  // Bewusst kein Schalter fuer `use_integration`: Die Karte ist das
  // Anzeigeteil der Integration. Sie ohne diese zu betreiben ist ein
  // Rueckfall, kein Betriebsmodus — ein Schalter im Formular wuerde dafuer
  // werben. Wer ihn braucht, setzt das Feld im YAML.
  return [
    { name: 'title', selector: { text: {} } },
    ...sources,
    {
      name: 'advanced',
      type: 'expandable',
      iconPath: mdiCog,
      flatten: true,
      schema: [
        ...smoothing,
        { name: 'update_interval', selector: seconds(60, 1) },
        {
          name: 'scale_max',
          selector: {
            number: { min: 500, max: 50000, step: 500, unit_of_measurement: 'W', mode: 'box' },
          },
        },
        {
          type: 'grid',
          name: '',
          schema: [
            { name: 'show_surplus_bar', selector: { boolean: {} } },
            { name: 'show_battery', selector: { boolean: {} } },
            { name: 'show_priority', selector: { boolean: {} } },
            { name: 'compact', selector: { boolean: {} } },
          ],
        },
        {
          name: 'secondary_info',
          selector: {
            select: {
              mode: 'dropdown',
              options: [
                { value: 'power', label: 'power' },
                { value: 'status', label: 'status' },
                { value: 'both', label: 'both' },
              ],
            },
          },
        },
        {
          name: 'switch_action',
          selector: {
            select: {
              mode: 'dropdown',
              options: [
                { value: 'auto', label: 'auto' },
                { value: 'device', label: 'device' },
                { value: 'automation', label: 'automation' },
              ],
            },
          },
        },
        { name: 'allow_reorder', selector: { boolean: {} } },
      ],
    },
  ] as const;
}

/** Schema eines einzelnen Verbrauchers. */
export function deviceSchema() {
  return [
    {
      name: 'switch_entity',
      required: true,
      selector: { entity: { filter: [{ domain: [...SWITCHABLE_DOMAINS] }] } },
    },
    { name: 'power_entity', selector: powerSensor },
    {
      type: 'grid',
      name: '',
      schema: [
        { name: 'name', selector: { text: {} } },
        { name: 'icon', selector: { icon: {} }, context: { icon_entity: 'switch_entity' } },
      ],
    },
    // Die beiden Entitaeten machen Reihenfolge und Automatik im Dashboard
    // bedienbar — ohne sie bleibt beides an der Konfiguration haengen.
    // `number` ist mit aufgefuehrt, damit sich auch die Prioritaets-Entitaet
    // der Integration von Hand zuordnen laesst.
    {
      name: 'priority_entity',
      selector: { entity: { filter: [{ domain: ['input_number', 'number'] }] } },
    },
    {
      name: 'auto_entity',
      selector: { entity: { filter: [{ domain: ['input_boolean', 'switch'] }] } },
    },
    {
      name: 'automation',
      type: 'expandable',
      iconPath: mdiRobot,
      flatten: true,
      schema: [
        {
          type: 'grid',
          name: '',
          schema: [
            { name: 'min_power', selector: watts(30000) },
            { name: 'max_power', selector: watts(30000) },
          ],
        },
        { name: 'hysteresis', selector: watts(5000) },
        // Die vier Zeitfelder paarweise: zuerst was VOR dem Schalten wirkt,
        // dann was DANACH gilt. Ohne die Helper-Texte sind sie nicht
        // auseinanderzuhalten — siehe localize/languages/*.json.
        {
          type: 'grid',
          name: '',
          schema: [
            { name: 'turn_on_delay', selector: seconds(3600, 10) },
            { name: 'turn_off_delay', selector: seconds(3600, 10) },
            { name: 'min_runtime', selector: seconds(86400, 60) },
            { name: 'min_off_time', selector: seconds(86400, 60) },
          ],
        },
        {
          type: 'grid',
          name: '',
          schema: [
            { name: 'managed', selector: { boolean: {} } },
            { name: 'confirm', selector: { boolean: {} } },
          ],
        },
      ],
    },
  ] as const;
}
