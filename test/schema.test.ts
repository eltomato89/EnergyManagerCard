import { describe, expect, it } from 'vitest';
import { mainSchema } from '../src/editor/schema';
import de from '../src/localize/languages/de.json';
import en from '../src/localize/languages/en.json';
import type { EnergyManagerCardConfig } from '../src/types/config';

/** Alle Feldnamen eines Schemas, auch aus verschachtelten Gruppen. */
function fieldNames(schema: readonly unknown[]): string[] {
  const out: string[] = [];
  for (const item of schema as Array<Record<string, unknown>>) {
    const name = typeof item.name === 'string' ? item.name : '';
    if (Array.isArray(item.schema)) {
      if (name) out.push(name);
      out.push(...fieldNames(item.schema));
    } else if (name) {
      out.push(name);
    }
  }
  return out;
}

type Texts = Record<string, Record<string, string>>;
const texts = {
  de: (de as unknown as { editor: Texts }).editor,
  en: (en as unknown as { editor: Texts }).editor,
};

const config: EnergyManagerCardConfig = { type: 'custom:energy-manager-card' };

describe('mainSchema', () => {
  it('blendet ohne Integration alle Sensorfelder ein', () => {
    const names = fieldNames(mainSchema(config, { standalone: true }));
    expect(names).toContain('meter_mode');
    expect(names).toContain('battery');
    expect(names).toContain('smoothing_window');
  });

  it('laesst mit Integration weg, was sie selbst fuehrt', () => {
    // Diese Felder doppelt anzubieten waere schlimmer als sie wegzulassen:
    // zwei Stellen fuer dieselbe Angabe, von denen nur eine wirkt.
    const names = fieldNames(mainSchema(config, { standalone: false }));

    for (const feld of [
      'meter_mode',
      'grid_entity',
      'production_entity',
      'consumption_entity',
      'battery',
      'battery_soc_entity',
      'smoothing_window',
    ]) {
      expect(names, feld).not.toContain(feld);
    }
  });

  it('behaelt mit Integration die Darstellungsoptionen', () => {
    const names = fieldNames(mainSchema(config, { standalone: false }));
    expect(names).toContain('title');
    expect(names).toContain('scale_max');
    expect(names).toContain('secondary_info');
    expect(names).toContain('allow_reorder');
  });

  it('kennt keine Verbraucherfelder mehr', () => {
    // Verbraucher werden ausschliesslich in der Integration gepflegt. Ein
    // zweiter Ort dafuer war genau das Problem, das der Umbau beseitigt hat.
    const alle = [
      ...fieldNames(mainSchema(config, { standalone: true })),
      ...fieldNames(mainSchema(config, { standalone: false })),
    ];
    for (const feld of ['devices', 'switch_entity', 'priority_entity', 'auto_entity']) {
      expect(alle, feld).not.toContain(feld);
    }
  });

  it('bietet keinen Schalter, um die Integration abzuwaehlen', () => {
    // Die Karte ist das Anzeigeteil der Integration. Sie ohne diese zu
    // betreiben ist ein Rueckfall, kein Betriebsmodus — ein Feld im Formular
    // wuerde dafuer werben. Wer es braucht, setzt `use_integration` im YAML.
    for (const options of [{ standalone: true }, { standalone: false }]) {
      expect(fieldNames(mainSchema(config, options))).not.toContain('use_integration');
    }
  });
});

