import type { HassEntity, HassConfig, Connection, Auth } from 'home-assistant-js-websocket';

export type { HassEntity };

/**
 * Minimale Nachbildung des `hass`-Objekts, abgeschrieben von
 * home-assistant/frontend@dev (src/types.ts).
 *
 * Bewusst kein `custom-card-helpers`: das Paket zieht intl-messageformat,
 * superstruct und @formatjs/intl-utils nach und bringt ein eigenes, regelmaessig
 * veraltetes HomeAssistant-Interface mit. Gebraucht werden davon nur fireEvent
 * und hasConfigOrEntityChanged — beides steht in src/lib/.
 */
export interface HomeAssistant {
  auth: Auth;
  connection: Connection;
  connected: boolean;
  states: Record<string, HassEntity>;
  entities: Record<string, EntityRegistryDisplayEntry>;
  config: HassConfig;
  themes: Themes;
  selectedTheme?: ThemeSettings | null;
  user?: CurrentUser;
  language: string;
  locale: FrontendLocaleData;
  localize: (key: string, ...args: unknown[]) => string;
  formatEntityState: (stateObj: HassEntity, state?: string) => string;
  callService: (
    domain: string,
    service: string,
    serviceData?: Record<string, unknown>,
    target?: Record<string, unknown>,
  ) => Promise<unknown>;
  callWS: <T>(msg: Record<string, unknown>) => Promise<T>;
}

export interface EntityRegistryDisplayEntry {
  entity_id: string;
  name?: string;
  device_id?: string;
  area_id?: string;
  hidden?: boolean;
  entity_category?: 'config' | 'diagnostic';
  translation_key?: string;
  platform?: string;
  display_precision?: number;
}

export interface CurrentUser {
  id: string;
  is_owner: boolean;
  is_admin: boolean;
  name: string;
}

export interface Themes {
  default_theme: string;
  default_dark_theme?: string | null;
  themes: Record<string, unknown>;
  darkMode: boolean;
}

export interface ThemeSettings {
  theme: string;
  dark?: boolean;
  primaryColor?: string;
  accentColor?: string;
}

export interface FrontendLocaleData {
  language: string;
  number_format: string;
  time_format: string;
}

/* ------------------------------------------------------------------ */
/* Lovelace                                                            */
/* ------------------------------------------------------------------ */

export interface LovelaceCardConfig {
  type: string;
  [key: string]: unknown;
}

/** Seit HA 2024.11; ersetzt das abgekuendigte LovelaceLayoutOptions. */
export interface LovelaceGridOptions {
  columns?: number | 'full';
  rows?: number | 'auto';
  min_columns?: number;
  max_columns?: number;
  min_rows?: number;
  max_rows?: number;
}

export interface LovelaceCard extends HTMLElement {
  hass?: HomeAssistant;
  preview?: boolean;
  getCardSize(): number | Promise<number>;
  getGridOptions?(): LovelaceGridOptions;
  setConfig(config: LovelaceCardConfig): void;
}

export interface LovelaceCardEditor extends HTMLElement {
  hass?: HomeAssistant;
  setConfig(config: LovelaceCardConfig): void;
}

/** Eintrag in `window.customCards`, siehe frontend/src/data/lovelace_custom_cards.ts */
export interface CustomCardEntry {
  type: string;
  name?: string;
  description?: string;
  preview?: boolean;
  documentationURL?: string;
}

declare global {
  interface Window {
    customCards?: CustomCardEntry[];
    loadCardHelpers?: () => Promise<{
      createCardElement: (config: LovelaceCardConfig) => Promise<LovelaceCard>;
    }>;
  }
}
