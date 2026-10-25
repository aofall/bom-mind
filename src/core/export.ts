import { layoutExportTree, pngDimensions, type ExportLayoutOptions } from './export-layout';
import { renderExportDiagram } from './export-svg';
import { quantityLabel } from './parser';
import type { BomNode, Project } from './types';
export function download(data: string | Blob, name: string, mime = 'text/plain;charset=utf-8') {
  const url = URL.createObjectURL(
    typeof data === 'string' ? new Blob([data], { type: mime }) : data,
  );
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
// Windows filenames cannot contain C0 control characters; the range is intentional.
// eslint-disable-next-line no-control-regex
export const safeFileName = (s: string) => s.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').slice(0, 100);
export function exportText(project: Project, rootId: string): string {
  const lines = [
    `来源：${project.source.fileName} / ${project.source.sheetName}`,
    '数量为原表值；未进行单位换算或累计用量计算。',
    '',
  ];
  function visit(id: string) {
    const n = project.nodes[id];
    lines.push(
      `${'  '.repeat(n.level)}${n.name} [${n.code}]${n.level ? ` | ${n.spec || '规格未提供'} | 原表数量：${quantityLabel(n.quantity)} | 第 ${n.sourceRow} 行` : ''}`,
    );
    n.children.forEach(visit);
  }
  visit(rootId);
  return lines.join('\n');
}

export function buildSvg(
  project: Project,
  rootId: string,
  collapsed = new Set<string>(),
  full = false,
  options?: Partial<ExportLayoutOptions>,
): { svg: string; width: number; height: number } {
  const diagram = layoutExportTree(project, rootId, collapsed, full, options);
  return { svg: renderExportDiagram(diagram), width: diagram.width, height: diagram.height };
}
export async function svgToPng(svg: string, width: number, height: number): Promise<Blob> {
  const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  try {
    const image = new Image();
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error('图片生成失败，请改为导出 SVG'));
      image.src = url;
    });
    const dimensions = pngDimensions(width, height);
    const canvas = document.createElement('canvas');
    canvas.width = dimensions.width;
    canvas.height = dimensions.height;
    try {
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('浏览器不支持 PNG 导出，请改为 SVG');
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
      return await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob(
          (result) => (result ? resolve(result) : reject(new Error('PNG 生成失败，请改为 SVG'))),
          'image/png',
        ),
      );
    } finally {
      canvas.width = 0;
      canvas.height = 0;
    }
  } finally {
    URL.revokeObjectURL(url);
  }
}
export function visibleNodeIds(project: Project, rootId: string, collapsed: Set<string>) {
  const ids: string[] = [];
  const visit = (id: string) => {
    ids.push(id);
    if (!collapsed.has(id)) {
      project.nodes[id].children.forEach(visit);
    }
  };
  visit(rootId);
  return ids;
}
export function nodeKind(node: BomNode) {
  return node.level === 0 ? '产品' : node.children.length ? '含下级材料' : '末级材料';
}
