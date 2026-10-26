import {
  TABLE_FIELDS,
  TABLE_FIELD_LABELS,
  normalizeTableOptions,
  type TableOptions,
} from '../core/hierarchy-table';
import { WidthControl } from './ExportLayoutSettings';

interface Props {
  value: TableOptions;
  onChange: (value: TableOptions) => void;
  disabled?: boolean;
}
export function TableSettings({ value, onChange, disabled = false }: Props) {
  const update = (patch: Partial<TableOptions>) =>
    onChange(normalizeTableOptions({ ...value, ...patch }));
  return (
    <fieldset className="table-settings" disabled={disabled}>
      <legend className="visually-hidden">组合表设置</legend>
      <WidthControl
        label="层级列宽"
        min={180}
        value={value.columnWidth}
        onChange={(columnWidth) => update({ columnWidth })}
      />
      <div className="layout-selects">
        <label>
          表格字号
          <select
            aria-label="表格字号"
            value={value.fontSize}
            onChange={(event) => update({ fontSize: Number(event.target.value) })}
          >
            {[12, 14, 16].map((size) => (
              <option key={size} value={size}>
                {size}px
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="table-field-options" role="group" aria-label="组合表显示字段">
        {TABLE_FIELDS.map((field) => (
          <label key={field}>
            <input
              type="checkbox"
              checked={value.fields.includes(field)}
              disabled={field === 'name'}
              onChange={(event) =>
                update({
                  fields: event.target.checked
                    ? [...value.fields, field]
                    : value.fields.filter((item) => item !== field),
                })
              }
            />
            {TABLE_FIELD_LABELS[field]}
            {field === 'name' && '（必选）'}
          </label>
        ))}
      </div>
      <p className="layout-note">
        预览和 Excel 使用相同字段、列宽与换行。数量保持原表值，未提供的数量不按 0 或 1
        处理。设置保存在本机。
      </p>
      <button
        type="button"
        className="text-action"
        onClick={() => onChange(normalizeTableOptions())}
      >
        恢复默认表格设置
      </button>
    </fieldset>
  );
}
