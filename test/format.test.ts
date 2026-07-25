import { describe, expect, it } from 'vitest';
import { formatDuration, formatPercent, formatPower } from '../src/lib/format';

const DE = { language: 'de', number_format: 'comma_decimal', time_format: '24' };

describe('formatPower', () => {
  it('bleibt unter 1000 bei Watt', () => {
    expect(formatPower(750, DE)).toBe('750 W');
    expect(formatPower(-300, DE)).toBe('-300 W');
  });

  it('wechselt ab 1000 auf Kilowatt', () => {
    expect(formatPower(1500, DE)).toBe('1,5 kW');
    expect(formatPower(11000, DE)).toBe('11,0 kW');
  });

  it('zeigt fehlende Werte als Gedankenstrich', () => {
    expect(formatPower(null, DE)).toBe('—');
    expect(formatPower(Number.NaN, DE)).toBe('—');
  });

  it('kommt ohne Locale aus', () => {
    expect(formatPower(500)).toContain('W');
  });
});

describe('formatPercent', () => {
  it('rundet auf ganze Prozent', () => {
    expect(formatPercent(62.4, DE)).toBe('62 %');
    expect(formatPercent(null, DE)).toBe('—');
  });
});

describe('formatDuration', () => {
  it('zeigt Minuten und Sekunden', () => {
    expect(formatDuration(252)).toBe('4:12');
    expect(formatDuration(45)).toBe('0:45');
    expect(formatDuration(60)).toBe('1:00');
  });

  it('ergaenzt Stunden bei langen Sperren', () => {
    expect(formatDuration(3661)).toBe('1:01:01');
  });

  it('faellt nicht ins Negative', () => {
    expect(formatDuration(-10)).toBe('0:00');
  });
});
