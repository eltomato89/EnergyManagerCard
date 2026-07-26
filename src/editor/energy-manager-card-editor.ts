import { LitElement, css, html, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { EDITOR_TAG } from '../const';
import { fireEvent } from '../lib/events';
import { loadHaComponents } from '../lib/ha-elements';
import { findIntegration } from '../lib/integration';
import { collectWarnings } from '../lib/validate';
import { localizer, type LocalizeFn } from '../localize/localize';
import type { DeviceConfig, EnergyManagerCardConfig } from '../types/config';
import type { HomeAssistant, LovelaceCardEditor } from '../types/hass';
import { mergeConfig, stripEmpty } from './merge';
import { mainSchema } from './schema';

import './device-list-editor';
import './device-detail-editor';

@customElement(EDITOR_TAG)
export class EnergyManagerCardEditor extends LitElement implements LovelaceCardEditor {
  @property({ attribute: false }) public hass?: HomeAssistant;

  @state() private _config?: EnergyManagerCardConfig;
  /** Index des Geraets im Detailformular, oder null fuer die Listenansicht. */
  @state() private _editing: number | null = null;

  private _localize: LocalizeFn = localizer('en');

  /** true, wenn die Energy-Manager-Integration ueberhaupt installiert ist. */
  private _integrationAvailable(): boolean {
    return findIntegration(this.hass) !== null;
  }

  /**
   * true, wenn die Karte selbst rechnet — also ohne Energy-Manager-Integration
   * oder mit ausdruecklich abgeschaltetem `use_integration`.
   */
  private _standalone(): boolean {
    if (this._config?.use_integration === false) return true;
    return !this._integrationAvailable();
  }

  public setConfig(config: EnergyManagerCardConfig): void {
    // Die Config aus Lovelace wird geteilt — die Liste immer klonen. Fehlt sie,
    // bleibt sie weg: eine leere `devices: []` in eine Karte zu schreiben, die
    // ihre Verbraucher aus der Integration bezieht, waere nur Ballast.
    this._config = config.devices ? { ...config, devices: [...config.devices] } : { ...config };
  }

  protected override async firstUpdated(): Promise<void> {
    await loadHaComponents();
    this.requestUpdate();
  }

  protected override willUpdate(changed: Map<string, unknown>): void {
    if (changed.has('hass')) this._localize = localizer(this.hass?.language);
  }

  protected override render() {
    const config = this._config;
    if (!this.hass || !config) return nothing;

    const devices = config.devices ?? [];
    if (this._editing !== null && devices[this._editing]) {
      return html`
        <energy-manager-device-detail-editor
          .hass=${this.hass}
          .device=${devices[this._editing]}
          .localize=${this._localize}
          @device-changed=${this._deviceChanged}
          @detail-closed=${this._closeDetail}
        ></energy-manager-device-detail-editor>
      `;
    }

    const standalone = this._standalone();
    const integrationAvailable = this._integrationAvailable();

    return html`
      <ha-form
        .hass=${this.hass}
        .data=${config}
        .schema=${mainSchema(config, { standalone, integrationAvailable })}
        .computeLabel=${this._computeLabel}
        .computeHelper=${this._computeHelper}
        @value-changed=${this._valueChanged}
      ></ha-form>

      ${standalone ? this.renderDeviceList(devices) : this.renderIntegrationNotice()}
      ${standalone ? this.renderWarnings(config) : nothing}
    `;
  }

  private renderDeviceList(devices: DeviceConfig[]) {
    return html`
      <div class="section">
        <div class="section-title">${this._localize('editor.devices.label')}</div>
        <div class="section-helper">${this._localize('editor.devices.helper')}</div>
        <energy-manager-device-list-editor
          .hass=${this.hass}
          .devices=${devices}
          .localize=${this._localize}
          @devices-changed=${this._devicesChanged}
          @device-edit=${this._openDetail}
        ></energy-manager-device-list-editor>
      </div>
    `;
  }

  /**
   * Der Hinweis, der die Frage beantwortet, warum hier keine Verbraucher
   * stehen: Sie werden in der Integration gepflegt, und nur dort. Ohne diesen
   * Satz sieht die leere Liste nach einem Fehler aus.
   */
  private renderIntegrationNotice() {
    return html`
      <ha-alert alert-type="info">
        ${this._localize('editor.integration.detected')}
        <a
          href="/config/integrations/integration/energy_manager"
          target="_top"
          rel="noopener noreferrer"
          >${this._localize('editor.integration.open')}</a
        >
      </ha-alert>
    `;
  }

  private renderWarnings(config: EnergyManagerCardConfig) {
    const warnings = collectWarnings(config);
    if (warnings.length === 0) return nothing;

    return html`
      <div class="warnings">
        ${warnings.map(
          (warning) => html`
            <ha-alert alert-type="warning">
              ${this._localize(`warnings.${warning.code}`, { detail: warning.detail ?? '' })}
            </ha-alert>
          `,
        )}
      </div>
    `;
  }

  /* Beschriftungen kommen aus der Uebersetzung, nicht aus dem Schema — sonst
     laesst sich das Schema nicht sprachneutral wiederverwenden. */
  private _computeLabel = (schema: { name: string }): string =>
    this._localize(`editor.${schema.name}.label`);

  /**
   * Hilfetext zu einem Feld.
   *
   * Mit Integration gilt fuer einige Felder etwas anderes — Sortieren etwa
   * braucht dann keine Helfer, weil die Integration die Prioritaets-Entitaeten
   * mitbringt. Solche Felder haben einen zweiten Text unter
   * `…helper_integration`; fehlt er, gilt der normale.
   */
  private _computeHelper = (schema: { name: string }): string | undefined => {
    if (!this._standalone()) {
      const key = `editor.${schema.name}.helper_integration`;
      const text = this._localize(key);
      if (text !== key) return text;
    }

    const key = `editor.${schema.name}.helper`;
    const text = this._localize(key);
    return text === key ? undefined : text;
  };

  private _valueChanged = (ev: CustomEvent<{ value: EnergyManagerCardConfig }>): void => {
    ev.stopPropagation();
    if (!this._config) return;

    // ha-form liefert das vollstaendige Datenobjekt zurueck; die Geraeteliste
    // verwaltet sich getrennt und darf davon nicht ueberschrieben werden.
    const next = stripEmpty(ev.detail.value);
    this._emit({ ...next, ...(this._config.devices ? { devices: this._config.devices } : {}) });
  };

  private _devicesChanged = (ev: CustomEvent<{ devices: DeviceConfig[] }>): void => {
    ev.stopPropagation();
    if (!this._config) return;
    // Genau hier wandert die Prioritaet in die Config.
    this._emit({ ...this._config, devices: ev.detail.devices });
  };

  private _deviceChanged = (ev: CustomEvent<{ device: DeviceConfig }>): void => {
    ev.stopPropagation();
    if (!this._config || this._editing === null) return;

    const devices = [...(this._config.devices ?? [])];
    // ID beibehalten: sie ist der Schluessel fuer repeat() und die Integration.
    devices[this._editing] = mergeConfig(devices[this._editing], ev.detail.device);
    this._emit({ ...this._config, devices });
  };

  private _openDetail = (ev: CustomEvent<{ index: number }>): void => {
    ev.stopPropagation();
    this._editing = ev.detail.index;
  };

  private _closeDetail = (ev: Event): void => {
    ev.stopPropagation();
    this._editing = null;
  };

  private _emit(config: EnergyManagerCardConfig): void {
    this._config = config;
    fireEvent(this, 'config-changed', { config });
  }

  static override styles = css`
    :host {
      display: flex;
      flex-direction: column;
      gap: 16px;
    }

    .section-title {
      font-weight: 500;
      color: var(--primary-text-color);
    }

    .section-helper {
      color: var(--secondary-text-color);
      font-size: 0.85em;
      margin-bottom: 8px;
    }

    .warnings {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    'energy-manager-card-editor': EnergyManagerCardEditor;
  }
}
