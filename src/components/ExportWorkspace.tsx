import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { layoutExportTree, pngDimensions, type ExportLayoutOptions } from '../core/export-layout';
import type { Project } from '../core/types';
import { DiagramViewport } from './DiagramViewport';
import { ExportLayoutSettings } from './ExportLayoutSettings';

interface Props {
  project: Project;
  productId: string;
  layout: ExportLayoutOptions;
  onLayoutChange: (value: ExportLayoutOptions) => void;
  full?: boolean;
  collapsed?: Set<string>;
  disabled?: boolean;
  previewHeader?: ReactNode;
  children: ReactNode;
}
export function ExportWorkspace({
  project,
  productId,
  layout,
  onLayoutChange,
  full = true,
  collapsed,
  disabled = false,
  previewHeader,
  children,
}: Props) {
  const [editing, setEditing] = useState(false);
  useEffect(() => {
    if (disabled) setEditing(false);
  }, [disabled]);
  const showSettings = editing && !disabled;
  const diagram = useMemo(
    () =>
      project.nodes[productId]
        ? layoutExportTree(project, productId, collapsed, full, layout)
        : null,
    [project, productId, collapsed, full, layout],
  );
  const png = diagram ? pngDimensions(diagram.width, diagram.height) : null;
  return (
    <div className="export-workspace">
      <section className="export-preview" aria-label="导出效果预览">
        {previewHeader}
        <div className="export-preview-canvas">
          {diagram ? (
            <DiagramViewport
              key={productId}
              diagram={diagram}
              label="导出图片预览，可拖动和缩放"
              fit
              controls
            />
          ) : (
            <p>请先选择产品</p>
          )}
        </div>
        {diagram && png && (
          <p className="export-image-size" role="status">
            {full ? '完整产品结构' : '当前展开结构'} · SVG {diagram.width} × {diagram.height}；PNG{' '}
            {png.width} × {png.height}。
            {png.scale < 1 && <strong>PNG 将缩小以符合尺寸限制，完整清晰图建议使用 SVG。</strong>}
          </p>
        )}
      </section>
      <section className="export-actions" aria-label="导出配置">
        <div className="layout-summary">
          <div>
            <strong>排版设置</strong>
            <p>
              {layout.autoWidth
                ? `${layout.nodeWidth}–${layout.maxNodeWidth}px`
                : `${layout.nodeWidth}px`}{' '}
              · {layout.textMode === 'wrap' ? '自动换行' : '单行省略'} · 标题 {layout.fontSize}px
            </p>
          </div>
          <button
            type="button"
            className="text-action"
            disabled={disabled}
            aria-expanded={showSettings}
            onClick={() => setEditing(!editing)}
          >
            {showSettings ? '完成排版' : '调整排版'}
          </button>
        </div>
        {showSettings && (
          <ExportLayoutSettings value={layout} onChange={onLayoutChange} disabled={disabled} />
        )}
        {!showSettings && children}
      </section>
    </div>
  );
}
