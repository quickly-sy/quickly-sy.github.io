import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

const page = (p) => fileURLToPath(new URL(p, import.meta.url));

// مشروع واحد فيه 4 واجهات (multi-page): /customer/ /vendor/ /driver/ /admin/
export default defineConfig({
  base: './', // روابط نسبية حتى يشتغل على GitHub Pages من أي مسار
  plugins: [react()],
  server: { port: 5173 },
  build: {
    rollupOptions: {
      input: {
        home: page('./index.html'),
        customer: page('./customer/index.html'),
        vendor: page('./vendor/index.html'),
        driver: page('./driver/index.html'),
        admin: page('./admin/index.html'),
      },
    },
  },
});
