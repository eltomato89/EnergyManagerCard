import { LitElement, html, nothing } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { repeat } from 'lit/directives/repeat.js';
import { mdiAlertCircleOutline, mdiAlertOutline, mdiCheck, mdiSortVariant } from '@mdi/js';
import { CARD_TAG, DEFAULT_SMOOTHING_WINDOW, DEFAULT_UPDATE_INTERVAL, EDITOR_TAG } from '../const';
import { haveTrackedStatesChanged } from '../lib/diff';
import { computeDeviceViews, computeGrossSurplus, resolveScaleMax } from '../lib/device-status';
import { loadSortable } from '../lib/ha-elements';
import {
  hasCompletePriorityEntities,
  moveItem,
  orderDevices,
  priorityUpdates,
} from '../lib/priority';
import { TimeWeightedWindow } from '../lib/smoothing';
import { combineBatteryReadings, invertReading, readPercent, readPowerW } from '../lib/state';
import { applyReserve, computeSurplus } from '../lib/surplus';
import { hasBattery, resolveMeterMode, trackedEntities, validateConfig } from '../lib/validate';
import { localizer, type LocalizeFn } from '../localize/localize';
import { cardStyles, themeVariables } from '../styles';
import type { EnergyManagerCardConfig } from '../types/config';
import type {
  HomeAssistant,
  LovelaceCard,
  LovelaceCardEditor,
  LovelaceGridOptions,
} from '../types/hass';
import type { DeviceView, Reading, SurplusResult } from '../types/runtime';

import './surplus-bar';
import './battery-badge';
import './device-row';

@customElement(CARD_TAG)
export class EnergyManagerCard extends LitElement implements LovelaceCard {
  public static async getConfigElement(): Promise<LovelaceCardEditor> {
    await import('../editor/energy-manager-card-editor');
    return document.createElement(EDITOR_TAG) as LovelaceCardEditor;
  }

  public static getStubConfig(
    hass: HomeAssistant,
    entities: string[],
  ): Partial<EnergyManagerCardConfig> {
    const powerSensors = entities.filter(
      (id) => hass.states[id]?.attributes?.device_class === 'power',
    );
    // Der Netzsensor heisst fast immer so — besser raten als leer starten.
    const grid = powerSensors.find((id) => /grid|netz|meter|zaehler|zähler/i.test(id));

    return {
      type: `custom:${CARD_TAG}`,
      ...(grid ? { grid_entity: grid } : {}),
      devices: [],
    };
  }

  @state() private _config?: EnergyManagerCardConfig;
  /** Zaehler, der einen Re-Render ausloest, ohne hass reaktiv zu machen. */
  @state() private _tick = 0;
  @state() private _reordering = false;
  @state() private _sortableReady = false;
  @state() private _reorderError = false;

  private _hass?: HomeAssistant;
  private _tracked: Set<string> = new Set();
  private _window = new TimeWeightedWindow(DEFAULT_SMOOTHING_WINDOW * 1000);
  private _timer?: number;
  private _localize: LocalizeFn = localizer('en');

  /**
   * `hass` ist bewusst KEINE reaktive Property: der Setter feuert bei jeder
   * Zustandsaenderung im gesamten System. Stattdessen wird gegen die Menge der
   * beobachteten Entitaeten gefiltert und nur dann ein Render angestossen.
   */
  public set hass(hass: HomeAssistant) {
    const old = this._hass;
    this._hass = hass;

    if (old?.language !== hass?.language) {
      this._localize = localizer(hass?.language);
    }

    if (!this._config) return;

    if (haveTrackedStatesChanged(old, hass, this._tracked)) {
      this._sample();
      this._tick++;
    }
  }

  public get hass(): HomeAssistant {
    return this._hass as HomeAssistant;
  }

  public setConfig(config: EnergyManagerCardConfig): void {
    validateConfig(config);

    // Die Config aus Lovelace wird geteilt — immer klonen, nie in-place aendern.
    this._config = { ...config, devices: [...(config.devices ?? [])] };
    this._tracked = trackedEntities(this._config);

    this._window = new TimeWeightedWindow(this._smoothingWindowS() * 1000);
    this._restartTimer();
  }

  public getCardSize(): number {
    return 2 + (this._config?.devices.length ?? 0);
  }

