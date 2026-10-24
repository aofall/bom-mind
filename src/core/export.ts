import { quantityLabel } from './parser';
import type { BomNode, Project } from './types';
export function download(data: string | Blob, name: string, mime = 'text/plain;charset=utf-8') {
  const url = URL.createObjectURL(typeof data === 'string' ? new Blob([data], { type: mime }) : data);
  const a = document.createElement('a'); a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
export const safeFileName = (s: string) => s.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').slice(0, 100);
export function exportText(project: Project, rootId: string): string {
  const lines = [`来源：${project.source.fileName} / ${project.source.sheetName}`, '数量为原表值；未进行单位换算或累计用量计算。', ''];
  function visit(id: string) { const n = project.nodes[id]; lines.push(`${'  '.repeat(n.level)}${n.name} [${n.code}]${n.level ? ` | ${n.spec || '规格未提供'} | 原表数量：${quantityLabel(n.quantity)} | 第 ${n.sourceRow} 行` : ''}`); n.children.forEach(visit); }
  visit(rootId); return lines.join('\n');
}
const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]!);
function short(s: string, width = 24) {
  let used = 0, out = '';
  for (const c of s) { used += /[\u0000-\u00ff]/.test(c) ? 0.58 : 1; if (used > width) return out + '…'; out += c; }
  return out;
}
export function buildSvg(project: Project, rootId: string, collapsed = new Set<string>(), full = false): { svg: string; width: number; height: number } {
  const positions = new Map<string, { x: number; y: number }>(); const ids: string[] = []; let leaf = 0, maxLevel = 0;
  function place(id: string): number {
    const node = project.nodes[id]; ids.push(id); maxLevel = Math.max(maxLevel, node.level);
    const children = full || !collapsed.has(id) ? node.children : [];
    const ys = children.map(place); const y = ys.length ? (ys[0] + ys.at(-1)!) / 2 : 160 + leaf++ * 108;
    positions.set(id, { x: 30 + node.level * 290, y }); return y;
  }
  place(rootId); const width = Math.max(700, (maxLevel + 1) * 290 + 40), height = Math.max(350, 230 + leaf * 108);
  const edges = ids.filter(id => id !== rootId).map(id => {
    const n = project.nodes[id], p = positions.get(n.parentId!)!, c = positions.get(id)!;
    return `<path d="M${p.x + 238},${p.y} C${p.x + 264},${p.y} ${c.x - 26},${c.y} ${c.x},${c.y}" fill="none" stroke="#bdcfc6" stroke-width="1.6"/>`;
  }).join('');
  const cards = ids.map(id => {
    const n = project.nodes[id], p = positions.get(id)!, root = n.level === 0, color = root ? '#ffffff' : '#243b33';
    const subtitle = n.spec || n.code;
    const qty = root ? n.code : `原表数量 ${quantityLabel(n.quantity)}${!full && collapsed.has(id) && n.children.length ? ` · ${n.children.length} 项已折叠` : ''}`;
    return `<g><title>${esc(`${n.name} / ${n.code} / ${n.spec}`)}</title><rect x="${p.x}" y="${p.y - 39}" width="238" height="78" rx="10" fill="${root ? '#153d34' : '#ffffff'}" stroke="${root ? '#153d34' : '#d4dfd9'}"/><text x="${p.x + 15}" y="${p.y - 13}" fill="${color}" font-size="14" font-weight="600">${esc(short(n.name, 16))}</text><text x="${p.x + 15}" y="${p.y + 7}" fill="${root ? '#d2e6dc' : '#7a887f'}" font-size="11">${esc(short(subtitle, 25))}</text><text x="${p.x + 15}" y="${p.y + 25}" fill="${n.quantity == null && !root ? '#a66b22' : root ? '#d2e6dc' : '#486d5a'}" font-size="11">${esc(short(qty, 28))}</text></g>`;
  }).join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="100%" height="100%" fill="#f7f9f6"/><g font-family="Microsoft YaHei, PingFang SC, Arial, sans-serif"><text x="30" y="38" fill="#153d34" font-size="21" font-weight="700">BOM Mind · 产品结构图</text><text x="30" y="63" fill="#77867b" font-size="12">${esc(project.nodes[rootId].name)} · ${full ? '完整结构' : '当前展开结构'}</text><text x="30" y="85" fill="#77867b" font-size="11">数量按原表显示；未提供单位与累计口径。${project.source.demo ? '演示数据（虚构）。' : ''}</text>${edges}${cards}<text x="30" y="${height - 28}" fill="#77867b" font-size="11">来源：${esc(short(project.source.fileName, 80))} / ${esc(project.source.sheetName)}</text></g></svg>`;
  return { svg, width, height };
}
export async function svgToPng(svg: string, width: number, height: number): Promise<Blob> {
  const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }); const url = URL.createObjectURL(blob);
  try {
    const image = new Image();
    await new Promise<void>((resolve, reject) => { image.onload = () => resolve(); image.onerror = () => reject(new Error('图片生成失败，请改为导出 SVG')); image.src = url; });
    const scale = Math.min(2, Math.sqrt(24_000_000 / (width * height)), 16000 / width, 16000 / height);
    const canvas = document.createElement('canvas'); canvas.width = Math.ceil(width * scale); canvas.height = Math.ceil(height * scale);
    const ctx = canvas.getContext('2d'); if (!ctx) throw new Error('浏览器不支持 PNG 导出，请改为 SVG');
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    return await new Promise((resolve, reject) => canvas.toBlob(result => result ? resolve(result) : reject(new Error('PNG 生成失败，请改为 SVG')), 'image/png'));
  } finally { URL.revokeObjectURL(url); }
}
export function visibleNodeIds(project: Project, rootId: string, collapsed: Set<string>) {
  const ids: string[] = []; const visit = (id: string) => { ids.push(id); if (!collapsed.has(id)) project.nodes[id].children.forEach(visit); }; visit(rootId); return ids;
}
export function nodeKind(node: BomNode) { return node.level === 0 ? '产品' : node.children.length ? '含下级材料' : '末级材料'; }
