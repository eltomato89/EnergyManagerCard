import { LitElement, css, html, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { mdiLockClock } from '@mdi/js';
import { DEVICE_ROW_TAG, OPTIMISTIC_TIMEOUT_MS } from '../const';
import { formatDuration, formatPower } from '../lib/format';
import { fireMoreInfo } from '../lib/events';
import type { LocalizeFn } from '../localize/localize';
import { statusColor, statusOpacity, themeVariables } from '../styles';
import type { SecondaryInfo } from '../types/config';
import type { FrontendLocaleData, HomeAssistant } from '../types/hass';
import type { DeviceView } from '../types/runtime';

/** Eine Zeile der Verbraucherliste: Status, Name, Leistung, Schalter. */
@customElement(DEVICE_ROW_TAG)
export class EnergyManagerDeviceRow extends LitElement {
  @property({ attribute: false }) public hass?: HomeAssistant;
  @property({ attribute: false }) public view!: DeviceView;
  @property({ attribute: false }) public locale?: FrontendLocaleData;
  @property({ attribute: false }) public localize!: LocalizeFn;
  @property({ attribute: false }) public secondaryInfo: SecondaryInfo = 'both';
  @property({ attribute: false }) public showPriority = true;

  /**
   * Optimistischer Schaltzustand. Ohne ihn haengt der Schalter sichtbar, bis
   * HA den neuen Zustand zurueckmeldet — bei manchen Integrationen mehrere
   * Sekunden.
   */
  @state() private _optimistic?: boolean;
  private _optimisticTimer?: number;

  public override disconnectedCallback(): void {
    super.disconnectedCallback();
    this._clearOptimistic();
  }

  protected override willUpdate(changed: Map<string, unknown>): void {
    // Sobald der echte Zustand nachgezogen hat, den optimistischen verwerfen.
    if (changed.has('view') && this._optimistic !== undefined) {
      if (this.view.isOn === this._optimistic) this._clearOptimistic();
    }
  }

  protected override render() {
    const view = this.view;
    const isOn = this._optimistic ?? view.isOn;

    return html`
      <div class="row">
        <div
          class="status"
          style=${`background:${statusColor(view.status)};opacity:${statusOpacity(view.status)}`}
        ></div>

        ${
          this.showPriority
            ? html`<span
                class="priority"
                title=${this.localize('card.priority', {
                  index: view.index + 1,
                })}
                >${view.index + 1}</span
              >`
            : nothing
        }

        <ha-state-icon
          class="icon"
          .hass=${this.hass}
          .stateObj=${this.hass?.states?.[view.config.switch_entity]}
          .icon=${view.icon}
          @click=${this._openMoreInfo}
        ></ha-state-icon>

        <div class="text" @click=${this._openMoreInfo}>
          <div class="name">${view.name}</div>
          ${this.renderSecondary()}
        </div>

        <ha-switch
          .checked=${isOn}
          .disabled=${!view.available}
          @change=${this._toggle}
          aria-label=${view.name}
        ></ha-switch>
      </div>
    `;
  }

  private renderSecondary() {
    const parts: unknown[] = [];
    const view = this.view;

    if (this.secondaryInfo === 'power' || this.secondaryInfo === 'both') {
      if (view.powerW !== null) {
        parts.push(formatPower(view.powerW, this.locale));
      } else if (view.config.max_power !== undefined) {
        parts.push(
          this.localize('card.max_power', {
            power: formatPower(view.config.max_power, this.locale),
          }),
        );
      } else if (!view.isOn) {
        parts.push(
          this.localize('card.needs', { power: formatPower(view.requiredW, this.locale) }),
        );
      }
    }

    if (this.secondaryInfo === 'status' || this.secondaryInfo === 'both') {
      parts.push(this.localize(`status.${view.status}`));
    }

    const hasLock = view.lock.kind !== 'none';
    if (parts.length === 0 && !hasLock) return nothing;

    // Die Sperrzeit steht in einer eigenen Zeile statt angehängt: sonst bleibt
    // beim Umbruch ein Trennpunkt am Zeilenende hängen, und die Sperre ist
    // wichtig genug, um nicht im Fliesstext unterzugehen.
    return html`
      ${
        parts.length === 0
          ? nothing
          : html`<div class="secondary">
              ${parts.map((part, i) => html`${i > 0 ? ' · ' : ''}${part}`)}
            </div>`
      }
      ${
        hasLock
          ? html`<div
              class="secondary lock"
              title=${this.localize(
              view.lock.kind === 'min_runtime'
                ? 'editor.min_runtime.helper'
                : 'editor.min_off_time.helper',
            )}
            >
              <ha-svg-icon .path=${mdiLockClock}></ha-svg-icon>
              ${this.localize(
              view.lock.kind === 'min_runtime' ? 'card.locked_runtime' : 'card.locked_off',
              { time: formatDuration(view.lock.remainingS) },
            )}
            </div>`
          : nothing
      }
    `;
  }

  private _openMoreInfo = (): void => {
    fireMoreInfo(this, this.view.config.switch_entity);
  };

  private _toggle = (ev: Event): void => {
    const target = ev.target as HTMLInputElement;
    const next = target.checked;

    // Der Klick des Nutzers geht immer durch — min_runtime/min_off_time sind
    // Hinweise an die Automatik, keine Bedienschranke.
    if (this.view.config.confirm) {
      const ok = confirm(this.localize('editor.confirm_switch', { name: this.view.name }));
      if (!ok) {
        target.checked = !next;
        return;
      }
    }

    this._setOptimistic(next);

    // homeassistant.turn_on/off gilt domaenenuebergreifend — damit entfaellt
    // jede Fallunterscheidung fuer light/script/climate.
    void this.hass?.callService('homeassistant', next ? 'turn_on' : 'turn_off', {
      entity_id: this.view.config.switch_entity,
    });
  };

  private _setOptimistic(value: boolean): void {
    this._clearOptimistic();
    this._optimistic = value;
    this._optimisticTimer = window.setTimeout(() => {
      // Kam keine Bestaetigung, wieder den echten Zustand zeigen, statt eine
      // fehlgeschlagene Schaltung als erfolgreich auszugeben.
      this._optimistic = undefined;
      this._optimisticTimer = undefined;
    }, OPTIMISTIC_TIMEOUT_MS);
  }

  private _clearOptimistic(): void {
    if (this._optimisticTimer !== undefined) {
      clearTimeout(this._optimisticTimer);
      this._optimisticTimer = undefined;
    }
    this._optimistic = undefined;
  }

  static override styles = [
    themeVariables,
    css`
      :host {
        display: block;
      }

      .row {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 8px 0;
        min-height: 40px;
      }

      .status {
        width: 4px;
        align-self: stretch;
        border-radius: 2px;
        flex: 0 0 auto;
      }

      .priority {
        flex: 0 0 auto;
        min-width: 14px;
        color: var(--secondary-text-color);
        font-size: 0.85em;
        font-variant-numeric: tabular-nums;
        text-align: end;
      }

      .icon {
        flex: 0 0 auto;
        color: var(--state-icon-color, #44739e);
        cursor: pointer;
      }

      .text {
        flex: 1 1 auto;
        min-width: 0;
        cursor: pointer;
      }

      .name {
        color: var(--primary-text-color);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .secondary {
        color: var(--secondary-text-color);
        font-size: 0.85em;
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 2px;
      }

      .lock {
        display: inline-flex;
        align-items: center;
        gap: 3px;
        white-space: nowrap;
      }

      .lock ha-svg-icon {
        --mdc-icon-size: 14px;
      }

      ha-switch {
        flex: 0 0 auto;
      }
    `,
  ];
}

declare global {
  interface HTMLElementTagNameMap {
    'energy-manager-device-row': EnergyManagerDeviceRow;
  }
}
