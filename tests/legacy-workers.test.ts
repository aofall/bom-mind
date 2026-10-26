import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import ts from 'typescript';

// Supply only the build-time asset manifest; exercise the actual browser loader in a VM.
const compiled = ts.transpileModule(
  readFileSync(new URL('../src/core/legacy-worker-factory.ts', import.meta.url), 'utf8'),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } },
).outputText;
interface Script {
  src: string;
  onload: (() => void) | null;
  onerror: (() => void) | null;
  remove: () => void;
}
interface Factory {
  createParserWorker: (signal?: AbortSignal) => Promise<Worker>;
  createExportWorker: (signal?: AbortSignal) => Promise<Worker>;
}

function fixture() {
  const scripts: Script[] = [];
  const workers: MockWorker[] = [];
  const revoked: string[] = [];
  const sources: Partial<Record<'parser' | 'excel', string>> = {};
  const timers = new Set<ReturnType<typeof setTimeout>>();
  class MockWorker extends EventTarget {
    stopped = false;
    constructor(readonly url: string) {
      super();
      workers.push(this);
    }
    terminate() {
      this.stopped = true;
    }
  }
  const context = createContext({
    exports: {},
    require(id: string) {
      assert.equal(id, 'virtual:bom-legacy-workers');
      return { workerAssets: { parser: './parser.js', excel: './excel.js' } };
    },
    __BOM_MIND_WORKER_SOURCES__: sources,
    document: {
      createElement: () => ({ src: '', onload: null, onerror: null, remove() {} }),
      head: { append: (script: Script) => scripts.push(script) },
    },
    Worker: MockWorker,
    Blob,
    URL: {
      createObjectURL: () => `blob:worker-${workers.length}`,
      revokeObjectURL: (url: string) => revoked.push(url),
    },
    setTimeout(callback: () => void, delay: number) {
      const timer = setTimeout(callback, delay);
      timers.add(timer);
      return timer;
    },
    clearTimeout(timer: ReturnType<typeof setTimeout>) {
      timers.delete(timer);
      clearTimeout(timer);
    },
  });
  runInContext(compiled, context);
  return {
    factory: context.exports as Factory,
    scripts,
    workers,
    revoked,
    complete(kind: 'parser' | 'excel') {
      sources[kind] = 'self.onmessage = () => {};';
      scripts.at(-1)?.onload?.();
    },
    cleanup: () => timers.forEach(clearTimeout),
  };
}

test('离线组件共享加载，取消一个调用不会启动它的 Worker，也不影响其他调用', async (t) => {
  const f = fixture();
  t.after(f.cleanup);
  const cancelled = new AbortController();
  const first = f.factory.createParserWorker(cancelled.signal);
  const second = f.factory.createParserWorker();
  assert.equal(f.scripts.length, 1);
  cancelled.abort();
  await assert.rejects(first, { name: 'AbortError' });
  assert.equal(f.workers.length, 0);
  f.complete('parser');
  const worker = await second;
  assert.equal(f.workers.length, 1);
  worker.terminate();
  assert(f.workers[0].stopped);
  assert.deepEqual(f.revoked, ['blob:worker-0']);
});

test('离线组件加载失败或未注册代码时允许重试，成功后复用源代码但创建独立 Worker', async (t) => {
  const f = fixture();
  t.after(f.cleanup);
  const failed = f.factory.createExportWorker();
  f.scripts[0].onerror?.();
  await assert.rejects(failed, /Excel 导出组件加载失败/);
  const malformed = f.factory.createExportWorker();
  assert.equal(f.scripts.length, 2);
  f.scripts[1].onload?.();
  await assert.rejects(malformed, /Excel 导出组件加载失败/);
  const retry = f.factory.createExportWorker();
  assert.equal(f.scripts.length, 3);
  f.complete('excel');
  const first = await retry;
  const second = await f.factory.createExportWorker();
  assert.equal(f.scripts.length, 3);
  assert.equal(f.workers.length, 2);
  assert.notEqual(first, second);
  first.terminate();
  second.terminate();
  assert.equal(f.revoked.length, 2);
});

test('已取消的离线加载完成后不创建 Worker，之后新任务仍可正常使用', async (t) => {
  const f = fixture();
  t.after(f.cleanup);
  const job = new AbortController();
  const task = f.factory.createExportWorker(job.signal);
  job.abort();
  await assert.rejects(task, { name: 'AbortError' });
  f.complete('excel');
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(f.workers.length, 0);
  const worker = await f.factory.createExportWorker();
  assert.equal(f.scripts.length, 1);
  assert.equal(f.workers.length, 1);
  worker.terminate();
});
