import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({
  plugins: [react()],
  worker: { format: 'es' },
  optimizeDeps: { include: ['xlsx'] },
  build: { chunkSizeWarningLimit: 1500 },
  server: {
    port: 5173,
    strictPort: true,
    watch: { ignored: ['**/work/**', '**/outputs/**', '**/docs/screenshots/**'] },
  },
});
