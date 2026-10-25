import test from 'node:test';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import {
  fitText,
  layoutExportTree,
  measureTextCard,
  normalizeExportLayout,
  pngDimensions,
  type TextMeasurer,
} from '../src/core/export-layout';
import { buildSvg } from '../src/core/export';
import { parseRecords } from '../src/core/parser';
import { makeDemo } from '../src/core/demo';
import { exportProductBatch } from '../src/core/batch-export';
import type { InputRecord } from '../src/core/types';

const segmenter = new Intl.Segmenter('zh-CN', { granularity: 'grapheme' });
const measure: TextMeasurer = (text, size) => Array.from(segmenter.segment(text)).length * size;

test('换行保留中英文、空格、编码和完整字形，不自动加入省略号', () => {
  for (const title of [
    'SKU码 贴标 床架TA00DB4003-14E',
    '  中文  TITLE-1234567890123456789  ',
    '超长连续编码'.repeat(12),
    'A👨‍👩‍👧‍👦éB',
  ]) {
    const lines = fitText(title, 70, 14, 600, 'wrap', measure);
    assert.equal(lines.join(''), title);
    assert(lines.every((line) => measure(line, 14, 600) <= 70));
    assert(!lines.some((line) => line.includes('…')));
  }
  assert.deepEqual(fitText('A👨‍👩‍👧‍👦éB', 15, 14, 600, 'wrap', measure), ['A', '👨‍👩‍👧‍👦', 'é', 'B']);
  assert.deepEqual(fitText('甲\n\n乙', 100, 14, 600, 'wrap', measure), ['甲', '', '乙']);
});

test('只有显式选择单行省略时才截断，自动加宽仍受上限约束', () => {
  const title = 'SKU码 贴标 床架TA00DB4003-14E'.repeat(4);
  const lines = fitText(title, 100, 14, 600, 'ellipsis', measure);
  assert.equal(lines.length, 1);
  assert(lines[0].endsWith('…'));
  assert(measure(lines[0], 14, 600) <= 100);
  const card = measureTextCard(
    { title, subtitle: '规格', quantity: '原表数量 1' },
    normalizeExportLayout({ nodeWidth: 200, autoWidth: true, maxNodeWidth: 400 }),
    measure,
  );
  assert.equal(card.width, 400);
  assert(card.blocks[0].lines.length > 1);
  assert.equal(card.blocks[0].lines.join(''), title);
});

function fixture() {
  const records: InputRecord[] = [1, 2, 3, 2, 1, 2, 1].map((level, index) => ({
    sourceRow: index + 2,
    values: {
      productCode: 'ROOT',
      productName: '根节点长名称'.repeat(30),
      productSpec: '产品规格',
      level,
      quantity: index ? null : 0,
      materialCode: `CODE-${index}`,
      materialName: index % 2 ? 'SKU码 贴标 床架TA00DB4003-14E' : '超长材料名称'.repeat(20),
      materialSpec: '规格编码ABCD-1234567890'.repeat(4),
    },
  }));
  return parseRecords(records, {
    id: 'layout-test',
    fileName: '来源文件'.repeat(20) + '.xls',
    sheetName: 'BOM',
    importedAt: '2026-10-25T00:00:00Z',
  });
}

