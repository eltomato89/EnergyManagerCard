import { LitElement, css, html, nothing } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { mdiMinus, mdiPlus } from '@mdi/js';
import { batteryIconForSoc } from '../lib/battery-icon';
import { BATTERY_BADGE_TAG } from '../const';
import { formatPercent, formatPower } from '../lib/format';
import type { LocalizeFn } from '../localize/localize';
import { themeVariables } from '../styles';
import type { FrontendLocaleData } from '../types/hass';

/** Ladestand und Lade-/Entladerichtung der Hausbatterie. */
@customElement(BATTERY_BADGE_TAG)
export class EnergyManagerBatteryBadge extends LitElement {
  @property({ attribute: false }) public soc: number | null = null;
  /** >0 = laedt, <0 = entlaedt. */
  @property({ attribute: false }) public powerW: number | null = null;
  @property({ attribute: false }) public locale?: FrontendLocaleData;
  @property({ attribute: false }) public localize!: LocalizeFn;

  protected override render() {
    const charging = this.powerW !== null && this.powerW > 0;
    const discharging = this.powerW !== null && this.powerW < 0;

    const title = [
      this.soc === null ? null : formatPercent(this.soc, this.locale),
      this.powerW === null
        ? null
        : `${formatPower(Math.abs(this.powerW), this.locale)} ${this.localize(
            charging ? 'card.battery_charging' : 'card.battery_discharging',
          )}`,
    ]
      .filter(Boolean)
      .join(' · ');

    return html`
      <div class="badge" title=${title}>
        <ha-svg-icon .path=${batteryIconForSoc(this.soc)}></ha-svg-icon>
        ${
          charging || discharging
            ? html`<ha-svg-icon
                class="direction ${charging ? 'in' : 'out'}"
                .path=${charging ? mdiPlus : mdiMinus}
              ></ha-svg-icon>`
            : nothing
        }
        <span>${formatPercent(this.soc, this.locale)}</span>
      </div>
    `;
  }

  static override styles = [
    themeVariables,
    css`
      .badge {
        display: inline-flex;
        align-items: center;
        gap: 2px;
        color: var(--secondary-text-color);
        font-size: 0.9em;
        white-space: nowrap;
      }

      ha-svg-icon {
        --mdc-icon-size: 20px;
        color: var(--state-icon-color, #44739e);
      }

      ha-svg-icon.direction {
        --mdc-icon-size: 14px;
      }

      ha-svg-icon.direction.in {
        color: var(--emc-battery-in);
      }

      ha-svg-icon.direction.out {
        color: var(--emc-allocated);
      }
    `,
  ];
}

declare global {
  interface HTMLElementTagNameMap {
    'energy-manager-battery-badge': EnergyManagerBatteryBadge;
  }
}
