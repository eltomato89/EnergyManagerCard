import { LitElement, css, html, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { EDITOR_TAG } from '../const';
import { fireEvent } from '../lib/events';
import { loadHaComponents } from '../lib/ha-elements';
import { findIntegration } from '../lib/integration';
import { collectWarnings } from '../lib/validate';
import { localizer, type LocalizeFn } from '../localize/localize';
import type { EnergyManagerCardConfig } from '../types/config';
import type { HomeAssistant, LovelaceCardEditor } from '../types/hass';
import { stripEmpty } from './merge';
import { mainSchema } from './schema';

@customElement(EDITOR_TAG)
export class EnergyManagerCardEditor extends LitElement implements LovelaceCardEditor {
  @property({ attribute: false }) public hass?: HomeAssistant;

  @state() private _config?: EnergyManagerCardConfig;

  private _localize: LocalizeFn = localizer('en');

  /**
   * true, wenn die Karte selbst rechnet — also ohne Energy-Manager-Integration
   * oder mit ausdruecklich abgeschaltetem `use_integration`.
   */
  private _standalone(): boolean {
    if (this._config?.use_integration === false) return true;
    return findIntegration(this.hass) === null;
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

    const standalone = this._standalone();

    return html`
      <ha-form
        .hass=${this.hass}
        .data=${config}
        .schema=${mainSchema(config, { standalone })}
        .computeLabel=${this._computeLabel}
        .computeHelper=${this._computeHelper}
        @value-changed=${this._valueChanged}
      ></ha-form>

      ${standalone ? this.renderMissingIntegration() : this.renderIntegrationNotice()}
      ${standalone ? this.renderWarnings(config) : nothing}
    `;
  }

  /**
   * Was zu tun ist, damit Verbraucher erscheinen.
   *
   * Die Karte fuehrt selbst keine Verbraucherliste mehr — sie ist das
   * Anzeigeteil der Integration. Ohne diese kann sie den Ueberschuss zeigen,
   * aber nichts, was sich schalten liesse.
   */
  private renderMissingIntegration() {
    return html`
      <ha-alert alert-type="warning">
        ${this._localize('editor.integration.missing')}
        <a
          href="https://github.com/eltomato89/EnergyManagerIntegration"
          target="_blank"
          rel="noopener noreferrer"
          >${this._localize('editor.integration.learn_more')}</a
        >
      </ha-alert>
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

    // `devices` steht nicht im Formular, kommt also auch nicht zurueck. Eine
    // bestehende Liste aus einer aelteren Konfiguration muss trotzdem erhalten
    // bleiben — sonst loescht ein Klick auf ein beliebiges Feld sie weg.
    const next = stripEmpty(ev.detail.value);
    this._emit({ ...next, ...(this._config.devices ? { devices: this._config.devices } : {}) });
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
