import { LitElement, css, html, nothing, svg } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import {
  mdiArrowCollapseRight,
  mdiArrowDown,
  mdiArrowUp,
  mdiDragHorizontalVariant,
  mdiHandBackRight,
  mdiLockClock,
} from '@mdi/js';
import { DEVICE_ROW_TAG, OPTIMISTIC_TIMEOUT_MS } from '../const';
import { batteryStatusKey } from '../lib/device-status';
import { batteryFlow, batteryFrame, FRAME_COUNT } from '../lib/battery-icon';
import type { BatteryFlow } from '../lib/battery-icon';
import { formatDuration, formatEnergy, formatPercent, formatPower } from '../lib/format';
import { fireEvent, fireMoreInfo } from '../lib/events';
import type { LocalizeFn } from '../localize/localize';
import { statusColor, statusOpacity, themeVariables } from '../styles';
import type { SecondaryInfo } from '../types/config';
import type { FrontendLocaleData, HomeAssistant } from '../types/hass';
import type { DeviceView } from '../types/runtime';
import { HANDS_OFF_BLOCKERS } from '../types/runtime';

/** Dauer eines Einzelbilds der Lade-/Entlade-Animation. Fuenf Bilder = 2 s. */
const FILL_FRAME_MS = 400;

/**
 * Hat der Nutzer Bewegung abbestellt?
 *
 * Zur Laufzeit gefragt statt einmalig gemerkt: Die Einstellung laesst sich im
 * Betriebssystem umstellen, und die Karte lebt in einem Dashboard, das tagelang
 * offen bleibt.
 */
