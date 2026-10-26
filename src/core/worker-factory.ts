import ParserWorker from '../worker?worker';

// The Web build keeps Vite's normal module Workers and lazy Excel dependency.
export async function createParserWorker(signal?: AbortSignal): Promise<Worker> {
  signal?.throwIfAborted();
  return new ParserWorker();
}

export async function createExportWorker(signal?: AbortSignal): Promise<Worker> {
  signal?.throwIfAborted();
  const { default: ExportWorker } = await import('../table-export.worker?worker');
  signal?.throwIfAborted();
  return new ExportWorker();
}
