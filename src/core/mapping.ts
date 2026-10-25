import { FIELDS, FIELD_LABELS, REQUIRED, type Field, type Mapping } from './types';

export function countMappedFields(mapping: Mapping, fields: readonly Field[] = FIELDS): number {
  return fields.filter((field) => mapping[field] >= 0).length;
}

export function getMappingError(mapping: Mapping): string | null {
  for (const field of REQUIRED) {
    if (!Number.isInteger(mapping[field]) || mapping[field] < 0) {
      return `请映射“${FIELD_LABELS[field]}”列`;
    }
  }
  const columns = FIELDS.map((field) => mapping[field]).filter((index) => index >= 0);
  if (new Set(columns).size !== columns.length) return '不同字段不能映射到同一列';
  return null;
}
