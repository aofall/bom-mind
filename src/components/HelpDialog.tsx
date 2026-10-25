import { ShieldCheck } from 'lucide-react';
import { Modal } from './Modal';

interface Props {
  onClose: () => void;
}
export function HelpDialog({ onClose }: Props) {
  return (
    <Modal
      className="help-modal"
      label="使用说明"
      eyebrow="BOM MIND"
      title="按顺序，读懂每一层。"
      closeLabel="关闭说明"
      onClose={onClose}
    >
      <div className="help-content">
        <h3>1. 导入完整 BOM</h3>
        <p>
          选择 .xls 或 .xlsx，确认工作表和字段。层次支持 .1、..2、...3
          或正整数。产品代码、层次和材料代码是必需字段。
        </p>
        <h3>2. 严格保留分支边界</h3>
        <p>
          每个节点只管理后续更深层级。遇到同级、更高层级或产品变化就结束。不能先排序，也不会按照材料代码跨分支合并。
        </p>
        <div className="rule-example">
          1 → 2 → 3 → 2 → 3 → 1<small>两个 2 各有自己的 3，最后一个 1 开启新分支。</small>
        </div>
        <h3>3. 数量与材料类别</h3>
        <p>数量按原表显示，空值为“未提供”，未进行逐层相乘或累计计算。</p>
        <h3>4. 全量目录与批量导出</h3>
        <p>
          滚动目录可浏览全部产品。勾选框用于批量选择，产品名称用于查看结构。全选搜索结果只作用于当前匹配范围，选择全部产品则覆盖整个项目。批量导出始终生成每个已选产品的完整结构。
        </p>
        <h3>5. 保存和换设备使用</h3>
        <p>
          JSON 保存全部产品及原始记录，导入即可重建。“记住项目”只保存到当前浏览器。换设备请携带原始
          Excel 或导出的 JSON。
        </p>
        <p className="help-privacy">
          <ShieldCheck size={17} />
          文件在浏览器本地解析，不上传材料内容。
          {import.meta.env.MODE === 'legacy' ? '本地文件版无需联网。' : '网页首次访问需要网络。'}
        </p>
      </div>
    </Modal>
  );
}
