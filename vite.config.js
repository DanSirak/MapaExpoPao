import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    host: true, // expone en la red local (0.0.0.0)
    proxy: {
      '/api': 'http://localhost:3001',
    },
  },
});
