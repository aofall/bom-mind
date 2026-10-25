import { quantityLabel } from './parser';
import type { BomNode, Project } from './types';

export const EXPORT_FONT_FAMILY = 'Microsoft YaHei, PingFang SC, Arial, sans-serif';
export interface ExportLayoutOptions {
  textMode: 'wrap' | 'ellipsis';
  nodeWidth: number;
  fontSize: number;
  autoWidth: boolean;
  maxNodeWidth: number;
}
export const DEFAULT_EXPORT_LAYOUT: ExportLayoutOptions = {
  textMode: 'wrap',
  nodeWidth: 320,
  fontSize: 14,
  autoWidth: false,
  maxNodeWidth: 480,
};
export function normalizeExportLayout(value?: unknown): ExportLayoutOptions {
  const input = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  const bounded = (key: keyof ExportLayoutOptions, fallback: number) => {
    const number = input[key];
    return typeof number === 'number' && Number.isFinite(number)
      ? Math.max(200, Math.min(600, Math.round(number)))
      : fallback;
  };
  const nodeWidth = bounded('nodeWidth', 320);
  return {
    textMode: input.textMode === 'ellipsis' ? 'ellipsis' : 'wrap',
    nodeWidth,
    fontSize: [12, 14, 16].includes(Number(input.fontSize)) ? Number(input.fontSize) : 14,
    autoWidth: input.autoWidth === true,
    maxNodeWidth: Math.max(nodeWidth, bounded('maxNodeWidth', 480)),
  };
}

export type TextMeasurer = (text: string, size: number, weight: number) => number;
const segmenter = new Intl.Segmenter('zh-CN', { granularity: 'grapheme' });
const graphemes = (text: string) => Array.from(segmenter.segment(text), (item) => item.segment);
export function createTextMeasurer(): TextMeasurer {
  const context =
    typeof document === 'undefined' ? null : document.createElement('canvas').getContext('2d');
  const cache = new Map<string, number>();
  return (text, size, weight) => {
    const key = `${size}:${weight}:${text}`;
    const cached = cache.get(key);
    if (cached !== undefined) return cached;
    let width: number;
    if (context) {
      context.font = `${weight} ${size}px ${EXPORT_FONT_FAMILY}`;
      width = context.measureText(text).width;
    } else {
      // Deterministic fallback for Node-based validation; browser exports use font metrics.
      width = graphemes(text).reduce(
        (sum, char) => sum + size * (char.charCodeAt(0) <= 0xff ? 0.62 : 1),
        0,
      );
    }
    if (cache.size >= 2048) cache.clear();
    cache.set(key, width);
    return width;
  };
}

export function fitText(
  text: string,
  width: number,
  size: number,
  weight: number,
  mode: ExportLayoutOptions['textMode'],
  measure: TextMeasurer,
): string[] {
  if (mode === 'ellipsis') {
    const single = text.replace(/\r\n|\r|\n/g, ' ');
    if (measure(single, size, weight) <= width) return [single];
    let line = '';
    for (const char of graphemes(single)) {
      if (measure(line + char + '…', size, weight) > width) break;
      line += char;
    }
    return [line + '…'];
  }
  const lines: string[] = [];
  for (const paragraph of text.split(/\r\n|\r|\n/)) {
    let line = '';
    for (const token of paragraph.match(/\s+|[^\s]+/gu) ?? []) {
      if (measure(line + token, size, weight) <= width) {
        line += token;
        continue;
      }
      if (line) {
        lines.push(line);
        line = '';
      }
      if (measure(token, size, weight) <= width) {
        line = token;
        continue;
      }
      for (const char of graphemes(token)) {
        if (line && measure(line + char, size, weight) > width) {
          lines.push(line);
          line = '';
        }
        line += char;
      }
    }
    lines.push(line);
  }
  return lines;
}