function prefersReducedMotion(): boolean {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
}

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

  /** Schritt der Lade-/Entlade-Animation der Batteriezeile. */
  @state() private _fillStep = 0;
  private _fillTimer?: number;
  /** Richtung, fuer die der Takt gerade laeuft — haelt _syncFill idempotent. */
  private _fillFlow: BatteryFlow = null;

  public override connectedCallback(): void {
    super.connectedCallback();
    document.addEventListener('visibilitychange', this._onVisibilityChange);
    this._syncFill();
  }

  public override disconnectedCallback(): void {
    super.disconnectedCallback();
    document.removeEventListener('visibilitychange', this._onVisibilityChange);
    this._clearOptimistic();
    this._stopFill();
  }

  protected override willUpdate(changed: Map<string, unknown>): void {
    // Sobald der echte Zustand nachgezogen hat, den optimistischen verwerfen.
    if (changed.has('view') && this._optimistic !== undefined) {
      if (this._switchState() === this._optimistic) this._clearOptimistic();
    }
  }

  protected override updated(): void {
    this._syncFill();
  }

  /** Die Hausbatterie als verschiebbare Last: eigene Zeile ohne Schalter. */
  private get _isBattery(): boolean {
    return this.view.kind === 'battery';
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
        <div class="status" style=${this._statusStyle()}></div>

        ${this.reordering ? this.renderHandle() : this.renderPriority()}

        <div class="icon-wrap" @click=${this._openMoreInfo}>
          <ha-state-icon
            class="icon"
            .hass=${this.hass}
            .stateObj=${this._isBattery ? undefined : this.hass?.states?.[view.config.switch_entity]}
            .icon=${this._isBattery ? this._batteryIcon() : view.icon}
          ></ha-state-icon>
          ${
            // Der Punkt zeigt den Geraetezustand — noetig, sobald der Schalter
            // die Automatik bedient und nicht mehr das Geraet. Fuer die Batterie
            // gibt es keinen Schalter, also auch keinen Punkt.
            automation && !this._isBattery
              ? html`<span
                  class="dot ${view.isOn ? 'on' : 'off'}"
                  title=${this.localize(view.isOn ? 'card.device_on' : 'card.device_off')}
                ></span>`
              : nothing
          }
        </div>

        <div class="text" @click=${this._openMoreInfo}>
          <div class="name">${this._isBattery ? this.localize('card.battery') : view.name}</div>
          ${this._isBattery ? this.renderBatterySecondary() : this.renderSecondary()}
        </div>

        ${
          // Die Batterie wird nicht geschaltet — im Normalbetrieb bleibt die
          // rechte Spalte leer, im Sortiermodus tragen die Pfeiltasten sie mit.
          this.reordering
            ? this.renderArrows()
            : this._isBattery
              ? nothing
              : this.renderSwitch(checked, automation)
        }
      </div>
    `;
  }

  /**
   * Farbe und Deckkraft des Statusbalkens.
   *
   * Greift die Automatik hier absichtlich nicht ein, wird der Balken grau — die
   * Ampel sagt sonst "koennte laufen", und niemand rechnet damit, dass trotzdem
   * nichts geschieht. Der Ampeltext in der Zweitzeile bleibt unveraendert: Was
   * die Energielage hergibt, ist weiterhin ablesbar.
   *
   * Nur fuer die Gruende, bei denen die Automatik den Verbraucher liegen laesst,
   * nicht fuer die Zeitbedingungen des Normalbetriebs — siehe
   * HANDS_OFF_BLOCKERS.
   */
  private _statusStyle(): string {
    const view = this.view;
    const untaetig = view.blockedBy !== undefined && HANDS_OFF_BLOCKERS.has(view.blockedBy);
    const color = untaetig ? 'var(--emc-unavailable)' : statusColor(view.status);
    return `background:${color};opacity:${statusOpacity(view.status)}`;
  }

  /**
   * Die Stufenleiter: ein Segment je Stufe, gefuellt bis zur gestellten.
   *
   * Sie kostet wenig Hoehe und beantwortet, was die Zahlen allein nicht sagen —
   * ohne sie liest sich eine gedrosselte Wallbox wie eine, bei der der
   * Ueberschuss nicht reicht.
   */
  private renderLadder() {
    const levels = this.view.levels;
    if (!levels) return nothing;

    // Eine Leiter mit einer Stufe ist keine Leiter: ein Segment ueber die volle
    // Breite und "Stufe 1/1" sagen nichts. Das passiert, wenn das Geraet nicht
    // einmal seine kleinste Stufe erreicht — meist eine falsche Konfiguration,
    // etwa eine Wallbox mit falscher Phasenzahl. Statt der Leiter gehoert dann
    // im Klartext dort hin, woran es liegt.
    if (levels.count < 2) {
      return levels.observedMaxW === null
        ? nothing
        : html`<div class="secondary daily urgent">
            <ha-svg-icon .path=${mdiArrowCollapseRight}></ha-svg-icon>
            ${this.localize('card.level_below_minimum', {
              power: formatPower(levels.observedMaxW, this.locale),
              min: formatPower(levels.minW, this.locale),
            })}
          </div>`;
    }

    const gefuellt = levels.index ?? 0;
    const segmente = Array.from({ length: levels.count }, (_unused, i) => i < gefuellt);

    return html`
      <div
        class="ladder"
        role="img"
        aria-label=${this.localize('card.level_of', {
          index: gefuellt,
          count: levels.count,
        })}
      >
        ${segmente.map((an) => html`<i class=${an ? 'seg on' : 'seg'}></i>`)}
        <span class="cap"
          >${this.localize('card.level_of', { index: gefuellt, count: levels.count })}</span
        >
        ${
          // Ist die Leiter gekappt, fehlt nicht der Ueberschuss — das Geraet
          // nimmt nicht mehr. Ohne diesen Hinweis liest sich die kuerzere Leiter
          // wie ein Geraet mit weniger Stufen.
          levels.capped
            ? html`<ha-svg-icon
                class="capped"
                .path=${mdiArrowCollapseRight}
                title=${this.localize('card.level_capped', {
                  power: formatPower(levels.observedMaxW ?? levels.maxW, this.locale),
                })}
              ></ha-svg-icon>`
            : nothing
        }
      </div>
    `;
  }

  /**
   * Der Tagesfortschritt als Ring plus Text.
   *
   * Der Ring traegt den **Fortschritt**, die Farbe die **Dringlichkeit**. Das
   * ist der Punkt: 58 % um zehn Uhr bei blauem Himmel ist entspannt, 58 % um
   * vier Uhr bei Bewoelkung ist der Moment, in dem das Geraet auf Netzstrom
   * laeuft. Ein Ring allein zeigt Zaehler und Nenner, nicht aber den Termin.
   */
  private renderDaily() {
    const daily = this.view.daily;
    if (!daily) return nothing;

    const anteil = daily.targetKwh > 0 ? Math.min(daily.doneKwh / daily.targetKwh, 1) : 0;
    const fehlt = Math.max(daily.targetKwh - daily.doneKwh, 0);
    const fertig = fehlt <= 0;

    return html`
      <div class="secondary daily ${daily.mustRun ? 'urgent' : ''}">
        ${this.renderRing(anteil, fertig, daily.mustRun)}
        ${
          fertig
            ? this.localize('card.daily_done')
            : daily.mustRun
              ? this.localize('card.daily_short', {
                  energy: formatEnergy(fehlt, this.locale),
                })
              : this.localize('card.daily_progress', {
                  done: formatEnergy(daily.doneKwh, this.locale),
                  target: formatEnergy(daily.targetKwh, this.locale),
                })
        }
      </div>
    `;
  }

  /**
   * Der Ring selbst. Acht Stufen wie beim Batteriesymbol — feiner waere hier
   * keine Aussage, und `mdi:circle-slice-*` bringt genau diese Abstufung mit.
   */
  private renderRing(anteil: number, fertig: boolean, dringend: boolean) {
    const UMFANG = 44;
    const stufe = Math.round(anteil * 8) / 8;
    const farbe = fertig ? 'var(--emc-on-ok)' : dringend ? 'var(--emc-on-deficit)' : 'currentColor';

    return svg`<svg class="ring" viewBox="0 0 20 20" aria-hidden="true">
      <circle cx="10" cy="10" r="7" fill="none" stroke="var(--divider-color, #e0e0e0)" stroke-width="5"></circle>
      <circle
        cx="10" cy="10" r="7" fill="none"
        stroke=${farbe} stroke-width="5"
        stroke-dasharray=${`${stufe * UMFANG} ${UMFANG}`}
        transform="rotate(-90 10 10)"
      ></circle>
    </svg>`;
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
      const levels = view.levels;
      if (levels) {
        // Bei einem regelbaren Verbraucher ist die Leistung allein
        // nichtssagend: "4,8 kW" verraet nicht, ob das viel oder wenig ist.
        // Gemessen zaehlt vor gestellt — was fliesst, ist die Auskunft.
        const ist = view.powerW ?? levels.w;
        parts.push(
          ist === null
            ? this.localize('card.max_power', { power: formatPower(levels.maxW, this.locale) })
            : this.localize('card.level_power', {
                power: formatPower(ist, this.locale),
                max: formatPower(levels.maxW, this.locale),
              }),
        );
      } else if (view.powerW !== null) {
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
    const manuell = view.manualRemainingS ?? 0;
    if (parts.length === 0 && !hasLock && !view.levels && !view.daily && manuell === 0) {
      return nothing;
    }

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
      ${this.renderLadder()} ${this.renderDaily()}
      ${
        // Nach einem Eingriff von aussen haelt sich die Automatik befristet
        // fern. Als eigene Unterzeile mit Countdown, wie die Sperrzeit: Der
        // Zustand ist voruebergehend, und ohne die verbleibende Zeit liest er
        // sich wie eine Einstellung.
        manuell > 0
          ? html`<div class="secondary manual" title=${this.localize('card.manual_hint')}>
              <ha-svg-icon .path=${mdiHandBackRight}></ha-svg-icon>
              ${this.localize('card.manual_override', { time: formatDuration(manuell) })}
            </div>`
          : nothing
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

  /**
   * Zweite Zeile der Batteriezeile: Leistung, ein Wort zum Zustand, Ladestand.
   *
   * Bewusst nicht die Ampeltexte der Verbraucher — "In Betrieb, Netzbezug"
   * ergaebe fuer die Batterie keinen Sinn. Die Batterie zieht nie Netzstrom;
   * sie bekommt ihre Ladeleistung ganz, teilweise oder gar nicht.
   *
   * Die Leistung steht als Betrag da: Die Richtung sagt das Wort daneben, und
   * ein Minuszeichen liesse sich in einer Zeile, die auch "wartet" enthaelt,
   * zu leicht als Defizit lesen. Ein Messwert von 0 W wird gezeigt statt
   * weggelassen — "0 W · wartet" ist eine Aussage, eine fehlende Zahl nicht.
   */
  private renderBatterySecondary() {
    const view = this.view;
    const parts: unknown[] = [];

    if (view.powerW !== null) {
      parts.push(formatPower(Math.abs(view.powerW), this.locale));
    }
    parts.push(this.localize(batteryStatusKey(view)));
    if (view.soc !== null && view.soc !== undefined) {
      parts.push(formatPercent(view.soc, this.locale));
    }

    return html`<div class="secondary">
      ${parts.map((part, i) => html`${i > 0 ? ' · ' : ''}${part}`)}
    </div>`;
  }

  /**
   * Das Batteriesymbol: im Ruhezustand der Ladestand, sonst ein Schritt der
   * Animation. Bewegung ist nichts, was fuer die Bedienung noetig waere —
   * wer sie abgeschaltet hat, bekommt das ruhende Symbol.
   */
  private _batteryIcon(): string {
    return batteryFrame(this._fillFlow, this._fillStep, this.view.soc ?? null);
  }

  /**
   * Haelt den Takt der Animation mit dem Zustand der Zeile im Einklang.
   *
   * Wird nach jedem Rendern aufgerufen und muss deshalb erkennen, dass sich
   * nichts geaendert hat: Ein Neustart bei jedem Schritt setzte die Animation
   * endlos zurueck.
   */
  private _syncFill(): void {
    // Beim Anhaengen ans DOM kann die view-Eigenschaft noch fehlen: Lit setzt
    // sie erst, nachdem connectedCallback gelaufen ist.
    if (!this.view) return;

    const soll =
      this._isBattery && this.isConnected && !document.hidden && !prefersReducedMotion()
        ? batteryFlow(this.view.powerW)
        : null;

    if (soll === this._fillFlow) return;

    this._stopFill();
    this._fillFlow = soll;
    this._fillStep = 0;
    if (soll === null) return;

    this._fillTimer = window.setInterval(() => {
      this._fillStep = (this._fillStep + 1) % FRAME_COUNT;
    }, FILL_FRAME_MS);
  }

  private _stopFill(): void {
    if (this._fillTimer !== undefined) {
      clearInterval(this._fillTimer);
      this._fillTimer = undefined;
    }
    this._fillFlow = null;
  }

  /** In Hintergrund-Tabs pausieren — dort sieht die Animation ohnehin niemand. */
  private _onVisibilityChange = (): void => {
    this._syncFill();
  };

  private _move(delta: number): void {
    fireEvent(this, 'device-move', { index: this.view.index, delta });
  }

  private _openMoreInfo = (): void => {
    // Auch im Automatik-Modus der Weg zum Geraet selbst: dort laesst es sich
    // von Hand schalten. Fuer die Batterie fuehrt er zum Ladestandssensor,
    // sofern einer konfiguriert ist.
    const entityId = this.view.config.switch_entity;
    if (!entityId) return;
    fireMoreInfo(this, entityId);
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

      /* Ein Segment je Stufe. Die Segmente teilen die verfuegbare Breite unter
         sich auf, statt eine feste zu haben: Eine Wallbox hat elf Stufen, ein
         Heizstab drei, und beide sollen gleich breit endend aussehen. */
      .ladder {
        display: flex;
        align-items: center;
        gap: 2px;
        margin-top: 3px;
        max-width: 180px;
      }

      .seg {
        flex: 1 1 0;
        min-width: 3px;
        height: 5px;
        border-radius: 1px;
        background: var(--divider-color, #e0e0e0);
      }

      .seg.on {
        background: var(--emc-on-ok);
      }

      .cap {
        flex: 0 0 auto;
        margin-inline-start: 6px;
        color: var(--secondary-text-color);
        font-size: 0.75em;
        white-space: nowrap;
        font-variant-numeric: tabular-nums;
      }

      .capped {
        flex: 0 0 auto;
        margin-inline-start: 4px;
        color: var(--secondary-text-color);
        --mdc-icon-size: 13px;
      }

      .lock ha-svg-icon,
      .manual ha-svg-icon {
        --mdc-icon-size: 14px;
      }

      .daily {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        white-space: nowrap;
      }

      .daily.urgent {
        color: var(--warning-color, #ffa726);
      }

      .ring {
        flex: 0 0 auto;
        width: 14px;
        height: 14px;
      }

      .manual {
        display: inline-flex;
        align-items: center;
        gap: 3px;
        white-space: nowrap;
        color: var(--warning-color, #ffa726);
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
