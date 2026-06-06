import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        admin: resolve(__dirname, 'admin.html'),
        pdv: resolve(__dirname, 'pdv.html'),
        programacao: resolve(__dirname, 'programacao.html'),
        autoatendimento: resolve(__dirname, 'autoatendimento.html'),
      },
    },
  },
  server: {
    port: 3000,
    host: '0.0.0.0'
  },
});
