import { buildSvg, exportText, svgToPng } from './export';
import type { Project } from './types';
import { normalizeExportLayout, type ExportLayoutOptions } from './export-layout';
import { buildHierarchyTable, type TableOptions } from './hierarchy-table';
import type { TableFileRenderer } from './table-file';

export type ProductExportFormat = 'svg' | 'png' | 'text' | 'xlsx';
export const PRODUCT_EXPORT_EXTENSIONS = {
  svg: 'svg',
  png: 'png',
  text: 'txt',
  xlsx: 'xlsx',
} as const;
interface Options {
  format: ProductExportFormat;
  full?: boolean;
  collapsed?: Set<string>;
  layout?: Partial<ExportLayoutOptions>;
  table?: Partial<TableOptions>;
  signal?: AbortSignal;
  tableRenderer?: TableFileRenderer;
}
export interface ProductFile {
  data: string | Blob;
  extension: string;
  mimeType: string;
}
export async function renderProductFile(
  project: Project,
  productId: string,
  { format, full = true, collapsed = new Set(), layout, table, signal, tableRenderer }: Options,
): Promise<ProductFile> {
  const extension = PRODUCT_EXPORT_EXTENSIONS[format];
  signal?.throwIfAborted();
  if (format === 'xlsx') {
    const model = buildHierarchyTable(project, productId, collapsed, full, table);
    const { createTableFileRenderer, EXCEL_MIME } = await import('./table-file');
    const renderer = tableRenderer ?? createTableFileRenderer();
    try {
      const data = await renderer.render(model, signal);
      return { data, extension, mimeType: EXCEL_MIME };
    } finally {
      if (!tableRenderer) renderer.dispose();
    }
  }
  if (format === 'text') {
    return {
      data: exportText(project, productId),
      extension,
      mimeType: 'text/plain;charset=utf-8',
    };
  }
  const exportLayout = normalizeExportLayout(layout);
  if (typeof document !== 'undefined' && document.fonts) await document.fonts.ready;
  const output = buildSvg(project, productId, collapsed, full, exportLayout);
  if (format === 'svg') {
    return { data: output.svg, extension, mimeType: 'image/svg+xml;charset=utf-8' };
  }
  return {
    data: await svgToPng(output.svg, output.width, output.height),
    extension,
    mimeType: 'image/png',
  };
}
