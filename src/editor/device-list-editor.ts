import { LitElement, css, html } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { repeat } from 'lit/directives/repeat.js';
import { mdiArrowDown, mdiArrowUp, mdiClose, mdiDragHorizontalVariant, mdiPencil } from '@mdi/js';
import { DEVICE_LIST_EDITOR_TAG, SWITCHABLE_DOMAINS } from '../const';
import { fireEvent } from '../lib/events';
import type { LocalizeFn } from '../localize/localize';
import type { DeviceConfig } from '../types/config';
import type { HomeAssistant } from '../types/hass';
import { newDeviceId } from './merge';

/**
 * Sortierbare Verbraucherliste. Die Reihenfolge IST die Prioritaet — dies ist
 * der einzige Ort, an dem sie festgelegt wird, und jede Aenderung wandert
 * unmittelbar in die Lovelace-Config.
 *
 * Zum Sortieren wird HAs eigenes `ha-sortable` benutzt: kein zusaetzliches
 * Bundle, natives Ghost-Styling, Auto-Scroll und Touch-Unterstuetzung. Weil es
 * ein internes Element ohne Kompatibilitaetszusage ist, hat jede Zeile
 * zusaetzlich Pfeil-Buttons — die sind zugleich der Tastatur- und
 * Screenreader-Pfad und machen einen moeglichen Bruch unkritisch.
 */
@customElement(DEVICE_LIST_EDITOR_TAG)
export class EnergyManagerDeviceListEditor extends LitElement {
  @property({ attribute: false }) public hass?: HomeAssistant;
  @property({ attribute: false }) public devices: DeviceConfig[] = [];
  @property({ attribute: false }) public localize!: LocalizeFn;

  protected override render() {
    return html`
      <ha-sortable handle-selector=".handle" @item-moved=${this._itemMoved}>
        <div class="devices">
          ${
            this.devices.length === 0
              ? html`<div class="empty">${this.localize('editor.devices.empty')}</div>`
              : repeat(
                  this.devices,
                  (device, index) => device.id ?? `${device.switch_entity}-${index}`,
                  (device, index) => this.renderRow(device, index),
                )
          }
        </div>
      </ha-sortable>

      <ha-entity-picker
        class="add"
        .hass=${this.hass}
        .includeDomains=${[...SWITCHABLE_DOMAINS]}
        .label=${this.localize('editor.devices.add')}
        @value-changed=${this._addDevice}
        allow-custom-entity
      ></ha-entity-picker>
    `;
  }

  private renderRow(device: DeviceConfig, index: number) {
    const name =
      device.name ||
      (this.hass?.states?.[device.switch_entity]?.attributes?.friendly_name as string) ||
      device.switch_entity;

    return html`
      <div class="device">
        <div
          class="handle"
          role="button"
          tabindex="-1"
          aria-label=${this.localize('editor.devices.drag')}
        >
          <ha-svg-icon .path=${mdiDragHorizontalVariant}></ha-svg-icon>
        </div>

        <span class="index">${index + 1}</span>

        <div class="label">
          <span class="name">${name}</span>
          <span class="entity">${device.switch_entity}</span>
        </div>

        <ha-icon-button
          .path=${mdiArrowUp}
          .label=${this.localize('editor.devices.move_up')}
          .disabled=${index === 0}
          @click=${() => this._move(index, index - 1)}
        ></ha-icon-button>
        <ha-icon-button
          .path=${mdiArrowDown}
          .label=${this.localize('editor.devices.move_down')}
          .disabled=${index === this.devices.length - 1}
          @click=${() => this._move(index, index + 1)}
        ></ha-icon-button>
        <ha-icon-button
          .path=${mdiPencil}
          .label=${this.localize('editor.devices.edit')}
          @click=${() => this._edit(index)}
        ></ha-icon-button>
        <ha-icon-button
          .path=${mdiClose}
          .label=${this.localize('editor.devices.remove')}
          @click=${() => this._remove(index)}
        ></ha-icon-button>
      </div>
    `;
  }

  private _itemMoved = (ev: CustomEvent<{ oldIndex: number; newIndex: number }>): void => {
    ev.stopPropagation();
    this._move(ev.detail.oldIndex, ev.detail.newIndex);
  };

  private _move(from: number, to: number): void {
    if (to < 0 || to >= this.devices.length || from === to) return;

    const next = [...this.devices];
    next.splice(to, 0, next.splice(from, 1)[0]);
    this._emit(next);
  }

  private _remove(index: number): void {
    const next = [...this.devices];
    next.splice(index, 1);
    this._emit(next);
  }

  private _edit(index: number): void {
    fireEvent(this, 'device-edit', { index });
  }

  private _addDevice = (ev: CustomEvent<{ value: string }>): void => {
    ev.stopPropagation();
    const entityId = ev.detail.value;
    if (!entityId) return;

    // Picker sofort leeren, sonst bleibt die Auswahl stehen und ein zweiter
    // Klick auf dieselbe Entitaet loest kein value-changed mehr aus.
    (ev.target as HTMLInputElement & { value: string }).value = '';

    this._emit([...this.devices, { id: newDeviceId(), switch_entity: entityId }]);
  };

  private _emit(devices: DeviceConfig[]): void {
    fireEvent(this, 'devices-changed', { devices });
  }

  static override styles = css`
    :host {
      display: block;
    }

    .devices {
      display: flex;
      flex-direction: column;
    }

    .device {
      display: flex;
      align-items: center;
      gap: 4px;
      padding: 2px 0;
    }

    .handle {
      padding-inline-end: 4px;
      cursor: move;
      cursor: grab;
      color: var(--secondary-text-color);
    }

    /* Ohne das schluckt das SVG den Drag-Start. */
    .handle > * {
      pointer-events: none;
    }

    .index {
      min-width: 16px;
      text-align: end;
      color: var(--secondary-text-color);
      font-size: 0.85em;
      font-variant-numeric: tabular-nums;
    }

    .label {
      flex: 1 1 auto;
      min-width: 0;
      display: flex;
      flex-direction: column;
      padding-inline-start: 8px;
    }

    .name {
      color: var(--primary-text-color);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .entity {
      color: var(--secondary-text-color);
      font-size: 0.8em;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .empty {
      color: var(--secondary-text-color);
      font-size: 0.9em;
      padding: 8px 0;
    }

    .add {
      display: block;
      margin-top: 8px;
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    'energy-manager-device-list-editor': EnergyManagerDeviceListEditor;
  }
}
