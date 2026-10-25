import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseRecords,
  parseLevel,
  recordsFromGrid,
  deserializeProject,
  serializeProject,
  describeSheet,
} from '../src/core/parser';
import { buildSvg, exportText } from '../src/core/export';
import type { InputRecord } from '../src/core/types';
const source = {
  id: 'test',
  fileName: 'test.xls',
  sheetName: 'BOM',
  importedAt: '2026-10-24T00:00:00Z',
};
function fixture(levels: (string | number)[], products: string[] = []) {
  return levels.map((level, i): InputRecord => ({
    sourceRow: i + 2,
    values: {
      productCode: products[i] || 'P1',
      productName: '产品',
      productSpec: '',
      level,
      quantity: 1,
      materialCode: `M${i}`,
      materialName: `材料${i}`,
      materialSpec: '',
    },
  }));
}
test('同级及更高层级都结束管辖，2 的孩子不会挂到另一个 2', () => {
  for (const [levels, expected] of [
    [
      [1, 2, 3, 2, 3, 1],
      [0, 1, 2, 1, 4, 0],
    ],
    [
      [1, 2, 3, 1, 2],
      [0, 1, 2, 0, 4],
    ],
    [
      [1, 1, 2, 2, 3, 1],
      [0, 0, 2, 2, 4, 0],
    ],
    [
      [1, 2, 3, 4, 2],
      [0, 1, 2, 3, 1],
    ],
  ] as [number[], number[]][]) {
    const p = parseRecords(fixture(levels), source);
    const ids = levels.map((_, i) => `test:r:${i + 2}`);
    assert.deepEqual(
      ids.map((id) => {
        const parent = p.nodes[id].parentId!;
        return parent === p.products[0].id ? 0 : ids.indexOf(parent) + 1;
      }),
      expected,
    );
  }
});
test('产品变化重置路径，同码分散区段保持独立', () => {
  const p = parseRecords(fixture([1, 2, 1, 2, 1], ['P1', 'P1', 'P2', 'P2', 'P1']), source);
  assert.equal(p.products.length, 3);
  assert.equal(p.nodes['test:r:5'].parentId, 'test:r:4');
  assert.equal(p.nodes['test:r:6'].parentId, p.products[2].id);
  assert.ok(p.issues.some((i) => i.kind === 'repeated-segment'));
});
test('不能按材料代码合并或截断子树，空数量不同于 0', () => {
  const records = fixture([1, 2, 1, 2]);
  records[0].values.materialCode = '3.01';
  records[2].values.materialCode = '3.01';
  records[1].values.quantity = null;
  records[3].values.quantity = 0;
  const p = parseRecords(records, source);
  assert.equal(p.stats.records, 4);
  assert.equal(p.stats.missingQty, 1);
  assert.equal(p.nodes['test:r:2'].children[0], 'test:r:3');
  assert.equal(p.nodes['test:r:4'].children[0], 'test:r:5');
  assert.equal(p.nodes['test:r:5'].quantity, 0);
});
test('跳级不猜测父项，错误分支隔离到下一个 1，支持 6 级以上', () => {
  const p = parseRecords(fixture([1, 3, 2, 1, 2, 3, 4, 5, 6, 7]), source);
  assert.equal(p.stats.rejected, 2);
  assert.ok(!p.nodes['test:r:3']);
  assert.ok(!p.nodes['test:r:4']);
  assert.equal(p.stats.maxDepth, 7);
  assert.equal(p.nodes['test:r:6'].parentId, 'test:r:5');
});
test('层次格式解析与非法层次', () => {
  for (const [v, n] of [
    ['.1', 1],
    ['..2', 2],
    ['...3', 3],
    [4, 4],
    ['5', 5],
  ] as const) {
    assert.equal(parseLevel(v), n);
  }
  for (const v of ['.2', '...2', 'abc', 0, -1, '1.2', null]) {
    assert.equal(parseLevel(v), null);
  }
});
test('工作表识别与字段映射保留实际行号和空白分隔', () => {
  const grid = [
    ['报表'],
    [],
    ['产品代码', '层次', '材料代码', '数量'],
    ['P1', '.1', 'M1', 8],
    [],
    ['P1', '..2', 'M2', null],
  ];
  const sheet = describeSheet('BOM', grid);
  assert.equal(sheet.headerRow, 2);
  const records = recordsFromGrid(grid, 2, sheet.mapping);
  assert.deepEqual(
    records.map((r) => r.sourceRow),
    [4, 6],
  );
  const bad = { ...sheet.mapping, materialCode: 0 };
  assert.throws(() => recordsFromGrid(grid, 2, bad), /同一列/);
});
test('JSON 往返恢复相同结构、空数量和来源，拒绝重复行号', () => {
  const records = fixture(['.1', '..2', '.1']);
  records[1].values.quantity = null;
  const p = parseRecords(records, source);
  assert.deepEqual(deserializeProject(serializeProject(p)), p);
  const f = JSON.parse(serializeProject(p));
  f.records[1].sourceRow = f.records[0].sourceRow;
  assert.throws(() => deserializeProject(JSON.stringify(f)), /行号/);
});
test('完整导出保留折叠分支、转义文本，当前导出尊重折叠', () => {
  const records = fixture([1, 2, 3, 1]);
  records[0].values.materialName = '<script>&"';
  const p = parseRecords(records, source);
  const root = p.products[0].id;
  const current = buildSvg(p, root, new Set(['test:r:2']), false);
  const full = buildSvg(p, root, new Set(['test:r:2']), true);
  assert.ok(full.svg.includes('&lt;script&gt;&amp;&quot;'));
  assert.ok(!full.svg.includes('<script>'));
  assert.ok(!current.svg.includes('材料2'));
  assert.ok(full.svg.includes('材料2'));
  assert.ok(full.height > 0 && full.width > 0);
  assert.ok(exportText(p, root).includes('      材料2'));
});
