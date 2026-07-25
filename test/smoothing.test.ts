import { describe, expect, it } from 'vitest';
import { TimeWeightedWindow } from '../src/lib/smoothing';
import { MAX_SAMPLES } from '../src/const';

const T0 = 1_000_000;

describe('TimeWeightedWindow', () => {
  it('gewichtet nach Dauer, nicht nach Anzahl der Messwerte', () => {
    // Der Kernfall: 55 s auf 3000 W, dann 5 s auf 0 W.
    // Arithmetisch waeren das 1500 W — richtig sind 2750 W.
    const w = new TimeWeightedWindow(60_000);
    w.push(3000, T0);
    w.push(0, T0 + 55_000);

    expect(w.value(T0 + 60_000)).toBeCloseTo(2750, 5);
  });

  it('laesst den letzten Wert bis jetzt weitergelten', () => {
    const w = new TimeWeightedWindow(60_000);
    w.push(1000, T0);
    // Kein weiterer Messwert: 1000 W gilt durchgehend.
    expect(w.value(T0 + 30_000)).toBe(1000);
  });

  it('traegt den letzten Wert vor dem Fenster hinein (Carry-in)', () => {
    const w = new TimeWeightedWindow(60_000);
    // Seit fuenf Minuten unveraendert — ohne Carry-in waere das Fenster leer.
    w.push(2200, T0);
    expect(w.value(T0 + 300_000)).toBe(2200);
  });

  it('laesst alte Werte aus dem Fenster herausfallen', () => {
    const w = new TimeWeightedWindow(60_000);
    w.push(0, T0);
    w.push(1000, T0 + 100_000);

    // T0+130s: die letzten 60 s bestehen je zur Haelfte aus 0 W und 1000 W.
    expect(w.value(T0 + 130_000)).toBe(500);
    // T0+160s: der 0-Abschnitt ist vollstaendig aus dem Fenster gewandert.
    expect(w.value(T0 + 160_000)).toBe(1000);
  });

  it('uebergeht Luecken, statt sie als 0 zu gewichten', () => {
    const w = new TimeWeightedWindow(60_000);
    w.push(2000, T0);
    w.push(null, T0 + 30_000); // Sensor faellt aus
    // Nur die ersten 30 s zaehlen, der Ausfall wird nicht als 0 W gewertet.
    expect(w.value(T0 + 60_000)).toBe(2000);
  });

  it('liefert null, solange kein gueltiger Wert vorliegt', () => {
    const w = new TimeWeightedWindow(60_000);
    expect(w.value(T0)).toBeNull();
    w.push(null, T0);
    expect(w.value(T0 + 10_000)).toBeNull();
  });

  it('meldet die Abdeckung des Fensters', () => {
    const w = new TimeWeightedWindow(60_000);
    w.push(1000, T0);
    expect(w.coverage(T0 + 30_000)).toBeCloseTo(0.5, 5);
    expect(w.coverage(T0 + 60_000)).toBeCloseTo(1, 5);
    // Nie ueber 1, auch wenn laenger nichts passiert.
    expect(w.coverage(T0 + 120_000)).toBe(1);
  });

  it('meldet Abdeckung 0 ohne Daten', () => {
    const w = new TimeWeightedWindow(60_000);
    expect(w.coverage(T0)).toBe(0);
  });

  it('schaltet bei Fenster 0 auf den letzten Wert um', () => {
    const w = new TimeWeightedWindow(0);
    w.push(1000, T0);
    w.push(250, T0 + 1000);
    expect(w.value(T0 + 2000)).toBe(250);
    expect(w.coverage(T0 + 2000)).toBe(1);
  });

  it('begrenzt den Puffer bei flatternden Sensoren', () => {
    const w = new TimeWeightedWindow(600_000);
    for (let i = 0; i < MAX_SAMPLES + 250; i++) w.push(i, T0 + i * 10);
    // Kein unbegrenztes Wachstum, Ergebnis bleibt endlich.
    const value = w.value(T0 + (MAX_SAMPLES + 250) * 10);
    expect(Number.isFinite(value as number)).toBe(true);
  });

  it('verwirft den Puffer bei einem Zeitsprung rueckwaerts', () => {
    const w = new TimeWeightedWindow(60_000);
    w.push(3000, T0);
    w.push(500, T0 - 10_000); // Uhr springt zurueck
    expect(w.value(T0 - 5_000)).toBe(500);
  });

  it('setzt beim Aendern der Fensterbreite zurueck', () => {
    const w = new TimeWeightedWindow(60_000);
    w.push(3000, T0);
    w.setWindow(120_000);
    expect(w.value(T0 + 1000)).toBeNull();
  });

  it('laesst eine unveraenderte Fensterbreite den Puffer behalten', () => {
    const w = new TimeWeightedWindow(60_000);
    w.push(3000, T0);
    w.setWindow(60_000);
    expect(w.value(T0 + 1000)).toBe(3000);
  });

  it('leert den Puffer auf reset()', () => {
    const w = new TimeWeightedWindow(60_000);
    w.push(3000, T0);
    w.reset();
    expect(w.value(T0 + 1000)).toBeNull();
  });
});
