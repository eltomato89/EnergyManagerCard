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

/**
 * Die Stufen eines regelbaren Verbrauchers.
 *
 * Nur mit Integration vorhanden: Das Raster stammt aus der Steuerentitaet, und
 * die Karte leitet es nicht selbst ab — sonst laege dieselbe Umrechnung an zwei
 * Stellen und liefe auseinander.
 */
export interface LevelState {
  /** Gestellte Stufe in W, oder null wenn nicht lesbar. */
  w: number | null;
  /**
   * Stufe, auf die die Automatik gehen wuerde. Weicht sie von `w` ab, steht ein
   * Stufenwechsel an — und `blockedBy` sagt, warum er noch nicht geschehen ist.
   */
  setpointW: number | null;
  /** Position der gestellten Stufe, 1-basiert wie `rank`. Null wenn unbekannt. */
  index: number | null;
  count: number;
  minW: number;
  maxW: number;
  /** Herkunft des Rasters: number_w, number_a oder select. */
  source: string;
  /**
   * Hoechste Leistung, die das Geraet seit dem Einschalten erreicht hat.
   *
   * Nicht dasselbe wie der Sollwert: Ein Fahrzeug laedt mit 10 A, obwohl 16 A
   * angeboten sind.
   */
  observedMaxW: number | null;
  /**
   * Ist die Leiter deswegen beschnitten?
   *
   * Die Antwort auf "warum geht sie nicht hoeher": Nicht der Ueberschuss fehlt,
   * das Geraet nimmt nicht mehr. Ohne diesen Hinweis saehe eine gekappte Leiter
   * aus wie ein Geraet mit weniger Stufen.
   */
  capped: boolean;
}

export interface LockState {
  kind: LockKind;
  /** Verbleibende Sekunden; 0 = keine Sperre. */
  remainingS: number;
}

export interface DeviceView {
  config: DeviceConfig;
  /**
   * Art der Zeile. 'battery' ist die Hausbatterie als verschiebbare Last: sie
   * hat einen Rang und belegt Budget, wird aber nicht geschaltet (kein
   * Schalter, kein Sperrzeit-Countdown). Fehlt das Feld, ist es ein normaler
   * Verbraucher.
   */
  kind?: 'consumer' | 'battery';
  /** Ladestand in Prozent — nur fuer kind 'battery'. */
  soc?: number | null;
  /**
   * Ladestand am oberen Anschlag — nur fuer kind 'battery'.
   *
   * Kommt als `battery_full` von der Integration, statt hier aus dem Ladestand
   * abgeleitet zu werden: Wo die Grenze liegt, entscheidet die Integration, und
   * eine zweite Schwelle in der Karte liefe irgendwann auseinander.
   */
  full?: boolean;
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
  /**
   * Die Stufen, sofern der Verbraucher regelbar ist. Fehlt das Feld, ist er nur
   * schaltbar — daran erkennt die Zeile, dass es nichts zu regeln gibt.
   */
  levels?: LevelState;
  /**
   * Warum die Automatik diesen Verbraucher gerade nicht anfasst, aus
   * `blocked_by`. Nur mit Integration; ohne sie gibt es keine Automatik, deren
   * Untaetigkeit zu erklaeren waere.
   */
  blockedBy?: string;
  /**
   * Verbleibende Sekunden einer manuellen Uebersteuerung; 0 oder fehlend = keine.
   *
   * Nach einem Eingriff von aussen haelt sich die Automatik befristet fern.
   * Befristet und nicht dauerhaft, weil es Fehlerkennungen gibt, die nicht
   * wegzufiltern sind — ein Geraet, das seinen eigenen Zustand aendert.
   *
   * Optional, weil es das Konzept ohne Integration nicht gibt: Dort schaltet
   * niemand automatisch, den ein Eingriff von Hand uebersteuern koennte.
   */
  manualRemainingS?: number;
}

/**
 * Blockierungsgruende, bei denen die Automatik den Verbraucher **absichtlich**
 * liegen laesst — im Unterschied zu den Zeitbedingungen des Normalbetriebs.
 *
 * Nur diese daempfen den Statusbalken. Waere `settling` oder `turn_on_delay`
 * dabei, wuerde der Balken bei jedem gewoehnlichen Schaltvorgang kurz grau: Die
 * Verzoegerung laeuft vor jedem Einschalten, das Beruhigungsfenster nach jedem.
 * Grau heisst hier "hier greift die Automatik nicht ein", nicht "sie wartet
 * gerade".
 */
export const HANDS_OFF_BLOCKERS: ReadonlySet<string> = new Set([
  'not_managed',
  'unavailable',
  'forced',
  'manual',
]);
