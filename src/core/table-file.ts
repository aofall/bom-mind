import type { HierarchyTableModel } from './hierarchy-table';
import { createExportWorker } from '#bom-workers';

export const EXCEL_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
export interface TableFileRenderer {
  render: (model: HierarchyTableModel, signal?: AbortSignal) => Promise<Blob>;
  dispose: () => void;
}
export function createTableFileRenderer(): TableFileRenderer {
  let worker: Worker | null = null;
  let closed = false;
  let sequence = 0;
  let active = false;
  let rejectPending: ((error: Error) => void) | null = null;
  const lifetime = new AbortController();
  function dispose() {
    closed = true;
    lifetime.abort();
    worker?.terminate();
    worker = null;
    rejectPending?.(new DOMException('已取消导出', 'AbortError'));
  }
  return {
    dispose,
    async render(model, signal) {
      signal?.throwIfAborted();
      if (closed) throw new DOMException('已取消导出', 'AbortError');
      if (active) throw new Error('请等待当前 Excel 生成完成');
      active = true;
      signal?.addEventListener('abort', dispose, { once: true });
      try {
        const target = worker ?? (await createExportWorker(lifetime.signal));
        if (closed) {
          target.terminate();
          throw new DOMException('已取消导出', 'AbortError');
        }
        worker = target;
        const id = ++sequence;
        return await new Promise<Blob>((resolve, reject) => {
          function clear() {
            target.onmessage = null;
            target.onerror = null;
            rejectPending = null;
          }
          rejectPending = (error) => {
            clear();
            reject(error);
          };
          target.onmessage = (
            event: MessageEvent<{ id: number; buffer?: ArrayBuffer; error?: string }>,
          ) => {
            if (event.data.id !== id) return;
            clear();
            if (event.data.error || !event.data.buffer) {
              reject(new Error(event.data.error || 'Excel 生成失败'));
            } else resolve(new Blob([event.data.buffer], { type: EXCEL_MIME }));
          };
          target.onerror = (event) => {
            clear();
            target.terminate();
            worker = null;
            reject(new Error(event.message || 'Excel 导出线程启动失败'));
          };
          try {
            target.postMessage({ id, model });
          } catch (error) {
            clear();
            reject(error);
          }
        });
      } finally {
        active = false;
        signal?.removeEventListener('abort', dispose);
      }
    },
  };
}
