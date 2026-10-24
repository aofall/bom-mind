/// <reference lib="webworker" />
import * as XLSX from 'xlsx';
import { describeSheet, recordsFromGrid, parseRecords } from './core/parser';
import type { Cell, Mapping, Source } from './core/types';
let workbook: XLSX.WorkBook | null = null;
self.onmessage = (event: MessageEvent) => {
  const { type, payload } = event.data;
  try {
    if (type === 'open') {
      self.postMessage({ type: 'progress', message: '正在读取 Excel 工作表…' });
      workbook = XLSX.read(payload.buffer, { type: 'array', cellDates: false, dense: true });
      const sheets = workbook.SheetNames.map(name => {
        const sheet = workbook!.Sheets[name];
        const range = sheet['!ref'] ? XLSX.utils.decode_range(sheet['!ref']) : null;
        const preview = XLSX.utils.sheet_to_json<Cell[]>(sheet, { header: 1, defval: null, blankrows: true, range: range ? { s: { r: 0, c: 0 }, e: { r: Math.min(range.e.r, 54), c: range.e.c } } : undefined });
        return describeSheet(name, preview, range ? range.e.r + 1 : 0);
      });
      self.postMessage({ type: 'sheets', sheets });
    } else if (type === 'parse') {
      if (!workbook) throw new Error('请重新选择 Excel 文件');
      const { sheetName, headerRow, mapping, source } = payload as { sheetName: string; headerRow: number; mapping: Mapping; source: Source };
      if (!workbook.Sheets[sheetName]) throw new Error('找不到所选工作表');
      self.postMessage({ type: 'progress', message: '正在按原始行序还原父子关系…' });
      const grid = XLSX.utils.sheet_to_json<Cell[]>(workbook.Sheets[sheetName], { header: 1, defval: null, blankrows: true, range: 0 });
      const records = recordsFromGrid(grid, headerRow, mapping);
      const project = parseRecords(records, source);
      if (!project.products.length) throw new Error('没有识别到产品，请检查工作表、表头行和字段映射');
      self.postMessage({ type: 'project', project });
      workbook = null;
    }
  } catch (error) { self.postMessage({ type: 'error', message: error instanceof Error ? error.message : '文件解析失败' }); }
};
