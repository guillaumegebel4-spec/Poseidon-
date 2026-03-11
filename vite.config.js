import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    // Let Vite/Rollup handle chunking automatically
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/phaser')) return 'phaser';
        }
      }
    }
  },
  server: {
    host: true,
    port: 3000
  }
});