describe('Beschriftungen', () => {
  const alleFelder = [
    ...fieldNames(mainSchema(config, { standalone: true })),
    ...fieldNames(mainSchema(config, { standalone: false })),
    ...fieldNames(mainSchema({ ...config, meter_mode: 'split' }, { standalone: true })),
  ].filter((name) => name !== '');

  for (const sprache of ['de', 'en'] as const) {
    it(`${sprache}: jedes angezeigte Feld hat eine Beschriftung`, () => {
      // Fehlt sie, zeigt der Editor den rohen Schluessel — das faellt sonst
      // erst im laufenden Dashboard auf.
      const fehlend = [...new Set(alleFelder)].filter((name) => !texts[sprache][name]?.label);
      expect(fehlend).toEqual([]);
    });
  }

  it('beide Sprachen kennen dieselben Schluessel', () => {
    expect(Object.keys(texts.de).sort()).toEqual(Object.keys(texts.en).sort());
  });

  it('spricht mit Integration nicht mehr von Helfern', () => {
    // Die Integration bringt eigene Entitaeten mit; "Helfer" waere dort die
    // Anleitung zu einem Weg, den es nicht mehr braucht.
    const mitIntegration = fieldNames(mainSchema(config, { standalone: false }));

    for (const sprache of ['de', 'en'] as const) {
      for (const feld of mitIntegration) {
        const eintrag = texts[sprache][feld];
        if (!eintrag) continue;
        const hilfe = eintrag.helper_integration ?? eintrag.helper ?? '';
        expect(hilfe.toLowerCase(), `${sprache}.${feld}`).not.toMatch(/helfer|helper entit|input_/);
      }
    }
  });
});

describe('Register der Nutzertexte', () => {
  /** Jeder Text, den ein Nutzer zu sehen bekommt. */
  function alleTexte(sprache: 'de' | 'en'): Array<[string, string]> {
    const quelle = (sprache === 'de' ? de : en) as unknown as Record<string, unknown>;
    const treffer: Array<[string, string]> = [];

    const gehen = (pfad: string, wert: unknown): void => {
      if (typeof wert === 'string') {
        treffer.push([pfad, wert]);
        return;
      }
      if (wert && typeof wert === 'object') {
        for (const [k, v] of Object.entries(wert)) gehen(pfad ? `${pfad}.${k}` : k, v);
      }
    };
    gehen('', quelle);
    return treffer;
  }

  it('vermeidet umgangssprachliche Wendungen', () => {
    // Sammelt, was beim Durchgehen der Texte als salopp aufgefallen ist.
    // Zustandsnamen wie "reicht nicht" lesen sich wie eine Note statt wie
    // eine technische Aussage.
    const verboten = [
      /reicht nicht/i,
      /fast ausreichend/i,
      /schaltflut/i,
      /\bAmpel\b/,
      /einfach leer lassen/i,
      /wirklich schalten/i,
      /\bweg\b/,
      /lohnt sich/i,
      /angefasst/i,
    ];

    const treffer = alleTexte('de').filter(([, text]) =>
      verboten.some((muster) => muster.test(text)),
    );
    expect(treffer).toEqual([]);
  });

  it('spricht den Nutzer nicht mit Du-Imperativen an', () => {
    // "Trage ein", "Prüfe" — in einer Oberflaeche wirkt der Infinitiv
    // sachlicher und ist in Home Assistant ueblich.
    const verboten = /\b(Trage|Prüfe|Nutze|Setze|Aktiviere|Ergänze|Schau)\b/;
    const treffer = alleTexte('de').filter(([, text]) => verboten.test(text));
    expect(treffer).toEqual([]);
  });

  it('haelt die englische Fassung frei von unuebersetzten Resten', () => {
    // Der haeufigste Fehler ist nicht ein halb deutscher Satz, sondern ein
    // Text, der beim Ergaenzen schlicht kopiert und nicht uebersetzt wurde.
    // Genau den fangen Wortlisten NICHT — "Einschaltbereit" enthaelt weder
    // Umlaut noch Funktionswort.
    //
    // Ausgenommen sind Texte, die in beiden Sprachen gleich lauten duerfen:
    // Symbole mit Platzhaltern und Woerter, die im Englischen identisch sind.
    const gleichErlaubt = new Set([
      'card.average',
      'card.max_power',
      'editor.secondary_info.status',
    ]);

    const deutsch = new Map(alleTexte('de'));
    const treffer = alleTexte('en').filter(
      ([pfad, text]) => !gleichErlaubt.has(pfad) && deutsch.get(pfad) === text,
    );
    expect(treffer).toEqual([]);
  });

  it('haelt beide Sprachen deckungsgleich', () => {
    // Ein Text, der nur in einer Sprache existiert, erscheint in der anderen
    // als roher Schluessel.
    expect(alleTexte('de').map(([p]) => p)).toEqual(alleTexte('en').map(([p]) => p));
  });
});
