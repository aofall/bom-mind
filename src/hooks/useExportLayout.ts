import { useCallback, useEffect, useState } from 'react';
import { normalizeExportLayout, type ExportLayoutOptions } from '../core/export-layout';

const KEY = 'bom-mind:export-layout:v1';
function readLayout(): ExportLayoutOptions {
  try {
    return normalizeExportLayout(JSON.parse(localStorage.getItem(KEY) ?? 'null'));
  } catch {
    return normalizeExportLayout();
  }
}
export function useExportLayout() {
  const [layout, setLayout] = useState(readLayout);
  const updateLayout = useCallback((value: ExportLayoutOptions) => {
    setLayout(normalizeExportLayout(value));
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(layout));
    } catch {
      // Export still works when the browser blocks local preference storage.
    }
  }, [layout]);
  return [layout, updateLayout] as const;
}
