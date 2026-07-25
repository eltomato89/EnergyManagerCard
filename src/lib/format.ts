import type { FrontendLocaleData } from '../types/hass';

/**
 * Formatiert eine Leistung in W bzw. kW.
 *
 * Fuer reine Entity-Zustaende waere hass.formatEntityState vorzuziehen, weil es
 * display_precision aus der Entity-Registry beruecksichtigt. Hier geht es aber
 * um berechnete Groessen (Ueberschuss, Summen), fuer die es keinen
 * Registry-Eintrag gibt — also selbst formatieren, aber wenigstens mit dem
 * Zahlenformat des Nutzers.
 */
export function formatPower(watts: number | null, locale?: FrontendLocaleData): string {
  if (watts === null || !Number.isFinite(watts)) return '—';

  const abs = Math.abs(watts);
  const lang = locale?.language || 'de';

  if (abs >= 1000) {
    const kw = watts / 1000;
    return `${new Intl.NumberFormat(lang, {
      minimumFractionDigits: 1,
      maximumFractionDigits: abs >= 10000 ? 1 : 2,
    }).format(kw)} kW`;
  }

  return `${new Intl.NumberFormat(lang, { maximumFractionDigits: 0 }).format(watts)} W`;
}

export function formatPercent(value: number | null, locale?: FrontendLocaleData): string {
  if (value === null || !Number.isFinite(value)) return '—';
  const lang = locale?.language || 'de';
  return `${new Intl.NumberFormat(lang, { maximumFractionDigits: 0 }).format(value)} %`;
}

/** Sekunden als m:ss bzw. h:mm:ss — fuer den Sperrzeit-Countdown. */
export function formatDuration(seconds: number): string {
  const total = Math.max(0, Math.ceil(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;

  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}
