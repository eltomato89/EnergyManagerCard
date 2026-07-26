import { LitElement, css, html, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { mdiArrowDown, mdiArrowUp, mdiDragHorizontalVariant, mdiLockClock } from '@mdi/js';
import { DEVICE_ROW_TAG, OPTIMISTIC_TIMEOUT_MS } from '../const';
import { formatDuration, formatPower } from '../lib/format';
import { fireEvent, fireMoreInfo } from '../lib/events';
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
   * Was der Schalter bedient. Bei 'automation' bleibt das Geraet selbst nur
   * ueber den Detail-Dialog schaltbar — der Zustandspunkt zeigt trotzdem, ob
   * es gerade laeuft.
   */
  @property({ attribute: false }) public switchAction: 'device' | 'automation' = 'device';
  /** Sortiermodus: blendet Griff und Pfeiltasten ein. */
  @property({ type: Boolean, reflect: true }) public reordering = false;
  @property({ attribute: false }) public isFirst = false;
  @property({ attribute: false }) public isLast = false;

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
      if (this._switchState() === this._optimistic) this._clearOptimistic();
    }
  }

  /** Zustand, den der Schalter abbildet — Geraet oder Automatik. */
  private _switchState(): boolean {
    return this.switchAction === 'automation' ? this.view.managed : this.view.isOn;
  }

  private _switchEnabled(): boolean {
    return this.switchAction === 'automation' ? this.view.autoSwitchable : this.view.available;
  }

  protected override render() {
    const view = this.view;
    const checked = this._optimistic ?? this._switchState();
    const automation = this.switchAction === 'automation';

    return html`
      <div class="row">
        <div
          class="status"
          style=${`background:${statusColor(view.status)};opacity:${statusOpacity(view.status)}`}
        ></div>

        ${this.reordering ? this.renderHandle() : this.renderPriority()}

        <div class="icon-wrap" @click=${this._openMoreInfo}>
          <ha-state-icon
            class="icon"
            .hass=${this.hass}
            .stateObj=${this.hass?.states?.[view.config.switch_entity]}
            .icon=${view.icon}
          ></ha-state-icon>
          ${
            // Der Punkt zeigt den Geraetezustand — noetig, sobald der Schalter
            // die Automatik bedient und nicht mehr das Geraet.
            automation
              ? html`<span
                  class="dot ${view.isOn ? 'on' : 'off'}"
                  title=${this.localize(view.isOn ? 'card.device_on' : 'card.device_off')}
                ></span>`
              : nothing
          }
        </div>

        <div class="text" @click=${this._openMoreInfo}>
          <div class="name">${view.name}</div>
          ${this.renderSecondary()}
        </div>

        ${this.reordering ? this.renderArrows() : this.renderSwitch(checked, automation)}
      </div>
    `;
  }

  private renderPriority() {
    if (!this.showPriority) return nothing;
    return html`<span
      class="priority"
      title=${this.localize('card.priority', { index: this.view.index + 1 })}
      >${this.view.index + 1}</span
    >`;
  }

  private renderHandle() {
    return html`<div
      class="handle"
      role="button"
      tabindex="-1"
      aria-label=${this.localize('card.reorder_drag')}
    >
      <ha-svg-icon .path=${mdiDragHorizontalVariant}></ha-svg-icon>
    </div>`;
  }

  private renderArrows() {
    // Tastatur- und Touch-Pfad. Zugleich die Rueckfallebene, falls ha-sortable
    // in einer kuenftigen HA-Version fehlt.
    return html`
      <div class="arrows">
        <ha-icon-button
          .path=${mdiArrowUp}
          .label=${this.localize('card.reorder_up')}
          .disabled=${this.isFirst}
          @click=${() => this._move(-1)}
        ></ha-icon-button>
        <ha-icon-button
          .path=${mdiArrowDown}
          .label=${this.localize('card.reorder_down')}
          .disabled=${this.isLast}
          @click=${() => this._move(1)}
        ></ha-icon-button>
      </div>
    `;
  }

  private renderSwitch(checked: boolean, automation: boolean) {
    return html`
      <div class="switch-wrap">
        <ha-switch
          .checked=${checked}
          .disabled=${!this._switchEnabled()}
          @change=${this._toggle}
          aria-label=${
            automation
              ? this.localize('card.automation_for', { name: this.view.name })
              : this.view.name
          }
        ></ha-switch>
        ${
          automation
            ? html`<span class="switch-label">${this.localize('card.automation')}</span>`
            : nothing
        }
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

    // Ohne Teilnahme an der Automatik ist der Ampelstatus nur noch eine
    // Information, keine Ankuendigung — das gehoert dazugesagt.
    if (!view.managed) parts.push(this.localize('card.not_managed'));

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

  private _move(delta: number): void {
    fireEvent(this, 'device-move', { index: this.view.index, delta });
  }

  private _openMoreInfo = (): void => {
    // Auch im Automatik-Modus der Weg zum Geraet selbst: dort laesst es sich
    // von Hand schalten.
    fireMoreInfo(this, this.view.config.switch_entity);
  };

  private _toggle = (ev: Event): void => {
    const target = ev.target as HTMLInputElement;
    const next = target.checked;
    const automation = this.switchAction === 'automation';

    // Der Klick des Nutzers geht immer durch — min_runtime/min_off_time sind
    // Hinweise an die Automatik, keine Bedienschranke.
    if (!automation && this.view.config.confirm) {
      const ok = confirm(this.localize('card.confirm_switch', { name: this.view.name }));
      if (!ok) {
        target.checked = !next;
        return;
      }
    }

    const entityId = automation ? this.view.config.auto_entity : this.view.config.switch_entity;
    if (!entityId) {
      target.checked = !next;
      return;
    }

    this._setOptimistic(next);

    // homeassistant.turn_on/off gilt domaenenuebergreifend — damit entfaellt
    // jede Fallunterscheidung fuer light/script/climate und input_boolean.
    void this.hass?.callService('homeassistant', next ? 'turn_on' : 'turn_off', {
      entity_id: entityId,
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

      .handle {
        flex: 0 0 auto;
        display: flex;
        align-items: center;
        color: var(--secondary-text-color);
        cursor: move;
        cursor: grab;
        /* Sonst scrollt die Seite, statt die Zeile zu ziehen. */
        touch-action: none;
      }

      /* Ohne das schluckt das SVG den Drag-Start. */
      .handle > * {
        pointer-events: none;
      }

      .icon-wrap {
        position: relative;
        flex: 0 0 auto;
        display: flex;
        align-items: center;
        cursor: pointer;
      }

      .icon {
        color: var(--state-icon-color, #44739e);
      }

      .dot {
        position: absolute;
        inset-block-end: -1px;
        inset-inline-end: -3px;
        width: 9px;
        height: 9px;
        border-radius: 50%;
        border: 2px solid var(--card-background-color, #fff);
        box-sizing: content-box;
      }

      .dot.on {
        background: var(--emc-on-ok);
      }

      .dot.off {
        background: var(--emc-unavailable);
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

      .switch-wrap {
        flex: 0 0 auto;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 1px;
      }

      .switch-label {
        color: var(--secondary-text-color);
        font-size: 0.7em;
        line-height: 1;
      }

      .arrows {
        flex: 0 0 auto;
        display: flex;
      }

      .arrows ha-icon-button {
        --mdc-icon-button-size: 36px;
        --mdc-icon-size: 20px;
      }
    `,
  ];
}

declare global {
  interface HTMLElementTagNameMap {
    'energy-manager-device-row': EnergyManagerDeviceRow;
  }
}
