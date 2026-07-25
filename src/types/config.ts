/**
 * Konfigurationsschema der Karte.
 *
 * Die Feldnamen sind zugleich der Vertrag mit der spaeteren Integration
 * (siehe docs/integration-contract.md): sie liest diese Struktur aus der
 * Lovelace-Config und uebernimmt sie 1:1 in ihre ConfigEntry.options.
 * Deshalb: keine verschachtelten Objekte in DeviceConfig, damit ein
 * Copy&Paste-Fallback des devices-Blocks funktioniert.
 */

import type { LovelaceCardConfig } from './hass';

export type MeterMode = 'grid' | 'split';
export type SecondaryInfo = 'power' | 'status' | 'both';

/**
 * Wie die Batterie in den Ueberschuss eingeht.
 *
 * - `charge_only`: Ladeleistung zaehlt als umlenkbarer Ueberschuss, Entladung
 *   wird ignoriert. Beantwortet die Frage "wie viel kann ich einschalten, ohne
 *   Netzstrom zu ziehen" — die Batterie darf dabei mitarbeiten.
 * - `full`: Entladung wird zusaetzlich abgezogen. Zeigt den reinen
 *   PV-Ueberschuss (Erzeugung minus Hauslast) und behandelt gespeicherte
 *   Energie als etwas, das nicht verbraucht werden soll.
 */
export type BatteryMode = 'charge_only' | 'full';

/**
 * Was der Schalter in der Geraetezeile tut.
 *
 * - `device`: schaltet die Geraete-Entitaet (Verhalten bis v0.2).
 * - `automation`: schaltet `auto_entity`, also die Teilnahme an der Automatik.
 *   Das Geraet selbst bleibt ueber den Detail-Dialog bedienbar.
 * - `auto`: `automation`, sobald ein `auto_entity` konfiguriert ist, sonst
 *   `device`. Standard, damit bestehende Konfigurationen sich nicht aendern.
 */
export type SwitchAction = 'device' | 'automation' | 'auto';

/**
 * Erbt von LovelaceCardConfig (und damit dessen Index-Signatur), damit
 * setConfig zur LovelaceCard-Schnittstelle passt und unbekannte Schluessel aus
 * einer aelteren Config nicht zum Typfehler werden.
 */
export interface EnergyManagerCardConfig extends LovelaceCardConfig {
  type: string;

  /* Darstellung */
  title?: string;
  /** W; Obergrenze der Ueberschussleiste. Default: max(3000, Summe max_power), auf 500 aufgerundet. */
  scale_max?: number;
  compact?: boolean;
  show_surplus_bar?: boolean;
  /** Default: true, sobald eine Batterie konfiguriert ist. */
  show_battery?: boolean;
  show_priority?: boolean;
  secondary_info?: SecondaryInfo;
  /** Default 'auto'. */
  switch_action?: SwitchAction;
  /**
   * Sortieren direkt im Dashboard erlauben. Default true, sobald alle
   * Verbraucher einen `priority_entity` haben — ohne Helfer waere die neue
   * Reihenfolge nach dem Neuladen wieder weg.
   *
   * Das Sortieren ist ein Modus, den ein Symbol im Kartenkopf einschaltet:
   * dauerhaft sichtbare Griffe wuerden auf Beruehrungsbildschirmen beim
   * Scrollen versehentlich Prioritaeten verschieben.
   */
  allow_reorder?: boolean;

  /* Zaehlerquellen */
  /** Default: 'grid', wenn grid_entity gesetzt ist, sonst 'split'. */
  meter_mode?: MeterMode;

  /** Modus 'grid': bidirektionaler Netzsensor. Nach invert_grid gilt >0 = Bezug, <0 = Einspeisung. */
  grid_entity?: string;
  invert_grid?: boolean;

  /** Modus 'split': getrennte Sensoren, beide stets positiv. */
  consumption_entity?: string;
  production_entity?: string;
  /** true, wenn der Hausverbrauchssensor die Batterieladung bereits enthaelt. */
  consumption_includes_battery?: boolean;

