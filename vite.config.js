import { defineConfig } from 'vite';

// Marca de la versión compilada: se muestra en el panel y se publica en
// version.json para que la página detecte si hay una más nueva.
const VERSION = new Date().toISOString();

export default defineConfig({
  // Rutas relativas para que el build funcione también en GitHub Pages (/<repo>/).
  base: './',
  define: { __VERSION__: JSON.stringify(VERSION) },
  plugins: [
    {
      name: 'version-json',
      generateBundle() {
        this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ version: VERSION }) });
      },
    },
  ],
});
