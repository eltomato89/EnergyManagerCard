import { defineConfig } from 'vitest/config';

export default defineConfig({
  define: {
    __CARD_VERSION__: JSON.stringify('0.0.0-test'),
  },
  test: {
    // Node-Environment: getestet wird ausschliesslich der Rechenkern in src/lib.
    // Die Lit-Komponenten brauchen ha-card/ha-switch/ha-form und sind ausserhalb
    // des HA-Frontends nicht sinnvoll instanziierbar.
    environment: 'node',
    include: ['test/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/lib/**/*.ts'],
      reporter: ['text', 'html'],
      thresholds: {
        lines: 95,
        functions: 95,
        branches: 90,
        statements: 95,
      },
    },
  },
});
