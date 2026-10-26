import { safeFileName } from './export';
import {
  PRODUCT_EXPORT_EXTENSIONS,
  renderProductFile,
  type ProductExportFormat,
} from './product-export';
import type { Product, Project } from './types';
import { normalizeExportLayout, type ExportLayoutOptions } from './export-layout';
import { normalizeTableOptions, type TableOptions } from './hierarchy-table';

export type BatchFormat = ProductExportFormat;
export interface BatchProgress {
  phase: 'rendering' | 'packing' | 'ready';
  done: number;
  total: number;
  success: number;
  failed: number;
  part: number;
}
export interface BatchArchive {
  blob: Blob;
  name: string;
  part: number;
  last: boolean;
}
export interface BatchSummary {
  total: number;
  success: number;
  failed: number;
  parts: number;
}

export function selectedProducts(project: Project, ids: ReadonlySet<string>): Product[] {
  return project.products.filter((product) => ids.has(product.id));
}

function csvCell(value: string | number): string {
  const text = String(value);
  // A quoted CSV string can still be interpreted as a formula by spreadsheet apps.
  const safe = typeof value === 'string' && /^[\s]*[=+\-@]/.test(text) ? `'${text}` : text;
  return `"${safe.replaceAll('"', '""')}"`;
}
export function productDirectoryCsv(products: Product[]): string {
  const rows: (string | number)[][] = [
    ['序号', '产品代码', '产品名称', '产品规格', '明细数', '最大层级', '异常数'],
  ];
  products.forEach((p, index) =>
    rows.push([index + 1, p.code, p.name, p.spec, p.count, p.maxDepth, p.issueCount]),
  );
  return '\uFEFF' + rows.map((row) => row.map(csvCell).join(',')).join('\r\n');
}
export function productExportName(product: Product, index: number, format: BatchFormat): string {
  const label = safeFileName(`${product.code}_${product.name}`).replace(/[. ]+$/g, '') || '产品';
  return `${String(index + 1).padStart(4, '0')}_${label}.${PRODUCT_EXPORT_EXTENSIONS[format]}`;
}

interface Options {
  project: Project;
  ids: ReadonlySet<string>;
  format: BatchFormat;
  signal: AbortSignal;
  onProgress: (progress: BatchProgress) => void;
  // Await the user downloading this part before allocating the next archive.
  onArchive: (archive: BatchArchive) => Promise<void>;
  maxPartBytes?: number;
  layout?: Partial<ExportLayoutOptions>;
  table?: Partial<TableOptions>;
}
const yieldTask = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
export async function exportProductBatch({
  project,
  ids,
  format,
  signal,
  onProgress,
  onArchive,
  maxPartBytes = 32 * 1024 * 1024,
  layout,
  table,
}: Options): Promise<BatchSummary> {
  const products = selectedProducts(project, ids);
  const exportLayout = normalizeExportLayout(layout);
  const tableOptions = normalizeTableOptions(table);
  if (!products.length) throw new Error('请先选择需要导出的产品');
  if (!(maxPartBytes > 0)) throw new Error('分包大小必须大于 0');
  signal.throwIfAborted();
  const { default: JSZip } = await import('jszip');
  const renderer =
    format === 'xlsx' ? (await import('./table-file')).createTableFileRenderer() : undefined;
  signal.throwIfAborted();
  const encoder = new TextEncoder();
  let zip = new JSZip();
  let bytes = 0;
  let part = 1;
  let done = 0;
  let success = 0;
  let failed = 0;
  let partProducts: Product[] = [];
  let results: string[] = [];
  const report = (phase: BatchProgress['phase']) =>
    onProgress({ phase, done, total: products.length, success, failed, part });
  async function flush(last: boolean) {
    signal.throwIfAborted();
    zip.file('产品目录.csv', productDirectoryCsv(partProducts));
    zip.file(
      '导出结果.txt',
      `来源：${project.source.fileName} / ${project.source.sheetName}\n第 ${part} 包；产品完整结构；数量按原表显示。\n\n${results.join('\n')}`,
    );
    report('packing');
    const blob = await zip.generateAsync(
      {
        type: 'blob',
        compression: format === 'png' || format === 'xlsx' ? 'STORE' : 'DEFLATE',
        compressionOptions: { level: 3 },
        streamFiles: true,
      },
      () => signal.throwIfAborted(),
    );
    signal.throwIfAborted();
    // Drop the uncompressed entries before waiting for the download.
    zip = new JSZip();
    bytes = 0;
    partProducts = [];
    results = [];
    report('ready');
    await onArchive({
      blob,
      name: `BOM产品结构-${format}-${String(part).padStart(3, '0')}.zip`,
      part,
      last,
    });
    signal.throwIfAborted();
    part++;
  }
  try {
    for (const [index, product] of products.entries()) {
      signal.throwIfAborted();
      let data: Uint8Array | undefined;
      let failure = '';
      const name = productExportName(product, index, format);
      try {
        const output = await renderProductFile(project, product.id, {
          format,
          layout: exportLayout,
          table: tableOptions,
          tableRenderer: renderer,
          signal,
        });
        data =
          typeof output.data === 'string'
            ? encoder.encode(output.data)
            : new Uint8Array(await output.data.arrayBuffer());
      } catch (error) {
        failure = error instanceof Error ? error.message : '文件生成失败';
      }
      signal.throwIfAborted();
      if (data && bytes > 0 && bytes + data.byteLength > maxPartBytes) {
        await flush(false);
      }
      partProducts.push(product);
      if (data) {
        zip.file(name, data);
        bytes += data.byteLength;
        success++;
        results.push(`成功：${name}`);
      } else {
        failed++;
        results.push(`失败：${name} — ${failure}`);
      }
      done++;
      report('rendering');
      await yieldTask();
    }
    await flush(true);
    return { total: products.length, success, failed, parts: part - 1 };
  } finally {
    renderer?.dispose();
  }
}
