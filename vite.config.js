import { defineConfig } from 'vite';

// Rutas relativas para que el build funcione también en GitHub Pages (/<repo>/).
export default defineConfig({
  base: './',
});
