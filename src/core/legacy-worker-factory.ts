import { workerAssets } from 'virtual:bom-legacy-workers';

type WorkerKind = keyof typeof workerAssets;
type WorkerSources = Partial<Record<WorkerKind, string>>;
const pending = new Map<WorkerKind, Promise<string>>();
const labels: Record<WorkerKind, string> = { parser: 'Excel 解析', excel: 'Excel 导出' };

function readSource(kind: WorkerKind) {
  return (globalThis as typeof globalThis & { __BOM_MIND_WORKER_SOURCES__?: WorkerSources })
    .__BOM_MIND_WORKER_SOURCES__?.[kind];
}

function loadSource(kind: WorkerKind): Promise<string> {
  const source = readSource(kind);
  if (source) return Promise.resolve(source);
  const existing = pending.get(kind);
  if (existing) return existing;
  const task = new Promise<string>((resolve, reject) => {
    const script = document.createElement('script');
    const timer = setTimeout(() => finish(new Error('加载超时')), 30_000);
    function finish(error?: Error) {
      clearTimeout(timer);
      script.onload = null;
      script.onerror = null;
      script.remove();
      const loaded = readSource(kind);
      if (!error && loaded) resolve(loaded);
      else reject(new Error(`${labels[kind]}组件加载失败，请保留完整离线目录后重试`));
    }
    script.async = true;
    script.src = workerAssets[kind];
    script.onload = () => finish();
    script.onerror = () => finish(new Error('脚本不可用'));
    document.head.append(script);
  }).catch((error: unknown) => {
    pending.delete(kind);
    throw error;
  });
  pending.set(kind, task);
  return task;
}

function waitForSource(task: Promise<string>, signal?: AbortSignal): Promise<string> {
  if (!signal) return task;
  signal.throwIfAborted();
  // Cancelling one caller must not cancel a shared script load used by another job.
  return new Promise((resolve, reject) => {
    const abort = () => {
      signal.removeEventListener('abort', abort);
      reject(signal.reason);
    };
    signal.addEventListener('abort', abort, { once: true });
    task.then(
      (source) => {
        signal.removeEventListener('abort', abort);
        resolve(source);
      },
      (error: unknown) => {
        signal.removeEventListener('abort', abort);
        reject(error);
      },
    );
  });
}

async function createWorker(kind: WorkerKind, signal?: AbortSignal): Promise<Worker> {
  signal?.throwIfAborted();
  const source = await waitForSource(loadSource(kind), signal);
  signal?.throwIfAborted();
  const blob = new Blob(['URL.revokeObjectURL(self.location.href);\n', source], {
    type: 'text/javascript;charset=utf-8',
  });
  const url = URL.createObjectURL(blob);
  try {
    const worker = new Worker(url, { name: `bom-${kind}` });
    const terminate = worker.terminate.bind(worker);
    // Also release the URL when cancellation terminates a Worker before it starts.
    worker.terminate = () => {
      URL.revokeObjectURL(url);
      terminate();
    };
    worker.addEventListener('error', () => URL.revokeObjectURL(url), { once: true });
    return worker;
  } catch (error) {
    URL.revokeObjectURL(url);
    throw error;
  }
}

export const createParserWorker = (signal?: AbortSignal) => createWorker('parser', signal);
export const createExportWorker = (signal?: AbortSignal) => createWorker('excel', signal);
