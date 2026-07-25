import { defineConfig } from 'vite';
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as {
  version: string;
};

export default defineConfig({
  define: {
    __CARD_VERSION__: JSON.stringify(pkg.version),
  },
  build: {
    // HA-Frontend-Baseline. Alles Neuere riskiert Syntaxfehler in älteren Companion-Webviews.
    target: 'es2021',
    // Vite 8 bundelt mit Rolldown; der eingebaute Minifier ist oxc, nicht esbuild.
    minify: true,
    sourcemap: false,
    emptyOutDir: true,
    lib: {
      entry: 'src/index.ts',
      formats: ['es'],
      fileName: () => 'energy-manager-card.js',
    },
    rollupOptions: {
      // Bewusst NICHTS externalisieren: HA lädt die Karte als isoliertes ES-Modul
      // ohne Import-Map, Lit muss also mit ins Bundle.
      // `codeSplitting: false` erzwingt genau eine Ausgabedatei — in Vite 8 der
      // Nachfolger des dort abgekündigten `inlineDynamicImports`.
      output: {
        codeSplitting: false,
      },
    },
  },
  preview: {
    port: 4000,
    host: '0.0.0.0',
    // Pflicht, damit HA die Datei im Dev-Loop als Resource laden darf.
    cors: true,
  },
});
