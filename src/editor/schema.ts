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

/**
 * Hauptschema. Bewusst eine Funktion: der Zaehlermodus blendet Felder um, und
 * `visible`-Conditions gibt es erst in neueren HA-Versionen.
 */
export function mainSchema(config: Partial<EnergyManagerCardConfig>) {
  const mode = resolveMeterMode(config);

  return [
    { name: 'title', selector: { text: {} } },
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
          name: 'battery_min_soc',
          selector: {
            number: { min: 0, max: 100, step: 1, unit_of_measurement: '%', mode: 'slider' },
          },
        },
        { name: 'battery_reserve_w', selector: watts(20000) },
      ],
    },
    {
      name: 'advanced',
      type: 'expandable',
      iconPath: mdiCog,
      flatten: true,
      schema: [
        {
          name: 'smoothing_window',
          selector: {
            number: { min: 0, max: 900, step: 5, unit_of_measurement: 's', mode: 'slider' },
          },
        },
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
