import {
  ArrowDownToLine,
  GitBranch,
  FileText,
  FileJson,
  ArrowUpRight,
  ShieldCheck,
  type LucideIcon,
} from 'lucide-react';
import { Modal } from './Modal';
import type { ProductExportFormat } from '../core/product-export';
import type { ExportLayoutOptions } from '../core/export-layout';
import type { Project } from '../core/types';
import { ExportLayoutSettings } from './ExportLayoutSettings';
import { ExportImageSize } from './ExportImageSize';

interface Props {
  project: Project;
  productId: string;
  collapsed: Set<string>;
  layout: ExportLayoutOptions;
  onLayoutChange: (value: ExportLayoutOptions) => void;
  sampleTitle?: string;
  full: boolean;
  onFullChange: (full: boolean) => void;
  onExport: (kind: ProductExportFormat | 'json') => void;
  onClose: () => void;
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
  sampleTitle,
  full,
  onFullChange,
  onExport,
  onClose,
}: Props) {
  return (
    <Modal
      className="export-modal"
      label="导出项目"
      eyebrow="保存与分享"
      title="把结构带走。"
      closeLabel="关闭导出"
      onClose={onClose}
      description="图像和文本导出当前产品；JSON 保存全部产品。"
    >
      <div className="export-scope">
        <span>图片内容</span>
        <label>
          <input type="radio" checked={full} onChange={() => onFullChange(true)} />
          完整产品结构
        </label>
        <label>
          <input type="radio" checked={!full} onChange={() => onFullChange(false)} />
          当前展开结构
        </label>
      </div>
      <ExportLayoutSettings value={layout} onChange={onLayoutChange} sampleTitle={sampleTitle} />
      <ExportImageSize
        project={project}
        productId={productId}
        full={full}
        collapsed={collapsed}
        layout={layout}
      />
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
      <div className="modal-note">
        <ShieldCheck size={15} />
        下载到本地，不会自动共享给其他人。
      </div>
    </Modal>
  );
}