  public getGridOptions(): LovelaceGridOptions {
    return {
      columns: 12,
      min_columns: 6,
      rows: 2 + (this._config?.devices.length ?? 0),
      min_rows: 3,
    };
  }

  public override connectedCallback(): void {
    super.connectedCallback();
    this._restartTimer();
    document.addEventListener('visibilitychange', this._onVisibilityChange);
  }

  public override disconnectedCallback(): void {
    super.disconnectedCallback();
    this._stopTimer();
    document.removeEventListener('visibilitychange', this._onVisibilityChange);
  }

  protected override render() {
    const config = this._config;
    if (!config) return nothing;

    const surplus = this._computeSurplus();
    const availableW = surplus.available;
    const views = computeDeviceViews(config.devices, this._hass, availableW, Date.now());
    const { grossW, allocatedW } = computeGrossSurplus(views, availableW);
    const scaleMax = resolveScaleMax(config.devices, config.scale_max, grossW);

    return html`
      <ha-card .header=${config.title}>
        <div class="card-content">
          ${this.renderHeader(config, surplus)}
          ${
            config.show_surplus_bar === false
              ? nothing
              : html`
                  <energy-manager-surplus-bar
                    .availableW=${availableW}
                    .allocatedW=${allocatedW}
                    .scaleMax=${scaleMax}
                    .smoothingWindow=${this._smoothingWindowS()}
                    .coverage=${this._window.coverage(Date.now())}
                    .degraded=${surplus.degraded}
                    .gridW=${surplus.gridW}
                    .batteryW=${surplus.batteryW}
                    .locale=${this._hass?.locale}
                    .localize=${this._localize}
                  ></energy-manager-surplus-bar>
                `
          }
          ${this.renderErrors(surplus)} ${this.renderDevices(views)}
        </div>
      </ha-card>
    `;
  }

  private renderHeader(config: EnergyManagerCardConfig, surplus: SurplusResult) {
    const showBattery = config.show_battery ?? hasBattery(config);
    const canReorder = this._canReorder();
    if (!showBattery && !surplus.degraded && !canReorder) return nothing;

    return html`
      <div class="header-row">
        ${
          canReorder
            ? html`<ha-icon-button
                class="reorder-toggle ${this._reordering ? 'active' : ''}"
                .path=${this._reordering ? mdiCheck : mdiSortVariant}
                .label=${this._localize(this._reordering ? 'card.reorder_done' : 'card.reorder_start')}
                @click=${this._toggleReordering}
              ></ha-icon-button>`
            : html`<span></span>`
        }
        ${
          showBattery
            ? html`<energy-manager-battery-badge
                .soc=${readPercent(this._hass, config.battery_soc_entity)}
                .powerW=${this._batteryReading().w}
                .locale=${this._hass?.locale}
                .localize=${this._localize}
              ></energy-manager-battery-badge>`
            : nothing
        }
      </div>
    `;
  }

  private renderErrors(surplus: SurplusResult) {
    if (surplus.errors.length === 0 && !surplus.degraded) return nothing;

    // Nur den ersten Fehler zeigen: mehrere gleichzeitig sind fast immer
    // Folgefehler derselben Ursache.
    const message =
      surplus.errors.length > 0
        ? this._localize(`errors.${surplus.errors[0]}`)
        : this._localize('card.degraded');

    return html`
      <div class="notice ${surplus.errors.length > 0 ? 'error' : ''}">
        <ha-svg-icon
          .path=${surplus.errors.length > 0 ? mdiAlertCircleOutline : mdiAlertOutline}
        ></ha-svg-icon>
        <span>${message}</span>
      </div>
    `;
  }

