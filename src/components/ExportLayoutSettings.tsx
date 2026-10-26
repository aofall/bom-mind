import { useEffect, useId, useState } from 'react';
import { normalizeExportLayout, type ExportLayoutOptions } from '../core/export-layout';

export function WidthControl({
  label,
  value,
  min = 200,
  onChange,
}: {
  label: string;
  value: number;
  min?: number;
  onChange: (value: number) => void;
}) {
  const id = useId();
  const [draft, setDraft] = useState(String(value));
  useEffect(() => {
    setDraft(String(value));
  }, [value]);
  function commit() {
    const parsed = Number(draft);
    const next =
      draft.trim() && Number.isFinite(parsed)
        ? Math.max(min, Math.min(600, Math.round(parsed)))
        : value;
    setDraft(String(next));
    onChange(next);
  }
  return (
    <div className="layout-width">
      <div className="layout-width-heading">
        <label htmlFor={id}>{label}</label>
        <span>
          <input
            id={id}
            type="number"
            min={min}
            max={600}
            step={1}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onBlur={commit}
            onKeyDown={(event) => {
              if (event.key === 'Enter') event.currentTarget.blur();
            }}
          />{' '}
          px
        </span>
      </div>
      <input
        aria-label={`${label}滑块`}
        type="range"
        min={min}
        max={600}
        step={10}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </div>
  );
}

interface Props {
  value: ExportLayoutOptions;
  onChange: (value: ExportLayoutOptions) => void;
  disabled?: boolean;
}
export function ExportLayoutSettings({ value, onChange, disabled = false }: Props) {
  const update = (patch: Partial<ExportLayoutOptions>) =>
    onChange(normalizeExportLayout({ ...value, ...patch }));
  return (
    <fieldset className="export-layout-settings" disabled={disabled}>
      <legend className="visually-hidden">排版设置</legend>
      <WidthControl
        label={value.autoWidth ? '最小节点宽度' : '节点宽度'}
        value={value.nodeWidth}
        onChange={(nodeWidth) => update({ nodeWidth })}
      />
      <div className="layout-presets" role="group" aria-label="常用节点宽度">
        {[240, 320, 400].map((width) => (
          <button
            type="button"
            key={width}
            aria-pressed={value.nodeWidth === width}
            className={value.nodeWidth === width ? 'active' : ''}
            onClick={() => update({ nodeWidth: width })}
          >
            {width}px
          </button>
        ))}
      </div>
      <label className="layout-auto">
        <input
          type="checkbox"
          checked={value.autoWidth}
          onChange={(event) => update({ autoWidth: event.target.checked })}
        />
        按内容自动加宽
      </label>
      {value.autoWidth && (
        <WidthControl
          label="最大节点宽度"
          value={value.maxNodeWidth}
          min={value.nodeWidth}
          onChange={(maxNodeWidth) => update({ maxNodeWidth })}
        />
      )}
      <div className="layout-selects">
        <label>
          超出宽度时
          <select
            aria-label="超出宽度时"
            value={value.textMode}
            onChange={(event) =>
              update({ textMode: event.target.value as ExportLayoutOptions['textMode'] })
            }
          >
            <option value="wrap">自动换行（保留完整文字）</option>
            <option value="ellipsis">单行省略</option>
          </select>
        </label>
        <label>
          标题字号
          <select
            aria-label="标题字号"
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
      <p className="layout-note">
        {value.autoWidth
          ? `先按内容加宽至最多 ${value.maxNodeWidth}px，仍然放不下时${value.textMode === 'wrap' ? '换行' : '省略'}。`
          : '超出节点宽度的文字按所选方式处理。'}
        换行时节点自动增高。设置用于画布及所有 SVG、PNG 导出，文本和 JSON 不受影响。
      </p>
      <button
        type="button"
        className="text-action"
        onClick={() => onChange(normalizeExportLayout())}
      >
        恢复默认排版
      </button>
    </fieldset>
  );
}
