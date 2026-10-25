import test from 'node:test';
import assert from 'node:assert/strict';
import { countMappedFields, getMappingError } from '../src/core/mapping';
import { FIELDS, REQUIRED, type Mapping } from '../src/core/types';
import { describeSheet, recordsFromGrid } from '../src/core/parser';
import { renderProductFile } from '../src/core/product-export';
import { makeDemo } from '../src/core/demo';

const mapped = () => Object.fromEntries(FIELDS.map((field, index) => [field, index])) as Mapping;

test('映射校验在 UI 和解析入口使用相同的必填与重复列规则', () => {
  const mapping = mapped();
  assert.equal(getMappingError(mapping), null);
  assert.equal(countMappedFields(mapping), FIELDS.length);
  assert.equal(countMappedFields(mapping, REQUIRED), REQUIRED.length);
  const missing = { ...mapping, productCode: -1 };
  assert.equal(getMappingError(missing), '请映射“产品代码”列');
  assert.throws(() => recordsFromGrid([], 0, missing), { message: getMappingError(missing)! });
  const duplicate = { ...mapping, productName: mapping.productCode };
  assert.equal(getMappingError(duplicate), '不同字段不能映射到同一列');
  assert.throws(() => recordsFromGrid([], 0, duplicate), { message: getMappingError(duplicate)! });
  assert.equal(getMappingError({ ...mapping, level: 1.5 }), '请映射“层次”列');
});

test('表头识别保留必填列权重，工作表排序仍可单独按已映射总数比较', () => {
  const optional = ['产品名称', '产品规格', '数量', '材料名称', '材料规格'];
  const required = ['产品代码', '层次', '材料代码'];
  const sheet = describeSheet('BOM', [optional, required]);
  assert.equal(sheet.headerRow, 1);
  assert.equal(countMappedFields(sheet.mapping, REQUIRED), 3);
  const optionalOnly = { ...mapped(), productCode: -1, level: -1, materialCode: -1 };
  assert.equal(countMappedFields(optionalOnly), 5);
  assert(countMappedFields(optionalOnly) > countMappedFields(sheet.mapping));
});

test('公共文件入口保留 SVG 完整/折叠范围，文本始终导出完整产品', async () => {
  const project = makeDemo();
  const productId = project.products[0].id;
  const collapsed = new Set(project.nodes[productId].children);
  const partial = await renderProductFile(project, productId, {
    format: 'svg',
    full: false,
    collapsed,
  });
  const full = await renderProductFile(project, productId, { format: 'svg', collapsed });
  const text = await renderProductFile(project, productId, {
    format: 'text',
    full: false,
    collapsed,
  });
  assert.equal(partial.extension, 'svg');
  assert.equal(partial.mimeType, 'image/svg+xml;charset=utf-8');
  assert.match(String(partial.data), /当前展开结构/);
  assert.doesNotMatch(String(partial.data), /立柱管件/);
  assert.match(String(full.data), /完整结构/);
  assert.match(String(full.data), /立柱管件/);
  assert.equal(text.extension, 'txt');
  assert.match(String(text.data), /立柱管件/);
  assert.match(String(text.data), /未提供/);
});