  private renderDevices(views: DeviceView[]) {
    if (views.length === 0) {
      return html`<div class="empty">${this._localize('card.no_devices')}</div>`;
    }

    const config = this._config as EnergyManagerCardConfig;
    const switchAction = this._switchAction();

    const rows = repeat(
      views,
      (view) => view.config.id ?? view.config.switch_entity,
      (view, i) => html`
        <energy-manager-device-row
          .hass=${this._hass}
          .view=${view}
          .locale=${this._hass?.locale}
          .localize=${this._localize}
          .secondaryInfo=${config.secondary_info ?? 'both'}
          .showPriority=${config.show_priority ?? true}
          .switchAction=${switchAction}
          .reordering=${this._reordering}
          .isFirst=${i === 0}
          .isLast=${i === views.length - 1}
          @device-move=${this._deviceMove}
        ></energy-manager-device-row>
      `,
    );

    if (!this._reordering) return html`<div class="devices">${rows}</div>`;

    return html`
      <div class="reorder-hint">${this._localize('card.reorder_hint')}</div>
      ${
        this._sortableReady
          ? // ha-sortable braucht genau EIN Kind und rendert ins Light DOM.
            html`<ha-sortable handle-selector=".handle" @item-moved=${this._itemMoved}>
              <div class="devices reordering">${rows}</div>
            </ha-sortable>`
          : // Ohne ha-sortable bleiben die Pfeiltasten — die Karte ist damit
            // vollstaendig bedienbar, nur ohne Ziehen.
            html`<div class="devices reordering">${rows}</div>`
      }
      ${
        this._reorderError
          ? html`<div class="notice error">
              <ha-svg-icon .path=${mdiAlertCircleOutline}></ha-svg-icon>
              <span>${this._localize('card.reorder_failed')}</span>
            </div>`
          : nothing
      }
    `;
  }

  /* ---------------------------------------------------------------- */
  /* Sortieren                                                         */
  /* ---------------------------------------------------------------- */

  /**
   * Sortieren im Dashboard geht nur, wenn ALLE Verbraucher einen
   * Prioritaets-Helfer haben — sonst waere die neue Reihenfolge nach dem
   * Neuladen teilweise wieder weg, und das ist schlimmer als gar kein
   * Sortieren.
   */
  private _canReorder(): boolean {
    const config = this._config;
    if (!config) return false;
    if (config.allow_reorder === false) return false;
    return hasCompletePriorityEntities(config.devices);
  }

  private _switchAction(): 'device' | 'automation' {
    const config = this._config as EnergyManagerCardConfig;
    const mode = config.switch_action ?? 'auto';
    if (mode === 'device' || mode === 'automation') return mode;
    // 'auto': Automatik nur, wenn ueberhaupt ein Helfer da ist.
    return config.devices.some((device) => device.auto_entity) ? 'automation' : 'device';
  }

  private _toggleReordering = async (): Promise<void> => {
    this._reordering = !this._reordering;
    this._reorderError = false;

    // ha-sortable liegt in einem lazy geladenen Chunk. Erst beim Betreten des
    // Sortiermodus nachladen, damit die Karte im Normalbetrieb nichts kostet.
    if (this._reordering && !this._sortableReady) {
      this._sortableReady = await loadSortable();
    }
  };

  private _itemMoved = (ev: CustomEvent<{ oldIndex: number; newIndex: number }>): void => {
    ev.stopPropagation();
    void this._applyOrder(ev.detail.oldIndex, ev.detail.newIndex);
  };

  private _deviceMove = (ev: CustomEvent<{ index: number; delta: number }>): void => {
    ev.stopPropagation();
    void this._applyOrder(ev.detail.index, ev.detail.index + ev.detail.delta);
  };

  /**
   * Schreibt die neue Reihenfolge in die Prioritaets-Helfer.
   *
   * Die Karte kann ihre eigene Konfiguration nicht speichern — die Reihenfolge
   * lebt deshalb ausschliesslich in den input_number-Entitaeten.
   */
  private async _applyOrder(from: number, to: number): Promise<void> {
    const config = this._config;
    if (!config || !this._hass) return;

    const ordered = orderDevices(config.devices, this._hass);
    if (to < 0 || to >= ordered.length || from === to) return;

    const updates = priorityUpdates(moveItem(ordered, from, to), this._hass);
    if (updates.length === 0) return;

    // Ein Service-Call auf eine geloeschte Entitaet ist in HA KEIN Fehler — er
    // laeuft still ins Leere. Fehlende Helfer muessen deshalb vorher auffallen,
    // sonst sieht Sortieren aus, als haette es funktioniert.
    const missing = updates.filter((update) => !this._hass?.states?.[update.entityId]);
    if (missing.length > 0) {
      this._reorderError = true;
      this._tick++;
      return;
    }

    // Parallel: die Aufrufe betreffen durchweg verschiedene Entitaeten, teilen
    // sich also keinen Zustand. Nacheinander waeren es bei acht Verbrauchern
    // acht Round-Trips — ueber eine entfernte Verbindung sekundenlang.
    const results = await Promise.allSettled(
      updates.map((update) =>
        this._hass!.callService('input_number', 'set_value', {
          entity_id: update.entityId,
          value: update.value,
        }),
      ),
    );

    // Typischer Grund fuer eine Ablehnung: der Wert liegt ausserhalb des beim
    // Helfer eingestellten Bereichs. input_number clampt nicht, es weist ab.
    this._reorderError = results.some((result) => result.status === 'rejected');
    this._tick++;
  }

