import { describe, expect, it } from 'vitest';
import { applyReserve, computeSurplus } from '../src/lib/surplus';
import type { SurplusInput } from '../src/types/runtime';

const NONE = { w: null, reason: 'missing' as const };

function input(overrides: Partial<SurplusInput> = {}): SurplusInput {
  return {
    mode: 'grid',
    grid: NONE,
    production: NONE,
    consumption: NONE,
    battery: NONE,
    batteryConfigured: false,
    batteryMode: 'charge_only',
    batterySoc: null,
    consumptionIncludesBattery: false,
    batteryReserveW: 0,
    ...overrides,
  };
}

describe('computeSurplus — Modus grid', () => {
  it('macht aus Einspeisung positiven Ueberschuss', () => {
    // -2000 W am Netz = 2000 W Einspeisung
    const result = computeSurplus(input({ grid: { w: -2000 } }));
    expect(result.raw).toBe(2000);
    expect(result.available).toBe(2000);
    expect(result.errors).toEqual([]);
  });

  it('macht aus Netzbezug negativen Ueberschuss', () => {
    const result = computeSurplus(input({ grid: { w: 800 } }));
    expect(result.available).toBe(-800);
  });

  it('rechnet Batterieladung als umlenkbare Leistung hinzu', () => {
    // Netz ausgeglichen, aber 1500 W gehen in die Batterie: die koennte
    // stattdessen ein Verbraucher bekommen.
    const result = computeSurplus(
      input({ grid: { w: 0 }, battery: { w: 1500 }, batteryConfigured: true }),
    );
    expect(result.raw).toBe(1500);
    expect(result.batteryCorrection).toBe(1500);
    expect(result.degraded).toBe(false);
  });

  it('ignoriert Batterieentladung im Modus charge_only', () => {
    const result = computeSurplus(
      input({ grid: { w: 0 }, battery: { w: -1000 }, batteryConfigured: true }),
    );
    expect(result.raw).toBe(0);
    expect(result.batteryCorrection).toBe(0);
  });

  it('zieht Batterieentladung im Modus full ab', () => {
    const result = computeSurplus(
      input({
        grid: { w: 0 },
        battery: { w: -1000 },
        batteryConfigured: true,
        batteryMode: 'full',
      }),
    );
    expect(result.raw).toBe(-1000);
  });

  it('rechnet Ladung in beiden Modi gleich an', () => {
    const base = { grid: { w: 0 }, battery: { w: 1500 }, batteryConfigured: true };
    expect(computeSurplus(input(base)).raw).toBe(1500);
    expect(computeSurplus(input({ ...base, batteryMode: 'full' })).raw).toBe(1500);
  });

  it('meldet bei entladender Batterie kein Defizit in Hoehe der Entladeleistung', () => {
    // Realer Fall aus einer Anlage: 7 W Netzbezug, Batterie entlaedt mit 386 W.
    // Der Modus 'full' meldete hier -393 W und beschriftete das als Netzbezug —
    // ein Wert, der dem Zaehler klar widerspricht.
    const messwerte = {
      grid: { w: 7 },
      battery: { w: -386 },
      batteryConfigured: true,
      batterySoc: 84,
    };

    const chargeOnly = computeSurplus(input(messwerte));
    expect(chargeOnly.available).toBe(-7);
    // Die Rohwerte bleiben unabhaengig vom Modus erhalten, damit die Karte den
    // tatsaechlichen Zaehlerstand danebenstellen kann.
    expect(chargeOnly.gridW).toBe(7);
    expect(chargeOnly.batteryW).toBe(-386);

    expect(computeSurplus(input({ ...messwerte, batteryMode: 'full' })).available).toBe(-393);
  });

  it('markiert das Ergebnis als degraded, wenn der Batteriesensor ausfaellt', () => {
    const result = computeSurplus(
      input({
        grid: { w: -2000 },
        battery: { w: null, reason: 'unavailable' },
        batteryConfigured: true,
      }),
    );
    expect(result.degraded).toBe(true);
    expect(result.batteryCorrection).toBe(0);
    // Der Netzwert allein bleibt verwertbar, wird aber als unsicher ausgewiesen.
    expect(result.raw).toBe(2000);
  });

  it('meldet einen fehlenden Netzsensor als Fehler statt 0 zu liefern', () => {
    const result = computeSurplus(input({ grid: { w: null, reason: 'missing' } }));
    expect(result.raw).toBeNull();
    expect(result.available).toBeNull();
    expect(result.errors).toContain('missing-grid');
  });

  it('unterscheidet unavailable von falscher Einheit', () => {
    expect(computeSurplus(input({ grid: { w: null, reason: 'unavailable' } })).errors).toContain(
      'grid-unavailable',
    );
    expect(computeSurplus(input({ grid: { w: null, reason: 'wrong-unit' } })).errors).toContain(
      'wrong-unit',
    );
  });
});

