import type { DeviceConfig } from '../types/config';
import type { HassEntity, HomeAssistant } from '../types/hass';
import type { DeviceStatus, DeviceView, LockState, Reading, SurplusResult } from '../types/runtime';

/**
 * Anbindung an die Energy-Manager-Integration.
 *
 * Ist sie installiert, liefert sie bereits alles: Ueberschuss, Rangfolge,
 * Ampelzustand und Sperrzeiten. Die Karte muss dann keine eigene
 * Verbraucherliste fuehren — sonst muesste dasselbe an zwei Stellen gepflegt
 * werden, und die beiden Listen liefen unweigerlich auseinander.
 *
 * Ohne Integration bleibt die Karte eigenstaendig: sie rechnet dann selbst aus
 * den konfigurierten Sensoren (siehe `devices` in der Konfiguration).
 */

/** Das Praefix, unter dem die Integration ihre Entitaeten registriert. */
const PLATFORM = 'energy_manager';

/**
 * Rollen, die die Integration ihren Entitaeten per `translation_key` gibt.
 * Sie sind Teil der Zusage aus docs/integration-contract.md.
 */
const ROLE_SURPLUS = 'surplus';
const ROLE_STATUS = 'status';
const ROLE_LOCKED_UNTIL = 'locked_until';
const ROLE_PRIORITY = 'priority';
const ROLE_MANAGED = 'managed';
const ROLE_AUTOMATION = 'automation';

interface RoleMap {
  /** Entitaets-IDs je Rolle. */
  [role: string]: string;
}

export interface IntegrationDevice {
  deviceId: string;
  roles: RoleMap;
}

export interface IntegrationHandle {
  /** Der Ueberschuss-Sensor am Hub. */
  surplusEntity: string;
  /** Der Hauptschalter, sofern vorhanden. */
  automationEntity?: string;
  /** Ein Eintrag je Verbraucher. */
  devices: IntegrationDevice[];
}

/**
 * Sucht die Integration im Entitaetsregister.
 *
 * Der Hub wird ueber seinen Ueberschuss-Sensor erkannt; alle uebrigen Geraete
 * der Plattform sind Verbraucher. Ueber `translation_key` statt ueber
 * Entitaets-IDs, weil die vom Nutzer umbenannt werden koennen.
 */
export function findIntegration(hass: HomeAssistant | undefined): IntegrationHandle | null {
  if (!hass?.entities) return null;

  const byDevice = new Map<string, RoleMap>();
  let hubDeviceId: string | undefined;

  for (const entry of Object.values(hass.entities)) {
    if (entry.platform !== PLATFORM) continue;

    const role = entry.translation_key;
    const deviceId = entry.device_id;
    if (!role || !deviceId) continue;

    const roles = byDevice.get(deviceId) ?? {};
    roles[role] = entry.entity_id;
    byDevice.set(deviceId, roles);

    if (role === ROLE_SURPLUS) hubDeviceId = deviceId;
  }

  if (!hubDeviceId) return null;

  const hub = byDevice.get(hubDeviceId) as RoleMap;
  const devices: IntegrationDevice[] = [];

  for (const [deviceId, roles] of byDevice) {
    // Ein Verbraucher ist daran erkennbar, dass er einen Ampelzustand hat —
    // der Hub hat ihn auch, wird aber zuvor aussortiert.
    if (deviceId === hubDeviceId) continue;
    if (!roles[ROLE_STATUS]) continue;
    devices.push({ deviceId, roles });
  }

  return {
    surplusEntity: hub[ROLE_SURPLUS],
    automationEntity: hub[ROLE_AUTOMATION],
    devices,
  };
}

/**
 * Alle Entitaeten, auf deren Aenderung die Karte neu zeichnen muss.
 *
 * Ohne diese Menge reagiert sie erst beim naechsten Zeittakt — ein Schaltvorgang
 * waere sekundenlang nicht zu sehen.
 */
export function trackedFromIntegration(hass: HomeAssistant, handle: IntegrationHandle): string[] {
  const ids = [handle.surplusEntity];
  if (handle.automationEntity) ids.push(handle.automationEntity);

  for (const device of handle.devices) {
    ids.push(...Object.values(device.roles));

    // Der Schalter des echten Geraets: die Zeile zeigt seinen Zustand, und er
    // aendert sich, ohne dass eine Entitaet der Integration mitzieht.
    const switchEntity = hass.states[device.roles[ROLE_STATUS]]?.attributes?.switch_entity;
    if (typeof switchEntity === 'string' && switchEntity) ids.push(switchEntity);
  }

  return ids;
}