  /* Hausbatterie, optional */
  battery_soc_entity?: string;
  /** Nach battery_invert gilt >0 = Laden, <0 = Entladen. */
  battery_power_entity?: string;
  battery_invert?: boolean;
  /** Alternative zu battery_power_entity: zwei stets positive Sensoren. */
  battery_charge_entity?: string;
  battery_discharge_entity?: string;
  /** Default 'charge_only'. */
  battery_mode?: BatteryMode;
  /** 0..100. Darunter hat das Laden der Batterie Vorrang vor Verbrauchern. */
  battery_min_soc?: number;
  /** W, die immer der Batterie vorbehalten bleiben. Default 0. */
  battery_reserve_w?: number;

  /* Glaettung */
  /** s; 0 schaltet die Glaettung ab. Default 60. */
  smoothing_window?: number;
  /** s; Sampling- und Render-Takt. Default 5. */
  update_interval?: number;

  /** Array-Reihenfolge = Prioritaet, Index 0 = hoechste. */
  devices: DeviceConfig[];
}

export interface DeviceConfig {
  /**
   * Stabile UUID, vom Editor per crypto.randomUUID() vergeben.
   * Dient als repeat()-Key beim Sortieren und als Schluessel fuer den
   * Laufzeitzustand der spaeteren Integration.
   */
  id?: string;

  switch_entity: string;
  /** Ist-Leistung. Fehlt sie, dient max_power als Schaetzung. */
  power_entity?: string;
  name?: string;
  icon?: string;

  /**
   * input_number, in dem die Prioritaet dieses Verbrauchers steht (1 = hoechste).
   *
   * Ist er gesetzt, bestimmt SEIN Wert die Reihenfolge — nicht mehr die Position
   * im devices-Array. Nur so laesst sich im Dashboard sortieren, denn eine Karte
   * kann ihre eigene Konfiguration zur Laufzeit nicht schreiben.
   *
   * Damit gibt es zwei moegliche Quellen fuer dieselbe Aussage. Die Regel lautet
   * deshalb: entweder ALLE Verbraucher haben einen Prioritaets-Helfer, oder
   * keiner. Gemischte Konfigurationen meldet der Editor als Warnung.
   */
  priority_entity?: string;

  /**
   * input_boolean (oder switch), das angibt, ob dieser Verbraucher an der
   * Automatik teilnimmt. Ist er gesetzt, schaltet der Toggle in der Zeile
   * diesen Helfer statt der Geraete-Entitaet; das Geraet selbst bleibt ueber
   * den Detail-Dialog bedienbar.
   *
   * Die Laufzeit-Entsprechung zum statischen `managed`.
   */
  auto_entity?: string;

  /* Fuer die Automatik. Die Karte nutzt davon min_power/max_power fuer die
     Ampel und min_runtime/min_off_time fuer die Sperrzeit-Anzeige. */
  /** W, Einschaltschwelle. Default: max_power. */
  min_power?: number;
  /** W, Nennleistung. */
  max_power?: number;
  /** W, Totband gegen Pendeln. Default 0. */
  hysteresis?: number;

  /* Zeitschutz gegen Takten — vier komplementaere Groessen, siehe README. */
  /** s: nach dem EINschalten mindestens so lange AN bleiben. */
  min_runtime?: number;
  /** s: nach dem AUSschalten mindestens so lange AUS bleiben. */
  min_off_time?: number;
  /** s: Ueberschuss muss so lange ununterbrochen reichen, bevor eingeschaltet wird. */
  turn_on_delay?: number;
  /** s: Defizit muss so lange ununterbrochen anliegen, bevor ausgeschaltet wird. */
  turn_off_delay?: number;

  /**
   * Statische Teilnahme an der Automatik. Default true.
   * Wird von `auto_entity` uebersteuert, sobald dieser gesetzt ist.
   */
  managed?: boolean;
  /** Sicherheitsabfrage vor dem Schalten. */
  confirm?: boolean;
}