  /* ---------------------------------------------------------------- */
  /* Berechnung                                                        */
  /* ---------------------------------------------------------------- */

  /** Momentanwerte einsammeln und in das Mittelungsfenster schieben. */
  private _sample(): void {
    const raw = this._rawSurplus().raw;
    this._window.push(raw, Date.now());
  }

  private _rawSurplus(): SurplusResult {
    const config = this._config as EnergyManagerCardConfig;
    const battery = this._batteryReading();

    return computeSurplus({
      mode: resolveMeterMode(config),
      grid: invertReading(readPowerW(this._hass, config.grid_entity), config.invert_grid),
      production: readPowerW(this._hass, config.production_entity),
      consumption: readPowerW(this._hass, config.consumption_entity),
      battery,
      batteryConfigured: hasBattery(config),
      batteryMode: config.battery_mode ?? 'charge_only',
      batterySoc: readPercent(this._hass, config.battery_soc_entity),
      consumptionIncludesBattery: config.consumption_includes_battery ?? false,
      batteryMinSoc: config.battery_min_soc,
      batteryReserveW: config.battery_reserve_w ?? 0,
    });
  }

  /**
   * Geglaetteter Ueberschuss.
   *
   * Wichtig ist die Reihenfolge: geglaettet wird der ROHwert, die Reserve- und
   * SoC-Regel kommt danach. Andersherum liefe die Ladevorrang-Regel um das
   * Mittelungsfenster verzoegert nach.
   */
  private _computeSurplus(): SurplusResult {
    const config = this._config as EnergyManagerCardConfig;
    const instant = this._rawSurplus();

    if (this._smoothingWindowS() <= 0 || instant.raw === null) return instant;

    const smoothedRaw = this._window.value(Date.now());
    if (smoothedRaw === null) return instant;

    const available = applyReserve(
      smoothedRaw,
      readPercent(this._hass, config.battery_soc_entity),
      config.battery_min_soc,
      config.battery_reserve_w ?? 0,
    );

    return {
      ...instant,
      raw: Math.round(smoothedRaw),
      available: available === null ? null : Math.round(available),
    };
  }

  private _batteryReading(): Reading {
    const config = this._config as EnergyManagerCardConfig;

    if (config.battery_charge_entity || config.battery_discharge_entity) {
      return combineBatteryReadings(
        readPowerW(this._hass, config.battery_charge_entity),
        readPowerW(this._hass, config.battery_discharge_entity),
      );
    }

    return invertReading(
      readPowerW(this._hass, config.battery_power_entity),
      config.battery_invert,
    );
  }

  private _smoothingWindowS(): number {
    return this._config?.smoothing_window ?? DEFAULT_SMOOTHING_WINDOW;
  }

  /* ---------------------------------------------------------------- */
  /* Takt                                                              */
  /* ---------------------------------------------------------------- */

  /**
   * Eigener Takt zusaetzlich zum hass-Setter: das gleitende Mittel und der
   * Sperrzeit-Countdown muessen auch dann weiterlaufen, wenn sich gerade kein
   * Sensor meldet.
   */
  private _restartTimer(): void {
    this._stopTimer();
    if (!this.isConnected || !this._config || document.hidden) return;

    const intervalS = this._config.update_interval ?? DEFAULT_UPDATE_INTERVAL;
    this._timer = window.setInterval(
      () => {
        this._sample();
        this._tick++;
      },
      Math.max(1, intervalS) * 1000,
    );
  }

  private _stopTimer(): void {
    if (this._timer !== undefined) {
      clearInterval(this._timer);
      this._timer = undefined;
    }
  }

  /** In Hintergrund-Tabs pausieren — sonst laeuft der Takt sinnlos weiter. */
  private _onVisibilityChange = (): void => {
    if (document.hidden) this._stopTimer();
    else this._restartTimer();
  };

  static override styles = [themeVariables, cardStyles];
}

declare global {
  interface HTMLElementTagNameMap {
    'energy-manager-card': EnergyManagerCard;
  }
}
