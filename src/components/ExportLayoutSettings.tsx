import { useMemo } from 'react';
import { normalizeExportLayout, type ExportLayoutOptions } from '../core/export-layout';
import { renderLayoutPreview } from '../core/export-svg';

interface Props {
  value: ExportLayoutOptions;
  onChange: (value: ExportLayoutOptions) => void;
  disabled?: boolean;
  sampleTitle?: string;
}
export function ExportLayoutSettings({
  value,
  onChange,
  disabled = false,
  sampleTitle = 'SKU码 贴标 床架TA00DB4003-14E',
}: Props) {
  const preview = useMemo(() => renderLayoutPreview(value, sampleTitle), [value, sampleTitle]);
  const update = (patch: Partial<ExportLayoutOptions>) =>
    onChange(normalizeExportLayout({ ...value, ...patch }));
  return (
    <details className="export-layout-settings">
      <summary>
        导出排版 · {value.textMode === 'wrap' ? '自动换行' : '单行省略'} · {value.nodeWidth}px
        {value.autoWidth ? ' 起自动加宽' : ''}
      </summary>
      <fieldset disabled={disabled}>
        <legend className="visually-hidden">导出排版设置</legend>
        <div className="layout-selects">
          <label>
            长文本处理
            <select
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
        <label className="layout-range">
          节点宽度 <output>{value.nodeWidth}px</output>
          <input
            aria-label="节点宽度"
            type="range"
            min={200}
            max={600}
            step={10}
            value={value.nodeWidth}
            onChange={(event) => update({ nodeWidth: Number(event.target.value) })}
          />
        </label>
        <div className="layout-presets" role="group" aria-label="常用节点宽度">
          {[240, 320, 400].map((width) => (
            <button
              type="button"
              key={width}
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
          按内容自动加宽，超过上限后按所选方式处理
        </label>
        {value.autoWidth && (
          <label className="layout-range">
            最大节点宽度 <output>{value.maxNodeWidth}px</output>
            <input
              aria-label="最大节点宽度"
              type="range"
              min={value.nodeWidth}
              max={600}
              step={10}
              value={value.maxNodeWidth}
              onChange={(event) => update({ maxNodeWidth: Number(event.target.value) })}
            />
          </label>
        )}
        <div className="layout-preview">
          <span>节点示例</span>
          <img
            src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(preview)}`}
            alt="导出节点排版预览"
          />
        </div>
        <p className="layout-note">
          名称、规格/编码和数量均按所选方式排版。换行时节点自动增高；仅影响
          SVG、PNG，批量导出使用相同设置。
        </p>
        <button
          type="button"
          className="text-action"
          onClick={() => onChange(normalizeExportLayout())}
        >
          恢复默认排版
        </button>
      </fieldset>
    </details>
  );
}
