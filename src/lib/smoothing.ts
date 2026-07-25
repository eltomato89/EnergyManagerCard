import { MAX_SAMPLES } from '../const';

interface Sample {
  t: number;
  v: number | null;
}

/**
 * Zeitgewichteter gleitender Mittelwert.
 *
 * Bewusst nicht arithmetisch: HA-Zustandsaenderungen kommen unregelmaessig.
 * Ein Sensor, der 55 s auf 3000 W und 5 s auf 0 W steht, muss ~2750 W ergeben
 * und nicht 1500 W. Jeder Messwert gilt so lange, bis der naechste eintrifft.
 */
export class TimeWeightedWindow {
  private buf: Sample[] = [];

  constructor(private windowMs: number) {}

  /** Aendert die Fensterbreite und verwirft dabei den Puffer. */
  setWindow(windowMs: number): void {
    if (windowMs === this.windowMs) return;
    this.windowMs = windowMs;
    this.reset();
  }

  reset(): void {
    this.buf = [];
  }

  push(v: number | null, now: number): void {
    // Fenster 0 = Glaettung aus: nur den letzten Wert vorhalten.
    if (this.windowMs <= 0) {
      this.buf = [{ t: now, v }];
      return;
    }

    const last = this.buf[this.buf.length - 1];
    // Zeitspruenge rueckwaerts (Uhrumstellung, Fake-Timer) wuerden die
    // Gewichtung verfaelschen — Puffer verwerfen und neu beginnen.
    if (last && now < last.t) {
      this.buf = [{ t: now, v }];
      return;
    }

    this.buf.push({ t: now, v });

    if (this.buf.length > MAX_SAMPLES) {
      this.buf.splice(0, this.buf.length - MAX_SAMPLES);
    }
  }

  /** Zeitgewichteter Mittelwert ueber das Fenster, oder null ohne gueltige Daten. */
  value(now: number): number | null {
    if (this.buf.length === 0) return null;
    if (this.windowMs <= 0) return this.buf[this.buf.length - 1].v;

    this.prune(now);

    const from = now - this.windowMs;
    let acc = 0;
    let dur = 0;

    for (let i = 0; i < this.buf.length; i++) {
      const sample = this.buf[i];
      const start = Math.max(sample.t, from);
      // Das letzte Segment reicht bis jetzt: der Wert gilt weiter, bis ein
      // neuer eintrifft.
      const end = i + 1 < this.buf.length ? this.buf[i + 1].t : now;
      if (end <= start) continue;
      if (sample.v === null) continue; // Luecken zaehlen nicht zur Gewichtung

      acc += sample.v * (end - start);
      dur += end - start;
    }

    return dur > 0 ? acc / dur : null;
  }

  /** Anteil des Fensters, der von gueltigen Daten abgedeckt ist (0..1). */
  coverage(now: number): number {
    if (this.windowMs <= 0) return this.buf.length > 0 && this.buf[0].v !== null ? 1 : 0;
    if (this.buf.length === 0) return 0;

    this.prune(now);

    const from = now - this.windowMs;
    let dur = 0;

    for (let i = 0; i < this.buf.length; i++) {
      const sample = this.buf[i];
      if (sample.v === null) continue;
      const start = Math.max(sample.t, from);
      const end = i + 1 < this.buf.length ? this.buf[i + 1].t : now;
      if (end > start) dur += end - start;
    }

    return Math.min(1, dur / this.windowMs);
  }

  /**
   * Verwirft alles vor dem Fenster — bis auf das juengste Sample davor.
   * Dieses "Carry-in" traegt seinen Wert in das Fenster hinein: es galt ja bis
   * zum naechsten Sample weiter. Ohne diese Ausnahme haette ein seit Minuten
   * konstanter Sensor gar keinen Wert im Fenster.
   */
  private prune(now: number): void {
    const from = now - this.windowMs;
    let lastOutside = -1;
    for (let i = 0; i < this.buf.length; i++) {
      if (this.buf[i].t <= from) lastOutside = i;
      else break;
    }
    if (lastOutside > 0) this.buf.splice(0, lastOutside);
  }
}
