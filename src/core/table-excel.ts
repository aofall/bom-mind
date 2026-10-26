import ExcelJS from 'exceljs';
import type { Cell } from './types';
import type { HierarchyTableModel } from './hierarchy-table';
import { fitText } from './export-layout';

const FONT = 'Microsoft YaHei';
const border: Partial<ExcelJS.Borders> = Object.fromEntries(
  ['top', 'bottom', 'left', 'right'].map((side) => [
    side,
    { style: 'thin', color: { argb: 'FFD7E1DA' } },
  ]),
);
function checkedText(value: Cell): Cell {
  if (typeof value === 'string' && value.length > 32767) {
    throw new Error('单元格文字超过 Excel 长度限制，请拆分原表中的超长文字后重试');
  }
  return value;
}
function setValue(cell: ExcelJS.Cell, value: Cell) {
  // Strings remain literal text, including codes with leading zeroes or formula prefixes.
  cell.value = checkedText(value);
  cell.alignment = { vertical: 'middle', wrapText: true };
  cell.font = { name: FONT, size: 10 };
  cell.border = border;
}
function titleRow(
  sheet: ExcelJS.Worksheet,
  row: number,
  columns: number,
  text: string,
  width: number,
  title = false,
) {
  const size = title ? 18 : 14;
  const lines = fitText(
    text,
    columns * width - 32,
    size,
    title ? 600 : 400,
    'wrap',
    (part, fontSize) => Array.from(part).length * fontSize,
  );
  const required = (lines.length * Math.ceil(size * 1.6) + 20) * 0.75;
  const count = Math.max(1, Math.ceil(required / 360));
  if (columns > 1 || count > 1) sheet.mergeCells(row, 1, row + count - 1, columns);
  const cell = sheet.getCell(row, 1);
  setValue(cell, lines.join('\n'));
  cell.font = {
    name: FONT,
    size: size * 0.75,
    bold: title,
    color: { argb: title ? 'FF153D34' : 'FF61745E' },
  };
  for (let offset = 0; offset < count; offset++) {
    sheet.getRow(row + offset).height = required / count;
  }
  return row + count;
}
function flatSheet(workbook: ExcelJS.Workbook, name: string, headers: string[], records: Cell[][]) {
  const sheet = workbook.addWorksheet(name);
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
  [headers, ...records].forEach((values, index) => {
    values.forEach((value, column) => setValue(sheet.getCell(index + 1, column + 1), value));
    if (!index) sheet.getRow(index + 1).height = 26;
  });
  headers.forEach((header, index) => {
    sheet.getColumn(index + 1).width = /名称|规格|问题|信息/.test(header) ? 42 : 24;
    const cell = sheet.getCell(1, index + 1);
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF153D34' } };
    cell.font = { name: FONT, size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
  });
  sheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: Math.max(1, records.length + 1), column: headers.length },
  };
  return sheet;
}
export async function buildTableWorkbook(model: HierarchyTableModel): Promise<ArrayBuffer> {
  if (model.columns > 16384 || model.rows.length + 5 > 1048576) {
    throw new Error('表格超过 Excel 行列上限，请缩小导出范围');
  }
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'BOM Mind';
  const sheet = workbook.addWorksheet('层级组合表');
  for (let column = 1; column <= model.columns; column++) {
    sheet.getColumn(column).width = (model.options.columnWidth - 5) / 7 + 2;
  }
  let headerRow = 1;
  const titles = [
    `${model.product.name} [${model.product.code}]`,
    `产品规格：${model.product.spec || '未提供'}；来源：${model.source.fileName} / ${model.source.sheetName}`,
    `${model.full ? '完整产品结构' : '当前展开结构'}；${model.branchCount} 个末端分支；${model.cells.length} 个材料节点。`,
    '数量按原表显示，不累计、不换算。— 表示无更深层材料，… 表示下级已折叠。节点明细与当前导出范围一致。',
  ];
  titles.forEach((text, index) => {
    headerRow = titleRow(
      sheet,
      headerRow,
      model.columns,
      text,
      model.options.columnWidth,
      index === 0,
    );
  });
  if (headerRow + model.rows.length > 1048576) {
    throw new Error('表格超过 Excel 行数上限，请缩小导出范围');
  }
  sheet.views = [{ state: 'frozen', ySplit: headerRow }];
  for (let column = 1; column <= model.columns; column++) {
    const cell = sheet.getCell(headerRow, column);
    setValue(cell, `${column} 级材料`);
    cell.font = { name: FONT, size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF315D43' } };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
  }
  sheet.getRow(headerRow).height = 28;
  model.rows.forEach((row, index) => {
    const rowNumber = index + headerRow + 1;
    sheet.getRow(rowNumber).height = model.rowHeights[index] * 0.75;
    row.forEach((item) => {
      const cell = sheet.getCell(rowNumber, item.column + 1);
      if (item.kind === 'empty') {
        setValue(cell, item.folded ? '…' : '—');
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
        return;
      }
      if (item.rowSpan > 1) {
        sheet.mergeCells(rowNumber, item.column + 1, rowNumber + item.rowSpan - 1, item.column + 1);
      }
      checkedText(item.lines.map((line) => line.text).join('\n'));
      cell.value = {
        richText: item.lines.map((line, lineIndex) => ({
          text: line.text + (lineIndex < item.lines.length - 1 ? '\n' : ''),
          font: { name: FONT, size: line.size * 0.75, bold: line.field === 'name' },
        })),
      };
      cell.alignment = { wrapText: true, vertical: 'top', indent: 1 };
      cell.border = border;
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: item.node.children.length ? 'FFF0F5EB' : 'FFFFFFFF' },
      };
    });
  });
  if (!model.rows.length) {
    titleRow(
      sheet,
      headerRow + 1,
      model.columns,
      model.full
        ? '当前产品没有可展示的有效材料节点，请查看异常记录。'
        : '产品根节点已折叠，请展开后查看下级。',
      model.options.columnWidth,
    );
  }
  flatSheet(
    workbook,
    '节点明细',
    ['节点 ID', '父节点 ID', '层级', '材料代码', '材料名称', '材料规格', '原表数量', '来源行号'],
    model.cells.map(({ node }) => [
      node.id,
      node.parentId,
      node.level,
      node.code,
      node.name,
      node.spec,
      node.quantity,
      node.sourceRow,
    ]),
  );
  if (model.issues.length) {
    flatSheet(
      workbook,
      '异常记录',
      ['来源行号', '严重程度', '问题类型', '问题信息', '节点 ID'],
      model.issues.map((issue) => [
        issue.row,
        issue.severity,
        issue.kind,
        issue.message,
        issue.nodeId ?? '',
      ]),
    );
  }
  const buffer = await workbook.xlsx.writeBuffer();
  return new Uint8Array(buffer).buffer;
}
