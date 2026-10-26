import type { HierarchyTableModel } from './hierarchy-table';

export const EXCEL_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
export interface TableFileRenderer {
  render: (model: HierarchyTableModel, signal?: AbortSignal) => Promise<Blob>;
  dispose: () => void;
}
export function createTableFileRenderer(): TableFileRenderer {
  let worker: Worker | null = null;
  let closed = false;
  let sequence = 0;
  let rejectPending: ((error: Error) => void) | null = null;
  function dispose() {
    closed = true;
    worker?.terminate();
    worker = null;
    rejectPending?.(new DOMException('已取消导出', 'AbortError'));
  }
  return {
    dispose,
    async render(model, signal) {
      signal?.throwIfAborted();
      if (closed) throw new DOMException('已取消导出', 'AbortError');
      const { default: ExportWorker } = await import('../table-export.worker?worker');
      signal?.throwIfAborted();
      if (closed) throw new DOMException('已取消导出', 'AbortError');
      if (rejectPending) throw new Error('请等待当前 Excel 生成完成');
      const target = worker ?? new ExportWorker();
      worker = target;
      const id = ++sequence;
      return new Promise<Blob>((resolve, reject) => {
        function clear() {
          signal?.removeEventListener('abort', dispose);
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
        signal?.addEventListener('abort', dispose, { once: true });
        try {
          target.postMessage({ id, model });
        } catch (error) {
          clear();
          reject(error);
        }
      });
    },
  };
}
