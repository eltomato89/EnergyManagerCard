import type { DeviceConfig, EnergyManagerCardConfig, MeterMode } from '../types/config';

/**
 * Leitet den Zaehlermodus ab. Ohne ausdrueckliche Angabe entscheidet, welche
 * Entitaeten konfiguriert sind — so muss der Nutzer das Feld nie von Hand setzen.
 */
export function resolveMeterMode(config: Partial<EnergyManagerCardConfig>): MeterMode {
  if (config.meter_mode === 'grid' || config.meter_mode === 'split') return config.meter_mode;
  return config.grid_entity ? 'grid' : 'split';
}

export function hasBattery(config: Partial<EnergyManagerCardConfig>): boolean {
  return Boolean(
    config.battery_power_entity ||
    config.battery_charge_entity ||
    config.battery_discharge_entity ||
    config.battery_soc_entity,
  );
}

/**
 * Harte Validierung fuer setConfig. Wirft bei allem, was die Karte nicht
 * sinnvoll darstellen kann — HA zeigt die Meldung dann direkt in der Karte an.
 */
export function validateConfig(config: EnergyManagerCardConfig | undefined): void {
  if (!config) throw new Error('Konfiguration fehlt');

  const mode = resolveMeterMode(config);

  if (mode === 'grid') {
    if (!config.grid_entity) {
      throw new Error('grid_entity ist erforderlich (oder Modus "split" mit getrennten Sensoren)');
    }
  } else {
    const missing: string[] = [];
    if (!config.production_entity) missing.push('production_entity');
    if (!config.consumption_entity) missing.push('consumption_entity');
    if (missing.length > 0) {
      throw new Error(`Im Modus "split" erforderlich: ${missing.join(', ')}`);
    }
  }

  if (!Array.isArray(config.devices)) {
    throw new Error('devices muss eine Liste sein');
  }

  config.devices.forEach((device, index) => {
    if (!device || typeof device.switch_entity !== 'string' || device.switch_entity === '') {
      throw new Error(`devices[${index}]: switch_entity fehlt`);
    }
  });

  if (config.battery_min_soc !== undefined) {
    const soc = config.battery_min_soc;
    if (!Number.isFinite(soc) || soc < 0 || soc > 100) {
      throw new Error('battery_min_soc muss zwischen 0 und 100 liegen');
    }
  }
}

/* ------------------------------------------------------------------ */
/* Weiche Hinweise — blockieren das Speichern nicht                    */
/* ------------------------------------------------------------------ */

export type WarningCode =
  | 'device-no-power-estimate'
  | 'min-power-above-max'
  | 'no-devices'
  | 'battery-soc-without-power'
  | 'smoothing-below-interval'
  | 'mixed-priority-entities'
  | 'reorder-without-priority-entities';

export interface ConfigWarning {
  code: WarningCode;
  /** Index in devices[], falls geraetebezogen. */
  deviceIndex?: number;
  /** Zusatzangabe fuer die Meldung, z.B. ein Geraetename. */
  detail?: string;
}

export function collectWarnings(config: EnergyManagerCardConfig): ConfigWarning[] {
  const warnings: ConfigWarning[] = [];
  const devices: DeviceConfig[] = Array.isArray(config.devices) ? config.devices : [];

  if (devices.length === 0) warnings.push({ code: 'no-devices' });

  devices.forEach((device, index) => {
    if (!device.power_entity && device.max_power === undefined && device.min_power === undefined) {
      warnings.push({
        code: 'device-no-power-estimate',
        deviceIndex: index,
        detail: device.name ?? device.switch_entity,
      });
    }
    if (
      device.min_power !== undefined &&
      device.max_power !== undefined &&
      device.min_power > device.max_power
    ) {
      warnings.push({
        code: 'min-power-above-max',
        deviceIndex: index,
        detail: device.name ?? device.switch_entity,
      });
    }
  });

  if (config.battery_soc_entity && !config.battery_power_entity && !config.battery_charge_entity) {
    warnings.push({ code: 'battery-soc-without-power' });
  }

  // Teils Helfer, teils Array-Position ergibt eine Reihenfolge, die kaum
  // jemand vorhersagen kann — und Sortieren im Dashboard bliebe unvollstaendig.
  const withPriority = devices.filter((device) => Boolean(device.priority_entity)).length;
  if (withPriority > 0 && withPriority < devices.length) {
    warnings.push({ code: 'mixed-priority-entities' });
  }

  if (config.allow_reorder === true && withPriority < devices.length) {
    warnings.push({ code: 'reorder-without-priority-entities' });
  }

  // Ein Mittelungsfenster unterhalb des Abtasttakts kann nie mehr als eine
  // Stuetzstelle enthalten und wirkt damit gar nicht.
  const window = config.smoothing_window;
  const interval = config.update_interval;
  if (window !== undefined && window > 0 && interval !== undefined && window < interval) {
    warnings.push({ code: 'smoothing-below-interval' });
  }

  return warnings;
}

/**
 * Alle Entitaeten, deren Zustandsaenderungen die Karte betreffen.
 * Grundlage fuer den gefilterten hass-Setter: ohne diese Menge wuerde die Karte
 * bei jeder beliebigen Zustandsaenderung in HA neu rendern.
 */
export function trackedEntities(config: EnergyManagerCardConfig): Set<string> {
  const ids = new Set<string>();
  const add = (id?: string) => {
    if (id) ids.add(id);
  };

  add(config.grid_entity);
  add(config.production_entity);
  add(config.consumption_entity);
  add(config.battery_soc_entity);
  add(config.battery_power_entity);
  add(config.battery_charge_entity);
  add(config.battery_discharge_entity);

  for (const device of config.devices ?? []) {
    add(device?.switch_entity);
    add(device?.power_entity);
  }

  return ids;
}
