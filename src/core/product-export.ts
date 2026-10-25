import { buildSvg, exportText, svgToPng } from './export';
import type { Project } from './types';
import { normalizeExportLayout, type ExportLayoutOptions } from './export-layout';

export type ProductExportFormat = 'svg' | 'png' | 'text';
export const PRODUCT_EXPORT_EXTENSIONS = { svg: 'svg', png: 'png', text: 'txt' } as const;
interface Options {
  format: ProductExportFormat;
  full?: boolean;
  collapsed?: Set<string>;
  layout?: Partial<ExportLayoutOptions>;
}
export interface ProductFile {
  data: string | Blob;
  extension: string;
  mimeType: string;
}
export async function renderProductFile(
  project: Project,
  productId: string,
  { format, full = true, collapsed = new Set(), layout }: Options,
): Promise<ProductFile> {
  const extension = PRODUCT_EXPORT_EXTENSIONS[format];
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
