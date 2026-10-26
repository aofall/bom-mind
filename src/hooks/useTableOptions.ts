import { normalizeTableOptions } from '../core/hierarchy-table';
import { useLocalPreference } from './useLocalPreference';

export function useTableOptions() {
  return useLocalPreference('bom-mind:table-options:v1', normalizeTableOptions);
}