export interface TextBlock {
  lines: string[];
  fontSize: number;
  weight: number;
  lineHeight: number;
  height: number;
}
export function makeTextBlock(
  text: string,
  width: number,
  fontSize: number,
  weight: number,
  mode: ExportLayoutOptions['textMode'],
  measure: TextMeasurer,
): TextBlock {
  const lines = fitText(text, width, fontSize, weight, mode, measure);
  const lineHeight = Math.ceil(fontSize * 1.45);
  return { lines, fontSize, weight, lineHeight, height: lines.length * lineHeight };
}
export interface CardContent {
  title: string;
  subtitle: string;
  quantity: string;
}
export interface TextCard {
  width: number;
  height: number;
  blocks: [TextBlock, TextBlock, TextBlock];
}
export function measureTextCard(
  content: CardContent,
  options: ExportLayoutOptions,
  measure: TextMeasurer,
): TextCard {
  let width = options.nodeWidth;
  if (options.autoWidth) {
    const sizes = [
      [content.title, options.fontSize, 600],
      [content.subtitle, 11, 400],
      [content.quantity, 11, 400],
    ] as const;
    const desired =
      Math.max(
        ...sizes.flatMap(([text, size, weight]) =>
          text.split(/\r\n|\r|\n/).map((line) => measure(line, size, weight)),
        ),
      ) + 34;
    width = Math.min(options.maxNodeWidth, Math.max(width, Math.ceil(desired)));
  }
  const available = width - 34;
  const blocks: TextCard['blocks'] = [
    makeTextBlock(content.title, available, options.fontSize, 600, options.textMode, measure),
    makeTextBlock(content.subtitle, available, 11, 400, options.textMode, measure),
    makeTextBlock(content.quantity, available, 11, 400, options.textMode, measure),
  ];
  return {
    width,
    height: Math.max(78, 28 + blocks.reduce((sum, block) => sum + block.height, 0) + 12),
    blocks,
  };
}
export interface PositionedCard extends TextCard {
  node: BomNode;
  x: number;
  y: number;
  children: PositionedCard[];
  subtreeHeight: number;
}
export interface PositionedText {
  block: TextBlock;
  x: number;
  y: number;
}
export interface ExportDiagram {
  width: number;
  height: number;
  cards: PositionedCard[];
  header: PositionedText[];
  footer: PositionedText;
}
export function layoutExportTree(
  project: Project,
  rootId: string,
  collapsed = new Set<string>(),
  full = false,
  value?: Partial<ExportLayoutOptions>,
  measure = createTextMeasurer(),
): ExportDiagram {
  const options = normalizeExportLayout(value);
  const cards: PositionedCard[] = [];
  const columnWidths: number[] = [];
  function measureSubtree(id: string): PositionedCard {
    const node = project.nodes[id];
    const root = node.level === 0;
    const quantity = root
      ? node.code
      : `原表数量 ${quantityLabel(node.quantity)}${!full && collapsed.has(id) && node.children.length ? ` · ${node.children.length} 项已折叠` : ''}`;
    const card: PositionedCard = {
      ...measureTextCard(
        { title: node.name, subtitle: node.spec || node.code, quantity },
        options,
        measure,
      ),
      node,
      x: 0,
      y: 0,
      children: [],
      subtreeHeight: 0,
    };
    cards.push(card);
    columnWidths[node.level] = Math.max(columnWidths[node.level] ?? 0, card.width);
    card.children = full || !collapsed.has(id) ? node.children.map(measureSubtree) : [];
    const childrenHeight =
      card.children.reduce((sum, child) => sum + child.subtreeHeight, 0) +
      Math.max(0, card.children.length - 1) * 30;
    card.subtreeHeight = Math.max(card.height, childrenHeight);
    return card;
  }
  const root = measureSubtree(rootId);
  const columnX: number[] = [];
  let right = 30;
  for (let level = 0; level < columnWidths.length; level++) {
    columnX[level] = right;
    right += (columnWidths[level] ?? options.nodeWidth) + 60;
  }
  const width = Math.max(700, right - 30);
  const header: PositionedText[] = [];
  let top = 20;
  for (const [text, size, weight] of [
    ['BOM Mind · 产品结构图', 21, 700],
    [`${project.nodes[rootId].name} · ${full ? '完整结构' : '当前展开结构'}`, 12, 400],
    [
      `数量按原表显示；未提供单位与累计口径。${project.source.demo ? '演示数据（虚构）。' : ''}`,
      11,
      400,
    ],
  ] as const) {
    const block = makeTextBlock(text, width - 64, size, weight, 'wrap', measure);
    header.push({ block, x: 30, y: top });
    top += block.height + 6;
  }
  const graphTop = top + 24;
  function place(card: PositionedCard, bandTop: number) {
    card.x = columnX[card.node.level];
    card.y = bandTop + (card.subtreeHeight - card.height) / 2;
    const childrenHeight =
      card.children.reduce((sum, child) => sum + child.subtreeHeight, 0) +
      Math.max(0, card.children.length - 1) * 30;
    let childTop = bandTop + (card.subtreeHeight - childrenHeight) / 2;
    for (const child of card.children) {
      place(child, childTop);
      childTop += child.subtreeHeight + 30;
    }
  }
  place(root, graphTop);
  const footerBlock = makeTextBlock(
    `来源：${project.source.fileName} / ${project.source.sheetName}`,
    width - 64,
    11,
    400,
    'wrap',
    measure,
  );
  const height = Math.max(350, graphTop + root.subtreeHeight + 28 + footerBlock.height + 20);
  return {
    width,
    height,
    cards,
    header,
    footer: { block: footerBlock, x: 30, y: height - footerBlock.height - 20 },
  };
}

export function pngDimensions(width: number, height: number) {
  const scale = Math.min(
    2,
    Math.sqrt(24_000_000 / (width * height)),
    16000 / width,
    16000 / height,
  );
  return {
    width: Math.max(1, Math.floor(width * scale)),
    height: Math.max(1, Math.floor(height * scale)),
    scale,
  };
}
