/// <reference lib="webworker" />
import { buildTableWorkbook } from './core/table-excel';
import type { HierarchyTableModel } from './core/hierarchy-table';

self.onmessage = async (event: MessageEvent<{ id: number; model: HierarchyTableModel }>) => {
  const { id, model } = event.data;
  try {
    const buffer = await buildTableWorkbook(model);
    self.postMessage({ id, buffer }, { transfer: [buffer] });
  } catch (error) {
    self.postMessage({ id, error: error instanceof Error ? error.message : 'Excel 生成失败' });
  }
};
