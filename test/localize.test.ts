import { describe, expect, it } from 'vitest';
import de from '../src/localize/languages/de.json';
import en from '../src/localize/languages/en.json';
import { localize } from '../src/localize/localize';

/**
 * Vollstaendigkeit der Nutzertexte.
 *
 * Der Anlass ist ein konkreter Fund: Die Beschreibung im Kartenkatalog stand
 * hartcodiert auf Deutsch und war damit in einer englischen Oberflaeche
 * deutsch. Solche Texte fallen niemandem auf, der die Karte in seiner eigenen
 * Sprache benutzt — also pruefen das die Tests.
 */
function flatten(table: unknown, prefix = ''): Array<[string, string]> {
  if (typeof table !== 'object' || table === null) return [];
  return Object.entries(table).flatMap(([key, value]) =>
    typeof value === 'string'
      ? [[prefix + key, value] as [string, string]]
      : flatten(value, `${prefix}${key}.`),
  );
}

const DE = flatten(de);
const EN = flatten(en);

describe('Sprachdateien', () => {
  it('fuehren dieselben Schluessel in derselben Reihenfolge', () => {
    // Ein Text, der nur in einer Sprache existiert, erscheint sonst als
    // Schluessel — `localize` faellt zuletzt auf ihn zurueck.
    expect(EN.map(([key]) => key)).toEqual(DE.map(([key]) => key));
  });

  it('enthalten im Englischen keinen deutschen Rest', () => {
    const umlaute = EN.filter(([, text]) => /[äöüßÄÖÜ]/.test(text));

    expect(umlaute).toEqual([]);
  });

  /**
   * Texte, die in beiden Sprachen gleich lauten duerfen: Woerter, die im
   * Englischen identisch sind, und Symbole mit Platzhaltern.
   */
  const GLEICH_ERLAUBT = new Set([
    'card.average',
    'card.max_power',
    'editor.secondary_info.status',
  ]);

  it('sind im Englischen tatsaechlich uebersetzt', () => {
    // Wortlisten fangen einen kopierten Text nicht: „Einschaltbereit" enthaelt
    // weder Umlaut noch deutsches Funktionswort. Ein Vergleich der beiden
    // Fassungen schon.
    const deutsch = new Map(DE);
    const kopiert = EN.filter(
      ([key, text]) => !GLEICH_ERLAUBT.has(key) && deutsch.get(key) === text,
    );

    expect(kopiert).toEqual([]);
  });
});

describe('Beschreibung im Kartenkatalog', () => {
  it('steht in beiden Sprachen bereit', () => {
    // Sie wird beim Laden des Moduls gebraucht, bevor es ein `hass` gibt —
    // deshalb ueber `navigator.language` und nicht ueber die HA-Sprache.
    expect(localize('de', 'card.picker_description')).toMatch(/Überschuss/);
    expect(localize('en', 'card.picker_description')).toMatch(/surplus/);
  });

  it('faellt bei einer unbekannten Sprache auf Englisch zurueck', () => {
    expect(localize('fr', 'card.picker_description')).toBe(
      localize('en', 'card.picker_description'),
    );
  });
});