/** Zahlwert eines Attributs, oder null. */
function num(value: unknown): number | null {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Ueberschuss aus dem Sensor der Integration.
 *
 * Die Integration rechnet mit derselben Formel wie die Karte — nachgewiesen
 * durch einen Gleichstandstest ueber knapp 200 Faelle. Hier wird das Ergebnis
 * daher uebernommen statt neu berechnet: zwei Rechenwege, die auseinanderlaufen
 * koennen, waeren schlimmer als einer.
 */
export function surplusFromIntegration(
  hass: HomeAssistant,
  handle: IntegrationHandle,
): SurplusResult & { coverage: number; smoothingWindow: number; batterySoc: number | null } {
  const stateObj = hass.states[handle.surplusEntity] as HassEntity | undefined;
  const attrs = (stateObj?.attributes ?? {}) as Record<string, unknown>;

  const available = stateObj ? num(stateObj.state) : null;
  const errors = Array.isArray(attrs.errors) ? (attrs.errors as string[]) : [];

  return {
    raw: available,
    available,
    batteryCorrection: num(attrs.battery_correction_w) ?? 0,
    gridW: num(attrs.grid_w),
    batteryW: num(attrs.battery_w),
    degraded: attrs.degraded === true,
    // Die Fehlerbezeichner der Integration nutzen Unterstriche.
    errors: errors.map((e) => e.replace(/_/g, '-')) as SurplusResult['errors'],
    coverage: num(attrs.coverage) ?? 1,
    smoothingWindow: num(attrs.smoothing_window) ?? 0,
    batterySoc: num(attrs.battery_soc),
  };
}

/** Batterieleistung als Reading, fuer das Badge. */
export function batteryReadingFromIntegration(
  hass: HomeAssistant,
  handle: IntegrationHandle,
): Reading {
  const attrs = (hass.states[handle.surplusEntity]?.attributes ?? {}) as Record<string, unknown>;
  const w = num(attrs.battery_w);
  return w === null ? { w: null, reason: 'missing' } : { w };
}

/**
 * Baut die Verbraucherliste aus den Entitaeten der Integration.
 *
 * Alle Angaben stammen aus den Attributen des Ampel-Sensors; die Karte haelt
 * dafuer keine eigene Konfiguration.
 */
export function viewsFromIntegration(
  hass: HomeAssistant,
  handle: IntegrationHandle,
  now: number,
): DeviceView[] {
  const views: DeviceView[] = [];

  for (const device of handle.devices) {
    const statusObj = hass.states[device.roles[ROLE_STATUS]];
    if (!statusObj) continue;

    const attrs = statusObj.attributes as Record<string, unknown>;
    const switchEntity = String(attrs.switch_entity ?? '');
    if (!switchEntity) continue;

    const config: DeviceConfig = {
      id: String(attrs.consumer_id ?? device.deviceId),
      switch_entity: switchEntity,
      power_entity: attrs.power_entity ? String(attrs.power_entity) : undefined,
      name: attrs.consumer_name ? String(attrs.consumer_name) : undefined,
      min_power: num(attrs.min_power) ?? undefined,
      max_power: num(attrs.max_power) ?? undefined,
      // Die Integration setzt die Zeiten durch; die Karte zeigt sie nur an.
      priority_entity: device.roles[ROLE_PRIORITY],
      auto_entity: device.roles[ROLE_MANAGED],
    };

    const rank = num(attrs.rank);
    const status = String(statusObj.state) as DeviceStatus;

    views.push({
      config,
      index: rank === null ? views.length : rank - 1,
      configIndex: views.length,
      name: config.name ?? switchEntity,
      icon: undefined,
      isOn: attrs.is_on === true,
      available: status !== 'unavailable',
      managed: attrs.managed !== false,
      autoSwitchable: Boolean(device.roles[ROLE_MANAGED]),
      powerW: num(attrs.power_w),
      requiredW: num(attrs.required_w) ?? 0,
      status,
      headroomW: num(attrs.headroom_w),
      lock: lockFromEntity(hass, device.roles[ROLE_LOCKED_UNTIL], now),
    });
  }

  // Nach Rang sortieren — die Integration bestimmt die Reihenfolge.
  return views.sort((a, b) => a.index - b.index);
}

/**
 * Sperrzeit aus dem Zeitstempel der Integration.
 *
 * Das ist die eingeloeste Zusage aus dem Integrationsvertrag: statt aus
 * `last_changed` zu schaetzen — was manuelles Schalten und Neustarts
 * verfaelschen — steht hier der exakte Zeitpunkt.
 */
function lockFromEntity(hass: HomeAssistant, entityId: string | undefined, now: number): LockState {
  const none: LockState = { kind: 'none', remainingS: 0 };
  if (!entityId) return none;

  const stateObj = hass.states[entityId];
  if (!stateObj) return none;

  const until = Date.parse(stateObj.state);
  if (!Number.isFinite(until)) return none;

  const remaining = (until - now) / 1000;
  if (remaining <= 0) return none;

  const kind = stateObj.attributes?.lock_kind;
  return {
    kind: kind === 'min_runtime' ? 'min_runtime' : 'min_off_time',
    remainingS: Math.ceil(remaining),
  };
}
