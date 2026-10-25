import test from 'node:test';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import { parseRecords } from '../src/core/parser';
import {
  productDirectoryCsv,
  productExportName,
  selectedProducts,
  exportProductBatch,
  type BatchArchive,
} from '../src/core/batch-export';
import type { InputRecord } from '../src/core/types';

function fixture() {
  const records: InputRecord[] = ['SAME', 'OTHER', 'SAME'].flatMap((code, index) =>
    [1, 2].map((level, offset) => ({
      sourceRow: index * 2 + offset + 2,
      values: {
        productCode: code,
        productName: '=同名,"产品"',
        productSpec: '规格\n多行',
        level,
        quantity: offset ? null : 0,
        materialCode: `M-${index}-${offset}`,
        materialName: `材料-${index}-${offset}`,
        materialSpec: '',
      },
    })),
  );
  return parseRecords(records, {
    id: 'batch-test',
    fileName: 'test.xls',
    sheetName: 'BOM',
    importedAt: '2026-10-25T00:00:00Z',
  });
}

test('按独立产品 ID 选择，保留原目录顺序，同码区段分别导出', async () => {
  const project = fixture();
  const [first, , last] = project.products;
  const ids = new Set([last.id, first.id, 'unknown']);
  assert.deepEqual(
    selectedProducts(project, ids).map((p) => p.id),
    [first.id, last.id],
  );
  const files: { name: string; data: string }[] = [];
  const result = await exportProductBatch({
    project,
    ids,
    format: 'text',
    signal: new AbortController().signal,
    onProgress() {},
    async onArchive({ blob }) {
      const zip = await JSZip.loadAsync(await blob.arrayBuffer());
      for (const entry of Object.values(zip.files).filter(
        (f) => f.name.endsWith('.txt') && f.name !== '导出结果.txt',
      )) {
        files.push({ name: entry.name, data: await entry.async('string') });
      }
      assert.match(await zip.file('产品目录.csv')!.async('string'), /SAME/);
    },
  });
  assert.equal(result.success, 2);
  assert.equal(files.length, 2);
  assert.notEqual(files[0].name, files[1].name);
  assert.match(files[0].data, /材料-0-1/);
  assert.doesNotMatch(files[0].data, /材料-2-1/);
  assert.match(files[1].data, /材料-2-1/);
  assert.match(files[1].data, /未提供/);
});

test('CSV 转义逗号、引号、换行与公式开头，文件名去除路径字符', () => {
  const product = fixture().products[0];
  const csv = productDirectoryCsv([product]);
  assert(csv.startsWith('\uFEFF'));
  assert.match(csv, /"'=同名,""产品"""/);
  assert.match(csv, /"规格\n多行"/);
  const name = productExportName({ ...product, name: '../../bad:name', code: 'a/b' }, 0, 'svg');
  assert.equal(name, '0001_a_b_.._.._bad_name.svg');
});

test('达到分包预算后先交付，下一包保持顺序且包含各自的目录和结果', async () => {
  const project = fixture();
  const archives: BatchArchive[] = [];
  const result = await exportProductBatch({
    project,
    ids: new Set(project.products.map((p) => p.id)),
    format: 'svg',
    maxPartBytes: 1,
    signal: new AbortController().signal,
    onProgress() {},
    async onArchive(archive) {
      archives.push(archive);
    },
  });
  assert.equal(result.parts, 3);
  assert.deepEqual(
    archives.map((a) => a.last),
    [false, false, true],
  );
  for (const archive of archives) {
    const zip = await JSZip.loadAsync(await archive.blob.arrayBuffer());
    assert.equal(Object.keys(zip.files).filter((name) => name.endsWith('.svg')).length, 1);
    assert(zip.file('产品目录.csv'));
    assert(zip.file('导出结果.txt'));
  }
});

test('取消在交付包的边界终止，不继续生成其余产品', async () => {
  const project = fixture();
  const controller = new AbortController();
  let delivered = 0;
  await assert.rejects(
    exportProductBatch({
      project,
      ids: new Set(project.products.map((p) => p.id)),
      format: 'svg',
      maxPartBytes: 1,
      signal: controller.signal,
      onProgress() {},
      async onArchive() {
        delivered++;
        controller.abort();
      },
    }),
    { name: 'AbortError' },
  );
  assert.equal(delivered, 1);
});

test('单个产品失败保留记录并继续导出其他产品', async () => {
  const project = fixture();
  delete project.nodes[project.products[0].id];
  const result = await exportProductBatch({
    project,
    ids: new Set(project.products.map((p) => p.id)),
    format: 'svg',
    signal: new AbortController().signal,
    onProgress() {},
    async onArchive({ blob }) {
      const zip = await JSZip.loadAsync(await blob.arrayBuffer());
      assert.match(await zip.file('导出结果.txt')!.async('string'), /失败：0001_/);
      assert.equal(Object.keys(zip.files).filter((name) => name.endsWith('.svg')).length, 2);
    },
  });
  assert.equal(result.success, 2);
  assert.equal(result.failed, 1);
});
