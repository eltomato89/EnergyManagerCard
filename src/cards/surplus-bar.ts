import { LitElement, css, html, nothing } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { mdiAlertOutline, mdiArrowUpBold, mdiTransmissionTowerImport } from '@mdi/js';
import { SURPLUS_BAR_TAG } from '../const';
import { formatPower } from '../lib/format';
import type { LocalizeFn } from '../localize/localize';
import { themeVariables } from '../styles';
import type { FrontendLocaleData } from '../types/hass';

/**
 * Ueberschussanzeige: grosse Zahl plus zweigeteilte Leiste.
 *
 * Die Leiste zeigt das Gesamtangebot: was bereits von laufenden Verbrauchern
 * belegt ist und was noch frei waere. Bei Netzbezug waechst stattdessen ein
 * Balken nach links vom Nullpunkt.
 */
@customElement(SURPLUS_BAR_TAG)
export class EnergyManagerSurplusBar extends LitElement {
  @property({ attribute: false }) public availableW: number | null = null;
  @property({ attribute: false }) public allocatedW = 0;
  @property({ attribute: false }) public scaleMax = 3000;
  @property({ attribute: false }) public smoothingWindow = 0;
  @property({ attribute: false }) public coverage = 1;
  @property({ attribute: false }) public degraded = false;
  @property({ attribute: false }) public locale?: FrontendLocaleData;
  @property({ attribute: false }) public localize!: LocalizeFn;

  protected override render() {
    const available = this.availableW;
    const negative = available !== null && available < 0;
    const scale = Math.max(1, this.scaleMax);

    const allocatedPct = available === null ? 0 : clamp((this.allocatedW / scale) * 100);
    const freePct = available === null || negative ? 0 : clamp((available / scale) * 100);
    const deficitPct = negative ? clamp((Math.abs(available) / scale) * 100) : 0;

    return html`
      <div class="value-row">
        <ha-svg-icon
          class=${negative ? 'deficit' : 'surplus'}
          .path=${
            available === null
              ? mdiAlertOutline
              : negative
                ? mdiTransmissionTowerImport
                : mdiArrowUpBold
          }
        ></ha-svg-icon>
        <span class="value ${negative ? 'deficit' : ''}">
          ${formatPower(available === null ? null : Math.abs(available), this.locale)}
        </span>
        <span class="value-label">
          ${
            available === null
              ? nothing
              : negative
                ? this.localize('card.surplus_deficit')
                : this.localize('card.surplus_free')
          }
        </span>
        <span class="spacer"></span>
        ${this.renderAverageChip()}
      </div>

      <div
        class="bar ${available === null ? 'unknown' : ''}"
        role="img"
        aria-label=${`${formatPower(available, this.locale)} / ${formatPower(scale, this.locale)}`}
      >
        <div class="segment allocated" style=${`width:${allocatedPct}%`}></div>
        <div class="segment free" style=${`width:${freePct}%`}></div>
        <div class="segment deficit" style=${`width:${deficitPct}%`}></div>
      </div>

      ${
        available === null
          ? // Ohne verwertbaren Messwert waeren "belegt 0 W" und eine Skala
            // irrefuehrend: sie sehen aus wie eine Aussage, sind aber keine.
            // Den Grund nennt der Fehlerhinweis der Karte darunter.
            nothing
          : html`
              <div class="legend">
                <span
                  ><i class="dot allocated"></i>${this.localize('card.allocated')}
                  ${formatPower(this.allocatedW, this.locale)}</span
                >
                <span
                  ><i class="dot free"></i>${this.localize('card.free')}
                  ${formatPower(available, this.locale)}</span
                >
                <span class="scale"
                  >${this.localize('card.scale')} ${formatPower(scale, this.locale)}</span
                >
              </div>
            `
      }
    `;
  }

  private renderAverageChip() {
    if (this.smoothingWindow <= 0) return nothing;

    // Unvollstaendige Abdeckung sichtbar machen: kurz nach dem Laden beruht der
    // Mittelwert erst auf wenigen Sekunden und ist entsprechend zappelig.
    const partial = this.coverage < 0.5;
    return html`
      <span
        class="chip ${partial ? 'partial' : ''}"
        title=${partial ? this.localize('card.average_partial') : ''}
      >
        ${
          this.degraded
            ? html`<ha-svg-icon
                .path=${mdiAlertOutline}
                title=${this.localize('card.degraded')}
              ></ha-svg-icon>`
            : nothing
        }
        ${this.localize('card.average', { seconds: this.smoothingWindow })}
      </span>
    `;
  }

  static override styles = [
    themeVariables,
    css`
      :host {
        display: block;
      }

      .value-row {
        display: flex;
        align-items: baseline;
        gap: 6px;
      }

      .value-row ha-svg-icon {
        align-self: center;
        --mdc-icon-size: 22px;
        color: var(--emc-solar);
      }

      .value-row ha-svg-icon.deficit {
        color: var(--emc-grid);
      }

      .value {
        font-size: 1.9em;
        font-weight: 500;
        line-height: 1.1;
        color: var(--primary-text-color);
      }

      .value.deficit {
        color: var(--emc-grid);
      }

      .value-label {
        color: var(--secondary-text-color);
        font-size: 0.95em;
      }

      .spacer {
        flex: 1;
      }

      .chip {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        align-self: center;
        padding: 2px 8px;
        border-radius: 12px;
        background: var(--secondary-background-color, #e5e5e5);
        color: var(--secondary-text-color);
        font-size: 0.8em;
        white-space: nowrap;
      }

      .chip.partial {
        font-style: italic;
        opacity: 0.75;
      }

      .chip ha-svg-icon {
        --mdc-icon-size: 14px;
        color: var(--warning-color, #ffa600);
      }

      .bar {
        display: flex;
        height: 10px;
        border-radius: 5px;
        overflow: hidden;
        background: var(--divider-color, #e0e0e0);
      }

      .segment {
        height: 100%;
        transition: width 0.4s ease;
      }

      .segment.allocated {
        background: var(--emc-allocated);
      }

      .segment.free {
        background: var(--emc-solar);
      }

      .segment.deficit {
        background: var(--emc-grid);
      }

      /* Kein verwertbarer Messwert: schraffiert statt leer, damit die Leiste
         nicht wie ein echter Nullwert aussieht. */
      .bar.unknown {
        background: repeating-linear-gradient(
          45deg,
          var(--divider-color, #e0e0e0),
          var(--divider-color, #e0e0e0) 4px,
          transparent 4px,
          transparent 8px
        );
      }

      .legend {
        display: flex;
        flex-wrap: wrap;
        gap: 4px 12px;
        color: var(--secondary-text-color);
        font-size: 0.8em;
      }

      .legend span {
        display: inline-flex;
        align-items: center;
        gap: 4px;
      }

      .legend .scale {
        margin-inline-start: auto;
      }

      .dot {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        display: inline-block;
      }

      .dot.allocated {
        background: var(--emc-allocated);
      }

      .dot.free {
        background: var(--emc-solar);
      }
    `,
  ];
}

function clamp(value: number): number {
  return Math.min(100, Math.max(0, value));
}

declare global {
  interface HTMLElementTagNameMap {
    'energy-manager-surplus-bar': EnergyManagerSurplusBar;
  }
}
