export const CARD_TYPE = 'energy-manager-card';
export const CARD_TAG = 'energy-manager-card';
export const EDITOR_TAG = 'energy-manager-card-editor';
export const DEVICE_ROW_TAG = 'energy-manager-device-row';
export const SURPLUS_BAR_TAG = 'energy-manager-surplus-bar';
export const BATTERY_BADGE_TAG = 'energy-manager-battery-badge';

export const REPO_URL = 'https://github.com/eltomato89/EnergyManagerCard';

/* Defaults ---------------------------------------------------------- */

/** s, Fenster des gleitenden Mittels. */
export const DEFAULT_SMOOTHING_WINDOW = 60;
/** s, Sampling- und Render-Takt. */
export const DEFAULT_UPDATE_INTERVAL = 5;
/** W, angenommener Bedarf, wenn weder min_power, max_power noch eine Ist-Leistung vorliegen. */
export const DEFAULT_REQUIRED_W = 500;
/** W, Untergrenze der Leistungsskala. */
export const MIN_SCALE_MAX = 3000;
/** W, Rasterung der automatisch bestimmten Skala. */
export const SCALE_STEP = 500;
/** Anteil des Bedarfs, ab dem ein Geraet als "fast bereit" gilt. */
export const CLOSE_THRESHOLD_RATIO = 0.8;
/** Maximale Anzahl Stuetzstellen im Glaettungsfenster. */
export const MAX_SAMPLES = 600;
/** ms, nach denen ein optimistischer Schaltzustand verworfen wird. */
export const OPTIMISTIC_TIMEOUT_MS = 5000;

/* HA-Zustaende ------------------------------------------------------ */

export const UNAVAILABLE = 'unavailable';
export const UNKNOWN = 'unknown';
