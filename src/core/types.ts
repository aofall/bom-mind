export const FIELDS = ['productCode', 'productName', 'productSpec', 'level', 'quantity', 'materialCode', 'materialName', 'materialSpec'] as const;
export type Field = typeof FIELDS[number];
export const FIELD_LABELS: Record<Field, string> = { productCode: '产品代码', productName: '产品名称', productSpec: '产品规格', level: '层次', quantity: '数量', materialCode: '材料代码', materialName: '材料名称', materialSpec: '材料规格' };
export const REQUIRED: Field[] = ['productCode', 'level', 'materialCode'];
export type Cell = string | number | boolean | null;
export type Mapping = Record<Field, number>;
export interface InputRecord { sourceRow: number; values: Record<Field, Cell> }
export interface Source { id: string; fileName: string; sheetName: string; importedAt: string; demo?: boolean }
export interface Issue { id: string; row: number; kind: string; severity: 'warning' | 'error'; message: string; nodeId?: string; productId?: string }
export interface BomNode { id: string; parentId: string | null; productId: string; code: string; name: string; spec: string; level: number; levelText: string; quantity: Cell; sourceRow: number; children: string[] }
export interface Product { id: string; code: string; name: string; spec: string; count: number; maxDepth: number; issueCount: number }
export interface Project { version: 1; source: Source; records: InputRecord[]; products: Product[]; nodes: Record<string, BomNode>; issues: Issue[]; stats: { records: number; products: number; materials: number; maxDepth: number; missingQty: number; rejected: number } }
export interface SheetInfo { name: string; rowCount: number; columnCount: number; headerRow: number; mapping: Mapping; preview: Cell[][] }
export interface ProjectFile { format: 'bom-mind'; version: 1; quantityBasis: 'unknown'; source: Source; records: InputRecord[] }
