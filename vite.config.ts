import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

// Vite's HTML entry is emitted as a module even when Rollup outputs an IIFE.
// Run after HTML generation so file:// can load the resulting classic script.
function classicHtmlEntry(): Plugin {
  return {
    name: 'bom-classic-html-entry',
    generateBundle: {
      order: 'post',
      handler(_options, bundle) {
        const html = bundle['index.html'];
        if (!html || html.type !== 'asset') {
          return this.error('Missing legacy HTML entry');
        }
        html.source = String(html.source)
          .replace(/<script\b[^>]*>/g, (tag) =>
            tag.replace(/\s+type="module"/, ' defer').replace(/\s+crossorigin(?:="[^"]*")?/, ''),
          )
          .replace(/(<link\b[^>]*?)\s+crossorigin(?:="[^"]*")?/g, '$1');
      },
    },
  };
}

export default defineConfig(({ mode }) => {
  const legacy = mode === 'legacy';
  return {
    base: './',
    plugins: [react(), ...(legacy ? [classicHtmlEntry()] : [])],
    resolve: {
      // Keep the web build's separate Worker; embed it only in the file:// build.
      alias: legacy
        ? [
            {
              find: './worker?worker',
              replacement: `${fileURLToPath(new URL('./src/worker.ts', import.meta.url))}?worker&inline`,
            },
            {
              find: '../table-export.worker?worker',
              replacement: `${fileURLToPath(new URL('./src/table-export.worker.ts', import.meta.url))}?worker&inline`,
            },
          ]
        : [],
    },
    worker: { format: legacy ? 'iife' : 'es' },
    optimizeDeps: { include: ['xlsx'] },
    build: {
      outDir: legacy ? 'dist-legacy' : 'dist',
      chunkSizeWarningLimit: 1500,
      ...(legacy
        ? {
            modulePreload: false,
            rollupOptions: {
              output: { format: 'iife', name: 'BomMind', inlineDynamicImports: true },
            },
          }
        : {}),
    },
    server: {
      port: 5173,
      strictPort: true,
      watch: { ignored: ['**/work/**', '**/outputs/**', '**/docs/screenshots/**'] },
    },
  };
});
