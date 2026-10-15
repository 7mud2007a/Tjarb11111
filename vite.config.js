import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // GitHub Pages hosts this project under /Tjarb11111/.
  base: '/Tjarb11111/',
  plugins: [react()],
});
