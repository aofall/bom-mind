import {
  FIELDS,
  FIELD_LABELS,
  REQUIRED,
  type Cell,
  type InputRecord,
  type Mapping,
  type Project,
  type Source,
  type ProjectFile,
  type SheetInfo,
} from './types';
import { countMappedFields, getMappingError } from './mapping';

const text = (v: Cell | undefined) => (v == null ? '' : String(v).trim());
const aliases: Record<string, string[]> = {
  productCode: ['产品代码', '产品编码', '成品代码', '成品编码'],
  productName: ['产品名称', '成品名称'],
  productSpec: ['产品规格', '成品规格'],
  level: ['层次', '层级', 'bom层次', 'bom层级'],
  quantity: ['数量', '用量', '单耗'],
  materialCode: ['材料代码', '材料编码', '物料代码', '物料编码'],
  materialName: ['材料名称', '物料名称'],
  materialSpec: ['材料规格', '物料规格'],
};
export function detectMapping(row: Cell[]): Mapping {
  return Object.fromEntries(
    FIELDS.map((f) => [
      f,
      row.findIndex((c) => aliases[f].includes(text(c).replace(/\s/g, '').toLowerCase())),
    ]),
  ) as Mapping;
}
export function describeSheet(name: string, grid: Cell[][], rangeRows?: number): SheetInfo {
  let best = -1;
  let headerRow = 0;
  let mapping = detectMapping([]);
  for (let i = 0; i < Math.min(50, grid.length); i++) {
    const m = detectMapping(grid[i] ?? []);
    const score = countMappedFields(m, REQUIRED) * 10 + countMappedFields(m);
    if (score > best) {
      best = score;
      headerRow = i;
      mapping = m;
    }
  }
  return {
    name,
    rowCount: rangeRows ?? grid.length,
    columnCount: Math.max(0, ...grid.slice(0, 50).map((r) => r.length)),
    headerRow,
    mapping,
    preview: grid.slice(0, 55),
  };
}
export function recordsFromGrid(
  grid: Cell[][],
  headerRow: number,
  mapping: Mapping,
): InputRecord[] {
  const mappingError = getMappingError(mapping);
  if (mappingError) throw new Error(mappingError);
  return grid.slice(headerRow + 1).flatMap((row, i) => {
    if (!row.some((c) => text(c))) return [];
    const values = Object.fromEntries(
      FIELDS.map((f) => [f, mapping[f] >= 0 ? (row[mapping[f]] ?? null) : null]),
    ) as InputRecord['values'];
    return [{ sourceRow: headerRow + i + 2, values }];
  });
}
export function parseLevel(value: Cell): number | null {
  if (typeof value === 'number') {
    return Number.isSafeInteger(value) && value > 0 && value <= 100 ? value : null;
  }
  const match = /^(\.*)([1-9]\d*)$/.exec(text(value));
  if (!match) return null;
  const level = Number(match[2]);
  if (level > 100 || (match[1].length > 0 && match[1].length !== level)) return null;
  return level;
}
export function parseRecords(records: InputRecord[], source: Source): Project {
  const project: Project = {
    version: 1,
    source,
    records,
    products: [],
    nodes: Object.create(null),
    issues: [],
    stats: { records: 0, products: 0, materials: 0, maxDepth: 0, missingQty: 0, rejected: 0 },
  };
  let currentCode = '';
  let product: Project['products'][number] | null = null;
  let stack: string[] = [];
  let quarantined = false;
  const segments = new Set<string>();
  const materials = new Set<string>();
  const issue = (
    r: InputRecord,
    kind: string,
    message: string,
    severity: 'warning' | 'error',
    nodeId?: string,
  ) => {
    project.issues.push({
      id: `${source.id}:issue:${project.issues.length}`,
      row: r.sourceRow,
      kind,
      message,
      severity,
      nodeId,
      productId: product?.id,
    });
    if (product) {
      product.issueCount++;
    }
  };
  for (const record of records) {
    const v = record.values;
    const code = text(v.productCode);
    const level = parseLevel(v.level);
    if (code === FIELD_LABELS.productCode && text(v.materialCode) === FIELD_LABELS.materialCode) {
      continue;
    }
    if (!code) {
      issue(
        record,
        'missing-product',
        '缺少产品代码；后续深层记录暂不挂接，直到新的层次 1。',
        'error',
      );
      project.stats.rejected++;
      quarantined = true;
      stack = [];
      currentCode = '';
      product = null;
      continue;
    }
    if (code !== currentCode) {
      currentCode = code;
      const rootId = `${source.id}:p:${record.sourceRow}`;
      product = {
        id: rootId,
        code,
        name: text(v.productName) || code,
        spec: text(v.productSpec),
        count: 0,
        maxDepth: 0,
        issueCount: 0,
      };
      project.products.push(product);
      project.nodes[rootId] = {
        id: rootId,
        parentId: null,
        productId: rootId,
        code,
        name: product.name,
        spec: product.spec,
        level: 0,
        levelText: '产品',
        quantity: null,
        sourceRow: record.sourceRow,
        children: [],
      };
      stack = [rootId];
      quarantined = false;
      if (segments.has(code)) {
        issue(
          record,
          'repeated-segment',
          '同一产品代码再次出现在新段落，已作为独立区段保留，请确认 BOM 版本。',
          'warning',
          rootId,
        );
      }
      segments.add(code);
    }
    if (level === null || !text(v.materialCode)) {
      issue(
        record,
        level === null ? 'invalid-level' : 'missing-material',
        level === null
          ? `层次“${text(v.level)}”无效，无法确定父项。`
          : '缺少材料代码，无法建立可靠节点。',
        'error',
      );
      project.stats.rejected++;
      quarantined = true;
      stack = [product!.id];
      continue;
    }
    if (level === 1) {
      quarantined = false;
      stack = [product!.id];
    }
    if (quarantined) {
      issue(
        record,
        'unresolved-branch',
        '前面的分支存在结构错误，此行暂不自动挂接；遇到层次 1 后恢复。',
        'error',
      );
      project.stats.rejected++;
      continue;
    }
    while (stack.length > 1 && project.nodes[stack.at(-1)!].level >= level) {
      stack.pop();
    }
    const parent = project.nodes[stack.at(-1)!];
    if (!parent || parent.level !== level - 1) {
      issue(
        record,
        'level-jump',
        `层次从 ${parent?.level ?? 0} 跳到 ${level}，缺少直接父项；此分支暂不挂接。`,
        'error',
      );
      project.stats.rejected++;
      quarantined = true;
      stack = [product!.id];
      continue;
    }
    const id = `${source.id}:r:${record.sourceRow}`;
    project.nodes[id] = {
      id,
      parentId: parent.id,
      productId: product!.id,
      code: text(v.materialCode),
      name: text(v.materialName) || text(v.materialCode),
      spec: text(v.materialSpec),
      level,
      levelText: text(v.level),
      quantity: v.quantity === '' ? null : v.quantity,
      sourceRow: record.sourceRow,
      children: [],
    };
    parent.children.push(id);
    stack.push(id);
    product!.count++;
    product!.maxDepth = Math.max(product!.maxDepth, level);
    project.stats.records++;
    project.stats.maxDepth = Math.max(project.stats.maxDepth, level);
    materials.add(text(v.materialCode));
    if (v.quantity == null || text(v.quantity) === '') {
      project.stats.missingQty++;
      issue(record, 'missing-quantity', '数量未提供，保留空值，不按 0 或 1 计算。', 'warning', id);
    } else if (typeof v.quantity !== 'number' && !Number.isFinite(Number(text(v.quantity)))) {
      issue(record, 'invalid-quantity', '数量不是有效数字，已保留原值。', 'warning', id);
    }
  }
  project.stats.products = project.products.length;
  project.stats.materials = materials.size;
  return project;
}
export function serializeProject(project: Project): string {
  const file: ProjectFile = {
    format: 'bom-mind',
    version: 1,
    quantityBasis: 'unknown',
    source: project.source,
    records: project.records,
  };
  return JSON.stringify(file, null, 2);
}
export function deserializeProject(raw: string): Project {
  const file = JSON.parse(raw);
  if (
    file?.format !== 'bom-mind' ||
    file?.version !== 1 ||
    file?.quantityBasis !== 'unknown' ||
    !Array.isArray(file.records) ||
    !file.source
  ) {
    throw new Error('这不是受支持的 BOM Mind 项目文件（版本 1）');
  }
  const s = file.source;
  if (
    ![s.id, s.fileName, s.sheetName, s.importedAt].every((v) => typeof v === 'string') ||
    !/^[a-zA-Z0-9_-]{1,100}$/.test(s.id)
  ) {
    throw new Error('项目来源信息无效');
  }
  let previousRow = 0;
  const records: InputRecord[] = file.records.map((record: InputRecord) => {
    if (
      !record ||
      !Number.isSafeInteger(record.sourceRow) ||
      record.sourceRow <= previousRow ||
      !record.values
    ) {
      throw new Error('项目行号必须唯一且保持原始顺序');
    }
    previousRow = record.sourceRow;
    const values = Object.fromEntries(
      FIELDS.map((f) => {
        const v = record.values[f];
        if (v !== null && !['string', 'number', 'boolean'].includes(typeof v)) {
          throw new Error('项目包含不支持的单元格值');
        }
        if (typeof v === 'number' && !Number.isFinite(v)) throw new Error('项目包含无效数字');
        return [f, v];
      }),
    ) as InputRecord['values'];
    return { sourceRow: record.sourceRow, values };
  });
  return parseRecords(records, {
    id: s.id,
    fileName: s.fileName,
    sheetName: s.sheetName,
    importedAt: s.importedAt,
    ...(typeof s.demo === 'boolean' ? { demo: s.demo } : {}),
  });
}
export function ancestry(project: Project, nodeId: string): string[] {
  const path: string[] = [];
  let node = project.nodes[nodeId];
  while (node) {
    path.unshift(node.id);
    if (!node.parentId) break;
    node = project.nodes[node.parentId];
  }
  return path;
}
export const quantityLabel = (value: Cell): string =>
  value == null || value === '' ? '未提供' : String(value);
