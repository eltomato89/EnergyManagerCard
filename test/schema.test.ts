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
