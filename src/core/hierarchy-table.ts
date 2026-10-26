import { createTextMeasurer, fitText, type TextMeasurer } from './export-layout';
import { quantityLabel } from './parser';
import type { BomNode, Issue, Product, Project, Source } from './types';

export const TABLE_FIELDS = ['name', 'code', 'spec', 'quantity', 'sourceRow'] as const;
export type TableField = (typeof TABLE_FIELDS)[number];
export const TABLE_FIELD_LABELS: Record<TableField, string> = {
  name: '名称',
  code: '编码',
  spec: '规格',
  quantity: '原表数量',
  sourceRow: '来源行号',
};
export interface TableOptions {
  fields: TableField[];
  columnWidth: number;
  fontSize: number;
}
export function normalizeTableOptions(value?: unknown): TableOptions {
  const input = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  const fields = Array.isArray(input.fields) ? input.fields : ['name', 'code'];
  return {
    fields: TABLE_FIELDS.filter((field) => field === 'name' || fields.includes(field)),
    columnWidth:
      typeof input.columnWidth === 'number' && Number.isFinite(input.columnWidth)
        ? Math.max(180, Math.min(600, Math.round(input.columnWidth)))
        : 280,
    fontSize: [12, 14, 16].includes(Number(input.fontSize)) ? Number(input.fontSize) : 14,
  };
}
export interface TableLine {
  field: TableField | 'folded';
  text: string;
  size: number;
}
export interface TableCell {
  kind: 'node';
  node: BomNode;
  column: number;
  row: number;
  rowSpan: number;
  folded: boolean;
  lines: TableLine[];
}
export interface EmptyTableCell {
  kind: 'empty';
  column: number;
  row: number;
  folded: boolean;
}
export interface HierarchyTableModel {
  product: Product;
  source: Source;
  issues: Issue[];
  options: TableOptions;
  full: boolean;
  columns: number;
  cells: TableCell[];
  rows: (TableCell | EmptyTableCell)[][];
  rowHeights: number[];
  branchCount: number;
}
function nodeLines(
  node: BomNode,
  options: TableOptions,
  folded: boolean,
  measure: TextMeasurer,
): TableLine[] {
  const texts: Record<TableField, string> = {
    name: node.name,
    code: node.code,
    spec: node.spec || '规格未提供',
    quantity: `原表数量：${quantityLabel(node.quantity)}`,
    sourceRow: `原表第 ${node.sourceRow} 行`,
  };
  const content: { field: TableLine['field']; text: string }[] = options.fields.map((field) => ({
    field,
    text: texts[field],
  }));
  if (folded) content.push({ field: 'folded', text: `${node.children.length} 项直接下级已折叠` });
  return content.flatMap(({ field, text }) => {
    const size = field === 'name' ? options.fontSize : options.fontSize - 1;
    return fitText(
      text,
      options.columnWidth - 36,
      size,
      field === 'name' ? 600 : 400,
      'wrap',
      measure,
    ).map((line) => ({ field, text: line, size }));
  });
}
export function buildHierarchyTable(
  project: Project,
  productId: string,
  collapsed: ReadonlySet<string> = new Set(),
  full = true,
  value?: Partial<TableOptions>,
  measure = createTextMeasurer(),
): HierarchyTableModel {
  const product = project.products.find((item) => item.id === productId);
  if (!product || !project.nodes[productId]) throw new Error('找不到需要展示的产品');
  const options = normalizeTableOptions(value);
  const cells: TableCell[] = [];
  const terminals: TableCell[] = [];
  function place(id: string, row: number): number {
    const node = project.nodes[id];
    const folded = !full && collapsed.has(id) && node.children.length > 0;
    const cell: TableCell = {
      kind: 'node',
      node,
      column: node.level - 1,
      row,
      rowSpan: 1,
      folded,
      lines: nodeLines(node, options, folded, measure),
    };
    cells.push(cell);
    const children = folded ? [] : node.children;
    if (!children.length) {
      terminals.push(cell);
      return 1;
    }
    let span = 0;
    for (const child of children) span += place(child, row + span);
    cell.rowSpan = span;
    return span;
  }
  let branchCount = 0;
  const rootFolded = !full && collapsed.has(productId);
  if (!rootFolded) {
    for (const id of project.nodes[productId].children) branchCount += place(id, branchCount);
  }
  const heights = Array<number>(branchCount).fill(64);
  // Grow rows until every vertically merged cell has enough room for its full text.
  for (const cell of [...cells].sort((a, b) => a.rowSpan - b.rowSpan)) {
    const required =
      24 +
      (!full && cell.node.children.length ? 24 : 0) +
      cell.lines.reduce((height, line) => height + Math.ceil(line.size * 1.6), 0);
    const available = heights
      .slice(cell.row, cell.row + cell.rowSpan)
      .reduce((sum, height) => sum + height, 0);
    if (required > available) {
      const extra = (required - available) / cell.rowSpan;
      for (let row = cell.row; row < cell.row + cell.rowSpan; row++) heights[row] += extra;
    }
  }
  // Split very tall physical rows, preserving a single merged node cell and all text.
  const rowHeights: number[] = [];
  const offsets = [0];
  heights.forEach((height) => {
    const count = Math.ceil(height / 480);
    for (let i = 0; i < count; i++) rowHeights.push(height / count);
    offsets.push(rowHeights.length);
  });
  const terminalByRow: TableCell[] = [];
  terminals.forEach((cell) => {
    for (let row = offsets[cell.row]; row < offsets[cell.row + 1]; row++) terminalByRow[row] = cell;
  });
  cells.forEach((cell) => {
    const start = offsets[cell.row];
    cell.rowSpan = offsets[cell.row + cell.rowSpan] - start;
    cell.row = start;
  });
  const columns = Math.max(1, product.maxDepth);
  const coverage = rowHeights.map(() => Array<TableCell | undefined>(columns).fill(undefined));
  for (const cell of cells) {
    for (let row = cell.row; row < cell.row + cell.rowSpan; row++) {
      coverage[row][cell.column] = cell;
    }
  }
  const rows = coverage.map((row, index) =>
    row.flatMap((cell, column): (TableCell | EmptyTableCell)[] => {
      if (cell) return cell.row === index ? [cell] : [];
      return [
        { kind: 'empty', column, row: index, folded: terminalByRow[index]?.folded ?? rootFolded },
      ];
    }),
  );
  return {
    product,
    source: project.source,
    issues: project.issues.filter((issue) => issue.productId === productId),
    options,
    full,
    columns,
    cells,
    rows,
    rowHeights,
    branchCount,
  };
}
