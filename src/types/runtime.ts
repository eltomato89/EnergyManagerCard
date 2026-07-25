import type { BatteryMode, DeviceConfig, MeterMode } from './config';

/* ------------------------------------------------------------------ */
/* Sensorwerte                                                         */
/* ------------------------------------------------------------------ */

export type ReadingReason =
  /** Entity gar nicht konfiguriert oder nicht in hass.states vorhanden. */
  | 'missing'
  /** State ist unavailable/unknown/leer. */
  | 'unavailable'
  /** State laesst sich nicht in eine endliche Zahl wandeln. */
  | 'nan'
  /** Einheit ist keine Leistung (z.B. kWh oder %) — haeufigster Konfigurationsfehler. */
  | 'wrong-unit';

export interface Reading {
  /** Wert in Watt, oder null wenn nicht verwertbar. */
  w: number | null;
  reason?: ReadingReason;
  /** unit_of_measurement fehlte, W wurde angenommen. */
  assumedUnit?: boolean;
  /** Tatsaechlich vorgefundene Einheit, fuer Fehlermeldungen. */
  unit?: string;
}

/* ------------------------------------------------------------------ */
/* Ueberschuss                                                         */
/* ------------------------------------------------------------------ */

export type SurplusError =
  | 'missing-grid'
  | 'missing-production'
  | 'missing-consumption'
  | 'grid-unavailable'
  | 'production-unavailable'
  | 'consumption-unavailable'
  | 'wrong-unit';

export interface SurplusInput {
  mode: MeterMode;
  /** Bereits invertiert. */
  grid: Reading;
  production: Reading;
  consumption: Reading;
  /** Bereits invertiert bzw. aus charge - discharge zusammengesetzt. */
  battery: Reading;
  batteryConfigured: boolean;
  batteryMode: BatteryMode;
  batterySoc: number | null;
  consumptionIncludesBattery: boolean;
  batteryMinSoc?: number;
  batteryReserveW: number;
}

export interface SurplusResult {
  /** W vor Reserve; null = nicht berechenbar. */
  raw: number | null;
  /**
   * W nach Reserve und SoC-Regel. Negativ bedeutet ein Defizit gegenueber der
   * Erzeugung — NICHT zwangslaeufig Netzbezug in gleicher Hoehe, denn die
   * Batterie kann einen Teil davon stuetzen. Fuer den tatsaechlichen
   * Zaehlerwert siehe `gridW`.
   */
  available: number | null;
  /** Beitrag der Batterie in W, fuer Diagnose. */
  batteryCorrection: number;
  /** Tatsaechliche Netzleistung: >0 Bezug, <0 Einspeisung. */
  gridW: number | null;
  /** Tatsaechliche Batterieleistung: >0 Laden, <0 Entladen. */
  batteryW: number | null;
  /** Batterie konfiguriert, liefert aber keinen Wert. */
  degraded: boolean;
  errors: SurplusError[];
}

/* ------------------------------------------------------------------ */
/* Geraete                                                             */
/* ------------------------------------------------------------------ */

export type DeviceStatus =
  /** An, Ueberschuss deckt den Verbrauch. */
  | 'on_ok'
  /** An, aber es wird Netzstrom bezogen. */
  | 'on_deficit'
  /** Aus, Ueberschuss wuerde reichen. */
  | 'off_ready'
  /** Aus, Ueberschuss fast ausreichend (>= 80 %). */
  | 'off_close'
  /** Aus, Ueberschuss reicht nicht. */
  | 'off_insufficient'
  /** Schalt-Entity fehlt/unavailable oder Ueberschuss unbekannt. */
  | 'unavailable';

export type LockKind = 'none' | 'min_runtime' | 'min_off_time';

export interface LockState {
  kind: LockKind;
  /** Verbleibende Sekunden; 0 = keine Sperre. */
  remainingS: number;
}

export interface DeviceView {
  config: DeviceConfig;
  /** Rang in der Prioritaetsreihenfolge, 0-basiert (0 = hoechste). */
  index: number;
  /** Position im devices-Array. Fuer Umsortieren und stabile Keys noetig. */
  configIndex: number;
  name: string;
  icon?: string;
  isOn: boolean;
  available: boolean;
  /**
   * Nimmt an der Automatik teil. Aus `auto_entity`, sonst aus `managed`.
   * Beeinflusst die Ampel NICHT — ein nicht verwaltetes Geraet zeigt weiter
   * an, ob der Ueberschuss reichen wuerde.
   */
  managed: boolean;
  /** Automatik ist ueber eine Entitaet steuerbar (Toggle statt nur Anzeige). */
  autoSwitchable: boolean;
  /** Ist-Leistung in W, oder null. */
  powerW: number | null;
  /** Angenommener Bedarf in W fuer die Ampel. */
  requiredW: number;
  status: DeviceStatus;
  /** Verbleibendes Budget nach diesem Geraet, oder null. */
  headroomW: number | null;
  lock: LockState;
}
