import { css } from 'lit';
import type { DeviceStatus } from './types/runtime';

/**
 * Alle Farben laufen ueber HA-Theme-Variablen mit Fallback. Bewusst kein
 * `prefers-color-scheme`: HA steuert den Dark Mode ueber Theme-Variablen, eine
 * Media Query wuerde bei manuell gesetztem Theme das Falsche tun.
 *
 * Die --energy-manager-*-Variablen sind der Anpassungspunkt fuer card-mod.
 */
export const themeVariables = css`
  :host {
    --emc-on-ok: var(--energy-manager-on-ok-color, var(--success-color, #43a047));
    --emc-on-deficit: var(--energy-manager-on-deficit-color, var(--warning-color, #ffa726));
    --emc-off-ready: var(--energy-manager-off-ready-color, var(--success-color, #43a047));
    --emc-off-close: var(--energy-manager-off-close-color, var(--warning-color, #ffa726));
    --emc-off-insufficient: var(
      --energy-manager-off-insufficient-color,
      var(--divider-color, #e0e0e0)
    );
    --emc-unavailable: var(--energy-manager-unavailable-color, var(--disabled-text-color, #bdbdbd));

    --emc-solar: var(--energy-solar-color, #ff9800);
    --emc-grid: var(--energy-grid-consumption-color, #488fc2);
    --emc-allocated: var(--energy-battery-out-color, #4db6ac);
    --emc-battery-in: var(--energy-battery-in-color, #f06292);
  }
`;

/** Ordnet einem Ampelstatus die zugehoerige CSS-Variable zu. */
export function statusColor(status: DeviceStatus): string {
  switch (status) {
    case 'on_ok':
      return 'var(--emc-on-ok)';
    case 'on_deficit':
      return 'var(--emc-on-deficit)';
    case 'off_ready':
      return 'var(--emc-off-ready)';
    case 'off_close':
      return 'var(--emc-off-close)';
    case 'off_insufficient':
      return 'var(--emc-off-insufficient)';
    default:
      return 'var(--emc-unavailable)';
  }
}

/**
 * Deckkraft des Statusbalkens. Ausgeschaltete Geraete werden gedaempft
 * dargestellt, damit "laeuft" und "koennte laufen" auch ohne Farbunterscheidung
 * erkennbar bleiben.
 */
export function statusOpacity(status: DeviceStatus): number {
  switch (status) {
    case 'on_ok':
    case 'on_deficit':
      return 1;
    case 'off_ready':
    case 'off_close':
      return 0.4;
    default:
      return 0.25;
  }
}

export const cardStyles = css`
  ha-card {
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .card-content {
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  :host([compact]) .card-content {
    padding: 12px;
    gap: 8px;
  }

  .header-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }

  .devices {
    display: flex;
    flex-direction: column;
  }

  .devices > *:not(:last-child) {
    border-bottom: 1px solid var(--divider-color, #e0e0e0);
  }

  .notice {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    padding: 8px 12px;
    border-radius: var(--ha-card-border-radius, 12px);
    background: rgba(var(--rgb-warning-color, 255, 166, 0), 0.12);
    color: var(--primary-text-color);
    font-size: 0.9em;
    line-height: 1.35;
  }

  .notice.error {
    background: rgba(var(--rgb-error-color, 219, 68, 55), 0.12);
  }

  .notice ha-svg-icon {
    flex: 0 0 auto;
    color: var(--warning-color, #ffa600);
  }

  .notice.error ha-svg-icon {
    color: var(--error-color, #db4437);
  }

  .empty {
    color: var(--secondary-text-color);
    font-size: 0.95em;
    text-align: center;
    padding: 8px 0;
  }

  .reorder-toggle {
    --mdc-icon-button-size: 32px;
    --mdc-icon-size: 20px;
    color: var(--secondary-text-color);
    margin-inline-start: -6px;
  }

  .reorder-toggle.active {
    color: var(--primary-color);
  }

  .reorder-hint {
    color: var(--secondary-text-color);
    font-size: 0.8em;
    padding-bottom: 4px;
  }

  /* Waehrend des Sortierens keine Trennlinien: das Ghost-Element von
     ha-sortable saehe sonst aus, als gehoerte es zwischen zwei Zeilen. */
  .devices.reordering > *:not(:last-child) {
    border-bottom: none;
  }
`;
