import de from './languages/de.json';
import en from './languages/en.json';

type Translations = Record<string, unknown>;

const LANGUAGES: Record<string, Translations> = { de, en };
const FALLBACK = 'en';

/**
 * Loest einen punktseparierten Schluessel auf und ersetzt {platzhalter}.
 *
 * Faellt der Reihe nach zurueck: exakte Sprache, Basissprache ohne Region
 * (de-CH -> de), Englisch, zuletzt der Schluessel selbst. So bleibt die Karte
 * auch bei einer unvollstaendigen Uebersetzung bedienbar.
 */
export function localize(
  language: string | undefined,
  key: string,
  placeholders?: Record<string, string | number>,
): string {
  const candidates = [language, language?.split('-')[0], FALLBACK].filter(
    (l): l is string => typeof l === 'string' && l !== '',
  );

  for (const candidate of candidates) {
    const table = LANGUAGES[candidate];
    if (!table) continue;
    const value = lookup(table, key);
    if (typeof value === 'string') return substitute(value, placeholders);
  }

  return key;
}

function lookup(table: Translations, key: string): unknown {
  let current: unknown = table;
  for (const part of key.split('.')) {
    if (typeof current !== 'object' || current === null) return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

function substitute(text: string, placeholders?: Record<string, string | number>): string {
  if (!placeholders) return text;
  return text.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in placeholders ? String(placeholders[name]) : match,
  );
}

/** Bindet die Sprache einmal, damit Komponenten sie nicht durchreichen muessen. */
export function localizer(language: string | undefined) {
  return (key: string, placeholders?: Record<string, string | number>) =>
    localize(language, key, placeholders);
}

export type LocalizeFn = ReturnType<typeof localizer>;
