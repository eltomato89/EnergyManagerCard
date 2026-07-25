import { LitElement, css, html, nothing } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { mdiArrowLeft } from '@mdi/js';
import { DEVICE_DETAIL_EDITOR_TAG } from '../const';
import { fireEvent } from '../lib/events';
import { loadHaComponents } from '../lib/ha-elements';
import type { LocalizeFn } from '../localize/localize';
import type { DeviceConfig } from '../types/config';
import type { HomeAssistant } from '../types/hass';
import { deviceSchema } from './schema';
import { stripEmpty } from './merge';

/** Detailformular fuer einen einzelnen Verbraucher. */
@customElement(DEVICE_DETAIL_EDITOR_TAG)
export class EnergyManagerDeviceDetailEditor extends LitElement {
  @property({ attribute: false }) public hass?: HomeAssistant;
  @property({ attribute: false }) public device!: DeviceConfig;
  @property({ attribute: false }) public localize!: LocalizeFn;

  protected override async firstUpdated(): Promise<void> {
    await loadHaComponents();
    this.requestUpdate();
  }

  protected override render() {
    if (!this.hass || !this.device) return nothing;

    return html`
      <div class="header">
        <ha-icon-button
          .path=${mdiArrowLeft}
          .label=${this.localize('editor.devices.back')}
          @click=${this._back}
        ></ha-icon-button>
        <span>${this.device.name || this.device.switch_entity}</span>
      </div>

      <ha-form
        .hass=${this.hass}
        .data=${this.device}
        .schema=${deviceSchema()}
        .computeLabel=${this._computeLabel}
        .computeHelper=${this._computeHelper}
        @value-changed=${this._valueChanged}
      ></ha-form>
    `;
  }

  private _computeLabel = (schema: { name: string }): string =>
    this.localize(`editor.${schema.name}.label`);

  private _computeHelper = (schema: { name: string }): string | undefined => {
    const key = `editor.${schema.name}.helper`;
    const text = this.localize(key);
    return text === key ? undefined : text;
  };

  private _back = (): void => {
    fireEvent(this, 'detail-closed');
  };

  private _valueChanged = (ev: CustomEvent<{ value: DeviceConfig }>): void => {
    // Ohne stopPropagation blubbert das Event bis zum HA-Editor und loest dort
    // eine Endlosschleife aus.
    ev.stopPropagation();
    fireEvent(this, 'device-changed', { device: stripEmpty(ev.detail.value) });
  };

  static override styles = css`
    .header {
      display: flex;
      align-items: center;
      gap: 4px;
      margin-bottom: 8px;
      font-weight: 500;
      color: var(--primary-text-color);
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    'energy-manager-device-detail-editor': EnergyManagerDeviceDetailEditor;
  }
}