test('节点按文字增高，父子和兄弟节点不重叠，画布完整包含所有节点与页头页尾', () => {
  const project = fixture();
  const before = JSON.stringify(project);
  for (const autoWidth of [false, true]) {
    const diagram = layoutExportTree(
      project,
      project.products[0].id,
      new Set(),
      true,
      { nodeWidth: 200, autoWidth, maxNodeWidth: 400 },
      measure,
    );
    assert.equal(diagram.cards.length, 8);
    for (const card of diagram.cards) {
      assert.equal(card.blocks[0].lines.join(''), card.node.name);
      assert(card.x >= 0 && card.y >= 0);
      assert(card.x + card.width <= diagram.width && card.y + card.height <= diagram.height);
      assert(card.y >= diagram.header.at(-1)!.y + diagram.header.at(-1)!.block.height);
      assert(card.y + card.height < diagram.footer.y);
      assert(
        card.blocks.every((block) =>
          block.lines.every(
            (line) => measure(line, block.fontSize, block.weight) <= card.width - 34,
          ),
        ),
      );
      for (const other of diagram.cards) {
        if (card === other) continue;
        assert(
          card.x + card.width <= other.x ||
            other.x + other.width <= card.x ||
            card.y + card.height <= other.y ||
            other.y + other.height <= card.y,
        );
      }
    }
    assert(diagram.cards.some((card) => card.height > 100));
    assert(diagram.footer.y + diagram.footer.block.height <= diagram.height);
  }
  assert.equal(JSON.stringify(project), before);
});

test('折叠导出只布局可见节点，多行 SVG 使用 tspan 且保留 XML 转义', () => {
  const project = fixture();
  const root = project.products[0].id;
  const collapsed = new Set(project.nodes[root].children);
  const partial = layoutExportTree(project, root, collapsed, false, { nodeWidth: 200 }, measure);
  assert.equal(partial.cards.length, 4);
  project.nodes[root].name = '引号" & <script> 超长名称'.repeat(8);
  const svg = buildSvg(project, root, collapsed, false, { nodeWidth: 200 }).svg;
  assert.match(svg, /<tspan /);
  assert.match(svg, /&lt;script&gt;/);
  assert.doesNotMatch(svg, /<script>/);
  assert.match(svg, /xml:space="preserve"/);
});

test('宽度和字号配置会影响布局，无效偏好恢复安全范围', () => {
  const project = fixture();
  const root = project.products[0].id;
  const narrow = layoutExportTree(
    project,
    root,
    new Set(),
    true,
    { nodeWidth: 200, fontSize: 16 },
    measure,
  );
  const wide = layoutExportTree(
    project,
    root,
    new Set(),
    true,
    { nodeWidth: 600, fontSize: 12 },
    measure,
  );
  assert(wide.width > narrow.width);
  assert(narrow.height > wide.height);
  assert.deepEqual(
    normalizeExportLayout({
      nodeWidth: Infinity,
      maxNodeWidth: -1,
      fontSize: 100,
      textMode: 'invalid',
    }),
    { textMode: 'wrap', nodeWidth: 320, fontSize: 14, autoWidth: false, maxNodeWidth: 320 },
  );
  assert.equal(normalizeExportLayout(null).nodeWidth, 320);
});

test('PNG 输出尺寸保持正数，遵守边长和像素预算', () => {
  for (const [width, height] of [
    [1000, 2000],
    [100000, 100000],
    [10000000, 1],
    [1, 10000000],
  ]) {
    const result = pngDimensions(width, height);
    assert(result.width >= 1 && result.height >= 1);
    assert(result.width <= 16000 && result.height <= 16000);
    assert(result.width * result.height <= 24_000_000);
  }
});

test('批量导出固定任务开始时的排版配置，中途修改输入不会影响后续产品', async () => {
  const project = makeDemo();
  const layout = normalizeExportLayout({ nodeWidth: 200 });
  let exported = 0;
  await exportProductBatch({
    project,
    ids: new Set(project.products.map((product) => product.id)),
    format: 'svg',
    layout,
    signal: new AbortController().signal,
    onProgress(progress) {
      if (progress.done === 1) layout.nodeWidth = 600;
    },
    async onArchive({ blob }) {
      const zip = await JSZip.loadAsync(await blob.arrayBuffer());
      for (const file of Object.values(zip.files).filter((file) => file.name.endsWith('.svg'))) {
        const svg = await file.async('string');
        const widths = [...svg.matchAll(/<rect x="[^"]+" y="[^"]+" width="([^"]+)"/g)].map(
          (match) => Number(match[1]),
        );
        assert(widths.length > 0 && widths.every((width) => width === 200));
        exported++;
      }
    },
  });
  assert.equal(exported, 2);
});
