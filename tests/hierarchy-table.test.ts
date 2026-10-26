import test from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import { buildHierarchyTable, normalizeTableOptions } from '../src/core/hierarchy-table';
import { buildTableWorkbook } from '../src/core/table-excel';
import { parseRecords } from '../src/core/parser';
import type { InputRecord } from '../src/core/types';

function fixture() {
  const records: InputRecord[] = [1, 2, 3, 3, 2, 1, 2].map((level, index) => ({
    sourceRow: index + 2,
    values: {
      productCode: '00001',
      productName: '组合表验收',
      productSpec: '测试规格',
      level,
      quantity: index === 0 ? 0 : index === 1 ? null : '1.20',
      materialCode: index === 1 || index === 6 ? '00002' : `C-${index}`,
      materialName: index === 2 ? 'SKU码 贴标 床架TA00DB4003-14E' : `材料 ${index}`,
      materialSpec: '规格 ABC-123',
    },
  }));
  return parseRecords(records, {
    id: 'table-test',
    fileName: '测试.xls',
    sheetName: 'BOM',
    importedAt: '2026-10-26T00:00:00Z',
  });
}
test('组合表按末端分支合并，跨分支同码节点保持独立，浅层分支补齐空列', () => {
  const project = fixture();
  const root = project.products[0].id;
  const before = JSON.stringify(project);
  const model = buildHierarchyTable(project, root);
  assert.equal(model.branchCount, 4);
  assert.equal(model.columns, 3);
  assert.equal(model.cells.length, 7);
  assert.equal(model.cells[0].rowSpan, 3);
  assert.equal(model.cells[1].rowSpan, 2);
  assert.equal(model.cells[5].row, 3);
  const repeated = model.cells.filter((cell) => cell.node.code === '00002');
  assert.equal(repeated.length, 2);
  assert.notEqual(repeated[0].node.id, repeated[1].node.id);
  assert(model.rows.some((row) => row.some((cell) => cell.kind === 'empty' && !cell.folded)));
  const coverage = model.rows.map(() => Array(model.columns).fill(0));
  for (const row of model.rows) {
    for (const cell of row) {
      const span = cell.kind === 'node' ? cell.rowSpan : 1;
      for (let r = cell.row; r < cell.row + span; r++) coverage[r][cell.column]++;
    }
  }
  assert(
    coverage.every((row) => row.every((count) => count === 1)),
    'every position has exactly one cell',
  );
  assert.equal(JSON.stringify(project), before);
});
test('当前展开范围标注折叠，完整范围不受折叠影响，根节点折叠为空表', () => {
  const project = fixture();
  const root = project.products[0].id;
  const branch = project.nodes[root].children[0];
  const closed = new Set([branch]);
  const partial = buildHierarchyTable(project, root, closed, false);
  assert.equal(partial.cells.length, 3);
  assert(partial.cells.find((cell) => cell.node.id === branch)?.folded);
  assert(partial.rows[0].some((cell) => cell.kind === 'empty' && cell.folded));
  assert.equal(buildHierarchyTable(project, root, closed, true).cells.length, 7);
  assert.equal(buildHierarchyTable(project, root, new Set([root]), false).rows.length, 0);
});
test('超长文字保留完整字形，拆分过高物理行且不拆分节点实例', () => {
  const project = fixture();
  const root = project.products[0].id;
  const node = project.nodes['table-test:r:4'];
  node.name = '超长SKU 👨‍👩‍👧‍👦 é '.repeat(200);
  const model = buildHierarchyTable(project, root, new Set(), true, {
    columnWidth: 180,
    fields: ['name', 'code', 'quantity'],
  });
  const cell = model.cells.find((cell) => cell.node.id === node.id)!;
  assert.equal(
    cell.lines
      .filter((line) => line.field === 'name')
      .map((line) => line.text)
      .join(''),
    node.name,
  );
  assert(cell.rowSpan > 1);
  assert(model.rowHeights.every((height) => height > 0 && height <= 480));
  assert.equal(model.cells.filter((item) => item.node.id === node.id).length, 1);
});
test('表格选项校验去重并保留名称，列宽和字号限制有效', () => {
  assert.deepEqual(
    normalizeTableOptions({
      fields: ['quantity', 'quantity', 'invalid'],
      columnWidth: Infinity,
      fontSize: 99,
    }),
    { fields: ['name', 'quantity'], columnWidth: 280, fontSize: 14 },
  );
  assert.equal(normalizeTableOptions({ columnWidth: 10 }).columnWidth, 180);
  assert.equal(normalizeTableOptions({ columnWidth: 1000 }).columnWidth, 600);
});
test('Excel 合并范围与布局一致，保留样式、空数量、零和文本编码', async () => {
  const project = fixture();
  const root = project.products[0].id;
  project.nodes['table-test:r:6'].code = '=HYPERLINK("x")';
  const model = buildHierarchyTable(project, root, new Set(), true, {
    fields: ['name', 'code', 'quantity', 'sourceRow'],
  });
  const data = await buildTableWorkbook(model);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(data);
  assert.deepEqual(
    workbook.worksheets.map((sheet) => sheet.name),
    ['层级组合表', '节点明细', '异常记录'],
  );
  const sheet = workbook.getWorksheet('层级组合表')!;
  const header = sheet
    .getRows(1, sheet.rowCount)!
    .find((row) => row.getCell(1).value === '1 级材料')!.number;
  assert.equal(sheet.views[0].state, 'frozen');
  for (const cell of model.cells) {
    const exported = sheet.getCell(header + 1 + cell.row, cell.column + 1);
    assert.equal(exported.text, cell.lines.map((line) => line.text).join('\n'));
    assert.equal(exported.alignment.wrapText, true);
    if (cell.rowSpan > 1) {
      assert.equal(
        sheet.getCell(header + cell.row + cell.rowSpan, cell.column + 1).master.address,
        exported.address,
      );
    }
  }
  const details = workbook.getWorksheet('节点明细')!;
  assert.equal(details.getCell('D3').value, '00002');
  assert.equal(details.getCell('G2').value, 0);
  assert.equal(details.getCell('G3').value, null);
  assert.equal(details.getCell('G4').value, '1.20');
  assert.equal(details.getCell('D6').value, '=HYPERLINK("x")');
  assert.equal(details.getCell('D6').formula, undefined);
  assert.equal(details.rowCount, 8);
});
test('导出当前范围不会写入隐藏节点，异常记录和空表仍能打开', async () => {
  const project = fixture();
  const root = project.products[0].id;
  const model = buildHierarchyTable(project, root, new Set([root]), false);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await buildTableWorkbook(model));
  assert.equal(workbook.getWorksheet('节点明细')!.rowCount, 1);
  assert.match(
    workbook
      .getWorksheet('层级组合表')!
      .getRows(1, 20)!
      .map((row) => row.getCell(1).text)
      .join(''),
    /已折叠/,
  );
});

test('超长页头拆分合并行，超过 Excel 单元格长度时明确报错', async () => {
  const project = fixture();
  const root = project.products[0].id;
  project.source.fileName = '较长的来源文件名称'.repeat(200);
  const model = buildHierarchyTable(project, root, new Set(), true, { columnWidth: 180 });
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await buildTableWorkbook(model));
  const sheet = workbook.getWorksheet('层级组合表')!;
  const header = sheet
    .getRows(1, sheet.rowCount)!
    .find((row) => row.getCell(1).value === '1 级材料')!.number;
  assert(header > 5);
  for (const row of sheet.getRows(1, sheet.rowCount)!) assert((row.height ?? 0) <= 360);
  const text = sheet
    .getRows(1, header)!
    .map((row) => row.getCell(1).text)
    .join('')
    .replaceAll('\n', '');
  assert(text.includes(project.source.fileName));
  model.cells[0].lines = [{ field: 'name', text: '长'.repeat(32768), size: 14 }];
  await assert.rejects(buildTableWorkbook(model), /长度限制/);
});
