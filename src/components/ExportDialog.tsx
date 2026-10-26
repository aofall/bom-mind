import {
  ArrowDownToLine,
  GitBranch,
  FileText,
  FileJson,
  FileSpreadsheet,
  ArrowUpRight,
  ShieldCheck,
  type LucideIcon,
} from 'lucide-react';
import { useState } from 'react';
import { Modal } from './Modal';
import type { ProductExportFormat } from '../core/product-export';
import type { ExportLayoutOptions } from '../core/export-layout';
import type { Project } from '../core/types';
import { ExportWorkspace } from './ExportWorkspace';
import type { TableOptions } from '../core/hierarchy-table';

interface Props {
  project: Project;
  productId: string;
  collapsed: Set<string>;
  layout: ExportLayoutOptions;
  onLayoutChange: (value: ExportLayoutOptions) => void;
  full: boolean;
  onFullChange: (full: boolean) => void;
  onExport: (kind: ProductExportFormat | 'json') => void;
  onClose: () => void;
  table: TableOptions;
  onTableChange: (value: TableOptions) => void;
  initialTablePreview?: boolean;
}
const formats: {
  kind: ProductExportFormat | 'json';
  icon: LucideIcon;
  title: string;
  description: string;
}[] = [
  { kind: 'png', icon: ArrowDownToLine, title: 'PNG 图片', description: '用于文档、汇报与分享' },
  { kind: 'svg', icon: GitBranch, title: 'SVG 矢量图', description: '放大清晰，保留完整画布' },
  { kind: 'text', icon: FileText, title: '缩进文本', description: '完整产品层级，可复制与核对' },
  {
    kind: 'xlsx',
    icon: FileSpreadsheet,
    title: 'Excel 组合表',
    description: '合并层级、保留节点明细与来源',
  },
  {
    kind: 'json',
    icon: FileJson,
    title: 'JSON 项目',
    description: '保存全部产品，可重新导入或换设备打开',
  },
];
export function ExportDialog({
  project,
  productId,
  collapsed,
  layout,
  onLayoutChange,
  full,
  onFullChange,
  onExport,
  onClose,
  table,
  onTableChange,
  initialTablePreview = false,
}: Props) {
  const [previewKind, setPreviewKind] = useState<'image' | 'table'>(
    initialTablePreview ? 'table' : 'image',
  );
  return (
    <Modal
      className="export-modal wide-export-modal"
      label="导出项目"
      eyebrow="保存与分享"
      title="把结构带走。"
      closeLabel="关闭导出"
      onClose={onClose}
      description="图像、Excel 和文本导出当前产品；JSON 保存全部产品。"
    >
      <ExportWorkspace
        project={project}
        productId={productId}
        layout={layout}
        onLayoutChange={onLayoutChange}
        collapsed={collapsed}
        full={full}
        previewKind={previewKind}
        table={table}
        onTableChange={onTableChange}
        previewHeader={
          <>
            <div className="table-preview-tabs" role="group" aria-label="导出预览类型">
              <button
                type="button"
                className={previewKind === 'image' ? 'active' : ''}
                onClick={() => setPreviewKind('image')}
              >
                图像预览
              </button>
              <button
                type="button"
                className={previewKind === 'table' ? 'active' : ''}
                onClick={() => setPreviewKind('table')}
              >
                Excel 组合表预览
              </button>
            </div>
            <div className="export-scope">
              <span>图像 / Excel 内容</span>
              <label>
                <input
                  type="radio"
                  name="export-scope"
                  checked={full}
                  onChange={() => onFullChange(true)}
                />
                完整产品结构
              </label>
              <label>
                <input
                  type="radio"
                  name="export-scope"
                  checked={!full}
                  onChange={() => onFullChange(false)}
                />
                当前展开结构
              </label>
            </div>
          </>
        }
      >
        <div className="export-options">
          {formats.map(({ kind, icon: Icon, title, description }) => (
            <button key={kind} onClick={() => void onExport(kind)}>
              <span className="export-icon">
                <Icon size={21} />
              </span>
              <div>
                <strong>{title}</strong>
                <span>{description}</span>
              </div>
              <ArrowUpRight size={17} />
            </button>
          ))}
        </div>
      </ExportWorkspace>
      <div className="modal-note">
        <ShieldCheck size={15} />
        下载到本地，不会自动共享给其他人。
      </div>
    </Modal>
  );
}