describe('computeSurplus — Modus split', () => {
  it('bildet Erzeugung minus Verbrauch', () => {
    const result = computeSurplus(
      input({ mode: 'split', production: { w: 5000 }, consumption: { w: 1800 } }),
    );
    expect(result.raw).toBe(3200);
  });

  it('liefert dasselbe Ergebnis wie der grid-Modus bei gleicher Anlage', () => {
    // Anlage: 5000 W PV, 1800 W Haus, keine Batterie => 3200 W Einspeisung
    const viaGrid = computeSurplus(input({ grid: { w: -3200 } }));
    const viaSplit = computeSurplus(
      input({ mode: 'split', production: { w: 5000 }, consumption: { w: 1800 } }),
    );
    expect(viaSplit.raw).toBe(viaGrid.raw);
  });

  it('addiert die Batterie nur, wenn der Verbrauchssensor sie mitzaehlt', () => {
    const base = { mode: 'split' as const, production: { w: 5000 }, consumption: { w: 3000 } };
    const ohne = computeSurplus(input({ ...base, battery: { w: 1200 }, batteryConfigured: true }));
    const mit = computeSurplus(
      input({
        ...base,
        battery: { w: 1200 },
        batteryConfigured: true,
        consumptionIncludesBattery: true,
      }),
    );
    expect(ohne.raw).toBe(2000);
    expect(mit.raw).toBe(3200);
  });

  it('meldet beide fehlenden Sensoren einzeln', () => {
    const result = computeSurplus(input({ mode: 'split' }));
    expect(result.errors).toContain('missing-production');
    expect(result.errors).toContain('missing-consumption');
    expect(result.raw).toBeNull();
  });

  it('rechnet nicht weiter, wenn nur einer der beiden Sensoren fehlt', () => {
    const result = computeSurplus(input({ mode: 'split', production: { w: 5000 } }));
    expect(result.raw).toBeNull();
    expect(result.errors).toEqual(['missing-consumption']);
  });
});

describe('applyReserve', () => {
  it('zieht die Batteriereserve ab', () => {
    expect(applyReserve(2000, null, undefined, 500)).toBe(1500);
  });

  it('sperrt den Ueberschuss unterhalb der SoC-Grenze', () => {
    expect(applyReserve(2000, 15, 20, 0)).toBe(0);
  });

  it('laesst den Ueberschuss ab der SoC-Grenze wieder frei', () => {
    expect(applyReserve(2000, 20, 20, 0)).toBe(2000);
    expect(applyReserve(2000, 55, 20, 0)).toBe(2000);
  });

  it('verschlechtert ein bestehendes Defizit unterhalb der SoC-Grenze nicht', () => {
    // min(-800, 0) = -800: der Netzbezug bleibt sichtbar.
    expect(applyReserve(-800, 10, 20, 0)).toBe(-800);
  });

  it('klemmt negative Werte nicht weg — sie bedeuten Netzbezug', () => {
    expect(applyReserve(200, null, undefined, 500)).toBe(-300);
  });

  it('reicht null durch', () => {
    expect(applyReserve(null, 50, 20, 100)).toBeNull();
  });

  it('ignoriert die SoC-Regel ohne konfigurierte Grenze', () => {
    expect(applyReserve(2000, 5, undefined, 0)).toBe(2000);
  });
});

describe('computeSurplus — Reserve im Zusammenspiel', () => {
  it('wendet Reserve und SoC-Regel auf das Endergebnis an', () => {
    const result = computeSurplus(
      input({
        grid: { w: -3000 },
        battery: { w: 0 },
        batteryConfigured: true,
        batterySoc: 10,
        batteryMinSoc: 30,
        batteryReserveW: 500,
      }),
    );
    expect(result.raw).toBe(3000);
    expect(result.available).toBe(0);
  });
});
