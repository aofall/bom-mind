import {
  EXPORT_FONT_FAMILY,
  createTextMeasurer,
  measureTextCard,
  normalizeExportLayout,
  type ExportDiagram,
  type ExportLayoutOptions,
  type TextBlock,
  type TextCard,
} from './export-layout';

const escapeXml = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[char]!,
  );
function textSvg(block: TextBlock, x: number, y: number, color: string, role: string) {
  const lines = block.lines
    .map(
      (line, index) =>
        `<tspan x="${x}" y="${y + block.fontSize + index * block.lineHeight}">${escapeXml(line)}</tspan>`,
    )
    .join('');
  return `<text data-field="${role}" xml:space="preserve" fill="${color}" font-size="${block.fontSize}" font-weight="${block.weight}">${lines}</text>`;
}
function cardSvg(card: TextCard, x: number, y: number, root: boolean, missingQuantity: boolean) {
  const fill = root ? '#153d34' : '#ffffff';
  const border = root ? '#153d34' : '#d4dfd9';
  const colors = [
    root ? '#ffffff' : '#243b33',
    root ? '#d2e6dc' : '#7a887f',
    missingQuantity ? '#a66b22' : root ? '#d2e6dc' : '#486d5a',
  ];
  let textTop = y + 14;
  const blocks = card.blocks
    .map((block, index) => {
      const text = textSvg(
        block,
        x + 15,
        textTop,
        colors[index],
        ['name', 'subtitle', 'quantity'][index],
      );
      textTop += block.height + 6;
      return text;
    })
    .join('');
  return `<rect x="${x}" y="${y}" width="${card.width}" height="${card.height}" rx="10" fill="${fill}" stroke="${border}"/>${blocks}`;
}
export function renderExportDiagram(diagram: ExportDiagram): string {
  const { width, height, cards, header, footer } = diagram;
  const byId = new Map(cards.map((card) => [card.node.id, card]));
  const edges = cards
    .filter((card) => card.node.parentId && byId.has(card.node.parentId))
    .map((card) => {
      const parent = byId.get(card.node.parentId!)!;
      const startX = parent.x + parent.width;
      const startY = parent.y + parent.height / 2;
      const endY = card.y + card.height / 2;
      const midX = (startX + card.x) / 2;
      return `<path d="M${startX},${startY} C${midX},${startY} ${midX},${endY} ${card.x},${endY}" fill="none" stroke="#bdcfc6" stroke-width="1.6"/>`;
    })
    .join('');
  const nodes = cards
    .map(
      (card) =>
        `<g data-node-id="${escapeXml(card.node.id)}"><title>${escapeXml(`${card.node.name} / ${card.node.code} / ${card.node.spec}`)}</title>${cardSvg(card, card.x, card.y, card.node.level === 0, card.node.quantity == null && card.node.level > 0)}</g>`,
    )
    .join('');
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    '<rect width="100%" height="100%" fill="#f7f9f6"/>',
    `<g font-family="${EXPORT_FONT_FAMILY}">`,
    ...header.map((item, index) =>
      textSvg(item.block, item.x, item.y, index ? '#77867b' : '#153d34', 'header'),
    ),
    edges,
    nodes,
    textSvg(footer.block, footer.x, footer.y, '#77867b', 'source'),
    '</g></svg>',
  ].join('');
}
export function renderLayoutPreview(value: ExportLayoutOptions, title: string): string {
  const card = measureTextCard(
    { title, subtitle: '规格 / 材料代码', quantity: '原表数量 1' },
    normalizeExportLayout(value),
    createTextMeasurer(),
  );
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${card.width + 2}" height="${card.height + 2}" viewBox="0 0 ${card.width + 2} ${card.height + 2}"><g font-family="${EXPORT_FONT_FAMILY}">${cardSvg(card, 1, 1, false, false)}</g></svg>`;
}
