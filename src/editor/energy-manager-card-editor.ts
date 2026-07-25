import { LitElement, css, html, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { EDITOR_TAG } from '../const';
import { fireEvent } from '../lib/events';
import { loadHaComponents } from '../lib/ha-elements';
import { applyHelperResults, canCreateHelpers, createMissingHelpers } from '../lib/helpers';
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
  @state() private _creatingHelpers = false;
  @state() private _helperError?: string;

  private _localize: LocalizeFn = localizer('en');

  public setConfig(config: EnergyManagerCardConfig): void {
    this._config = { ...config, devices: [...(config.devices ?? [])] };
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

    if (this._editing !== null && config.devices[this._editing]) {
      return html`
        <energy-manager-device-detail-editor
          .hass=${this.hass}
          .device=${config.devices[this._editing]}
          .localize=${this._localize}
          @device-changed=${this._deviceChanged}
          @detail-closed=${this._closeDetail}
        ></energy-manager-device-detail-editor>
      `;
    }

    return html`
      <ha-form
        .hass=${this.hass}
        .data=${config}
        .schema=${mainSchema(config)}
        .computeLabel=${this._computeLabel}
        .computeHelper=${this._computeHelper}
        @value-changed=${this._valueChanged}
      ></ha-form>

      <div class="section">
        <div class="section-title">${this._localize('editor.devices.label')}</div>
        <div class="section-helper">${this._localize('editor.devices.helper')}</div>
        <energy-manager-device-list-editor
          .hass=${this.hass}
          .devices=${config.devices}
          .localize=${this._localize}
          @devices-changed=${this._devicesChanged}
          @device-edit=${this._openDetail}
        ></energy-manager-device-list-editor>
        ${this.renderHelperSetup(config)}
      </div>

      ${this.renderWarnings(config)}
    `;
  }

  /**
   * Anlegen der Helfer, ohne die es weder Sortieren im Dashboard noch einen
   * Automatik-Schalter gibt. Von Hand waeren das zwei Helfer je Verbraucher —
   * samt passender Grenzen, an denen man sich leicht vertut.
   */
  private renderHelperSetup(config: EnergyManagerCardConfig) {
    if (config.devices.length === 0) return nothing;

    const missing = config.devices.filter(
      (device) => !device.priority_entity || !device.auto_entity,
    ).length;
    if (missing === 0) return nothing;

    if (!canCreateHelpers(this.hass)) {
      return html`<ha-alert alert-type="info"
        >${this._localize('editor.helpers.needs_admin')}</ha-alert
      >`;
    }

    return html`
      <div class="helper-setup">
        <div class="section-helper">${this._localize('editor.helpers.explain')}</div>
        <mwc-button
          raised
          .disabled=${this._creatingHelpers}
          @click=${this._createHelpers}
          .label=${
            this._creatingHelpers
              ? this._localize('editor.helpers.creating')
              : this._localize('editor.helpers.create', { count: missing })
          }
        ></mwc-button>
        ${
          this._helperError
            ? html`<ha-alert alert-type="error">${this._helperError}</ha-alert>`
            : nothing
        }
      </div>
    `;
  }

  private _createHelpers = async (): Promise<void> => {
    if (!this.hass || !this._config || this._creatingHelpers) return;

    this._creatingHelpers = true;
    this._helperError = undefined;

    try {
      const results = await createMissingHelpers(this.hass, this._config.devices);
      const failed = results.filter((result) => result.error);

      // Auch bei Teilfehlern uebernehmen, was angelegt wurde — sonst waeren die
      // erzeugten Helfer verwaist und der naechste Versuch legte sie doppelt an.
      this._emit({
        ...this._config,
        devices: applyHelperResults(this._config.devices, results),
      });

      if (failed.length > 0) {
        this._helperError = this._localize('editor.helpers.failed', {
          detail: failed[0].error ?? '',
        });
      }
    } catch (err) {
      this._helperError = err instanceof Error ? err.message : String(err);
    } finally {
      this._creatingHelpers = false;
    }
  };

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

  private _computeHelper = (schema: { name: string }): string | undefined => {
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
    this._emit({ ...next, devices: this._config.devices });
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

    const devices = [...this._config.devices];
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

    .helper-setup {
      display: flex;
      flex-direction: column;
      gap: 8px;
      margin-top: 12px;
      padding-top: 12px;
      border-top: 1px solid var(--divider-color, #e0e0e0);
    }

    .helper-setup mwc-button {
      align-self: flex-start;
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    'energy-manager-card-editor': EnergyManagerCardEditor;
  }
}
