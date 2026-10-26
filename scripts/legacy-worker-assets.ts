import { fileURLToPath } from 'node:url';
import { build, type Plugin, type ResolvedConfig } from 'vite';

const MODULE_ID = 'virtual:bom-legacy-workers';
const RESOLVED_ID = `\0${MODULE_ID}`;
const REGISTRY = '__BOM_MIND_WORKER_SOURCES__';
const entries = {
  parser: fileURLToPath(new URL('../src/worker.ts', import.meta.url)),
  excel: fileURLToPath(new URL('../src/table-export.worker.ts', import.meta.url)),
};

// Separate classic scripts carry Worker source, without executing it on the page.
// This plugin is installed only for the file:// build.
export function legacyWorkerAssets(): Plugin {
  let config: ResolvedConfig;
  return {
    name: 'bom-legacy-worker-assets',
    apply: 'build',
    configResolved(resolved) {
      config = resolved;
    },
    resolveId(id) {
      if (id === MODULE_ID) return RESOLVED_ID;
    },
    async load(id) {
      if (id !== RESOLVED_ID) return;
      const assets: string[] = [];
      for (const [kind, entry] of Object.entries(entries)) {
        const result = await build({
          configFile: false,
          root: config.root,
          logLevel: 'silent',
          build: {
            write: false,
            target: config.build.target,
            minify: 'esbuild',
            sourcemap: false,
            lib: { entry, name: 'BomWorker', formats: ['iife'] },
            rollupOptions: { output: { inlineDynamicImports: true } },
          },
        });
        const output = Array.isArray(result) ? result[0] : result;
        if (!('output' in output)) return this.error('Unexpected legacy Worker build result');
        const chunks = output.output.filter((item) => item.type === 'chunk');
        if (chunks.length !== 1 || output.output.length !== 1) {
          return this.error(`Legacy ${kind} Worker must produce one self-contained script`);
        }
        for (const moduleId of Object.keys(chunks[0].modules)) this.addWatchFile(moduleId);
        const source = [
          `globalThis.${REGISTRY} = globalThis.${REGISTRY} || {};`,
          `globalThis.${REGISTRY}[${JSON.stringify(kind)}] = ${JSON.stringify(chunks[0].code)};`,
        ].join('\n');
        // These .js files are Rollup assets, so enforce the chunk budget explicitly.
        const sizeKb = Buffer.byteLength(source) / 1000;
        if (sizeKb > config.build.chunkSizeWarningLimit) {
          this.warn(`Legacy ${kind} Worker script is ${sizeKb.toFixed(2)} kB after minification`);
        }
        const reference = this.emitFile({
          type: 'asset',
          name: `${kind}-worker.js`,
          source,
        });
        assets.push(`${kind}: import.meta.ROLLUP_FILE_URL_${reference}`);
      }
      return `export const workerAssets = { ${assets.join(', ')} };`;
    },
  };
}
