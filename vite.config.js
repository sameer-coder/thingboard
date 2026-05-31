import { defineConfig } from 'vite';

export default defineConfig({
  // Minimal config for thingboard
  // Assets in public/ are served at root, e.g. /torus.min.js
  server: {
    open: false,
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
