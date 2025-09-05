import { defineConfig } from 'vite';

export default defineConfig({
  root: '.',
  server: {
    host: true
  },
  build: {
    outDir: 'dist'
  }
});
