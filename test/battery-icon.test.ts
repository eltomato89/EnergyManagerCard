import { describe, expect, it } from 'vitest';
import {
  FLOW_DEADBAND_W,
  FRAME_COUNT,
  batteryFlow,
  batteryFrame,
  batteryIconForSoc,
} from '../src/lib/battery-icon';

describe('batteryFlow', () => {
  it('erkennt Laden und Entladen am Vorzeichen', () => {
    expect(batteryFlow(1200)).toBe('charging');
    expect(batteryFlow(-800)).toBe('discharging');
  });

  it('haelt kleine Werte fuer Ruhe', () => {
    // Ein Leistungssensor pendelt im Leerlauf um die Null. Ohne Totband
    // wechselte die Animation dabei staendig die Richtung.
    expect(batteryFlow(FLOW_DEADBAND_W - 1)).toBeNull();
    expect(batteryFlow(-(FLOW_DEADBAND_W - 1))).toBeNull();
    expect(batteryFlow(0)).toBeNull();
  });

  it('animiert nichts ohne Messwert', () => {
    expect(batteryFlow(null)).toBeNull();
    expect(batteryFlow(undefined)).toBeNull();
    expect(batteryFlow(Number.NaN)).toBeNull();
  });
});

describe('batteryFrame', () => {
  it('zeigt ohne Richtung den tatsaechlichen Ladestand', () => {
    // Das ist der Ruhezustand und zugleich der Fall "Bewegung abbestellt":
    // dort darf kein Zwischenbild stehenbleiben.
    expect(batteryFrame(null, 3, 62)).toBe(batteryIconForSoc(62));
    expect(batteryFrame(null, 0, 5)).toBe(batteryIconForSoc(5));
  });

  it('laeuft in beiden Richtungen durch alle Bilder', () => {
    const laden = new Set<string>();
    const entladen = new Set<string>();
    for (let step = 0; step < FRAME_COUNT; step++) {
      laden.add(batteryFrame('charging', step, 62));
      entladen.add(batteryFrame('discharging', step, 62));
    }
    expect(laden.size).toBe(FRAME_COUNT);
    expect(entladen.size).toBe(FRAME_COUNT);
  });

  it('laeuft aufwaerts und abwaerts durch verschiedene Bilder', () => {
    const laden = Array.from({ length: FRAME_COUNT }, (_, i) => batteryFrame('charging', i, 62));
    const entladen = Array.from({ length: FRAME_COUNT }, (_, i) =>
      batteryFrame('discharging', i, 62),
    );
    // Die Ladebilder tragen den Blitz, die Entladebilder nicht — sonst waere
    // die wandernde Fuellung vom echten Ladestand nicht zu unterscheiden.
    expect(laden).not.toEqual(entladen);
  });

  it('ignoriert den Ladestand, solange etwas fliesst', () => {
    // Die Animation ist Bewegung, kein Messwert. Der echte Stand steht als
    // Zahl daneben.
    expect(batteryFrame('charging', 2, 5)).toBe(batteryFrame('charging', 2, 95));
  });

  it('laeuft im Kreis, auch bei ueberlaufendem Schritt', () => {
    expect(batteryFrame('charging', FRAME_COUNT, 62)).toBe(batteryFrame('charging', 0, 62));
    expect(batteryFrame('charging', -1, 62)).toBe(batteryFrame('charging', FRAME_COUNT - 1, 62));
  });
});

describe('batteryIconForSoc', () => {
  it('unterscheidet die Stufen', () => {
    expect(batteryIconForSoc(100)).not.toBe(batteryIconForSoc(50));
    expect(batteryIconForSoc(50)).not.toBe(batteryIconForSoc(0));
  });

  it('faellt ohne Ladestand auf das leere Symbol zurueck', () => {
    expect(batteryIconForSoc(null)).toBe(batteryIconForSoc(0));
  });
});
