import { CLOSE_THRESHOLD_RATIO, DEFAULT_REQUIRED_W, MIN_SCALE_MAX, SCALE_STEP } from '../const';
import type { DeviceConfig } from '../types/config';
import type { HomeAssistant } from '../types/hass';
import type { DeviceStatus, DeviceView } from '../types/runtime';
import { computeLock } from './lock';
import { orderDevices } from './priority';
import { friendlyName, isOnState, isUnavailableState, readPowerW } from './state';
import { roundW } from './units';

/**
 * Ordnet jedem Geraet einen Ampelstatus zu, indem der verfuegbare Ueberschuss
 * in Prioritaetsreihenfolge (= Config-Reihenfolge) als Budget verteilt wird.
 *
 * Ohne diese Kaskade waere die Ampel wertlos: bei 2000 W Ueberschuss stuenden
 * fuenf Geraete a 1500 W alle auf gruen, obwohl nur eines davon laufen kann.
 *
 * Eingeschaltete Geraete verbrauchen kein Budget — ihr Verbrauch ist im
 * gemessenen Ueberschuss bereits enthalten, sie wuerden sonst doppelt zaehlen.
 */
export function computeDeviceViews(
  devices: DeviceConfig[],
  hass: HomeAssistant | undefined,
  availableW: number | null,
  now: number,
): DeviceView[] {
  let budget = availableW;

  // Die Reihenfolge kann aus Prioritaets-Helfern kommen statt aus dem Array —
  // die Budgetkaskade muss der tatsaechlichen Prioritaet folgen, nicht der
  // Reihenfolge, in der die Verbraucher zufaellig konfiguriert wurden.
  return orderDevices(devices, hass).map(({ device: config, configIndex }, index) => {
    const stateObj = hass?.states?.[config.switch_entity];
    const available = !!stateObj && !isUnavailableState(stateObj.state);
    const isOn = available && isOnState(stateObj.state);

    const autoObj = config.auto_entity ? hass?.states?.[config.auto_entity] : undefined;
    const autoSwitchable = !!autoObj && !isUnavailableState(autoObj.state);
    // Ohne Helfer gilt das statische managed; ohne beides nimmt der Verbraucher teil.
    const managed = autoSwitchable ? isOnState(autoObj.state) : (config.managed ?? true);

    const power = readPowerW(hass, config.power_entity);
    const powerW = power.w === null ? null : roundW(power.w);

    const requiredW = resolveRequiredW(config, powerW);

    let status: DeviceStatus;
    if (!available || budget === null) {
      status = 'unavailable';
    } else if (isOn) {
      // Hysterese als Totband: ein leichtes Defizit gilt noch als gedeckt und
      // verhindert, dass die Anzeige um den Nullpunkt flackert.
      status = budget >= -(config.hysteresis ?? 0) ? 'on_ok' : 'on_deficit';
    } else if (budget >= requiredW) {
      status = 'off_ready';
      budget -= requiredW; // fuer dieses Geraet reserviert
    } else if (budget >= requiredW * CLOSE_THRESHOLD_RATIO) {
      status = 'off_close';
    } else {
      status = 'off_insufficient';
    }

    return {
      config,
      index,
      configIndex,
      name: config.name ?? friendlyName(stateObj, config.switch_entity),
      icon: config.icon,
      isOn,
      available,
      managed,
      autoSwitchable,
      powerW,
      requiredW,
      status,
      headroomW: budget,
      lock: computeLock(stateObj, config, now),
    };
  });
}

/**
 * Wie viel Leistung ein Geraet voraussichtlich zieht.
 * Reihenfolge: ausdrueckliche Einschaltschwelle, dann Nennleistung, dann der
 * aktuell gemessene Wert, zuletzt ein konservativer Vorgabewert.
 */
function resolveRequiredW(config: DeviceConfig, powerW: number | null): number {
  if (config.min_power !== undefined && config.min_power > 0) return config.min_power;
  if (config.max_power !== undefined && config.max_power > 0) return config.max_power;
  if (powerW !== null && powerW > 0) return powerW;
  return DEFAULT_REQUIRED_W;
}

/**
 * Bruttoueberschuss = was zur Verfuegung staende, wenn alle aktuell laufenden
 * Verbraucher aus waeren. Basis fuer die zweigeteilte Leiste.
 */
export function computeGrossSurplus(
  views: DeviceView[],
  availableW: number | null,
): { grossW: number | null; allocatedW: number } {
  const allocatedW = views.reduce(
    (sum, view) => (view.isOn && view.powerW !== null && view.powerW > 0 ? sum + view.powerW : sum),
    0,
  );
  return {
    grossW: availableW === null ? null : roundW(availableW + allocatedW),
    allocatedW: roundW(allocatedW),
  };
}

/**
 * Obergrenze der Leistungsskala. Ohne ausdrueckliche Vorgabe aus den
 * Nennleistungen abgeleitet und auf SCALE_STEP gerastert, damit die Leiste
 * beim Hinzufuegen eines Geraets nicht springt.
 */
export function resolveScaleMax(
  devices: DeviceConfig[],
  configured: number | undefined,
  grossW: number | null,
): number {
  if (configured !== undefined && configured > 0) return configured;

  const sumMax = devices.reduce((sum, d) => sum + (d.max_power ?? 0), 0);
  const needed = Math.max(MIN_SCALE_MAX, sumMax, grossW ?? 0);
  return Math.ceil(needed / SCALE_STEP) * SCALE_STEP;
}
