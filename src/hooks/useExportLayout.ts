import { normalizeExportLayout } from '../core/export-layout';
import { useLocalPreference } from './useLocalPreference';

const KEY = 'bom-mind:export-layout:v1';
export function useExportLayout() {
  return useLocalPreference(KEY, normalizeExportLayout);
}
