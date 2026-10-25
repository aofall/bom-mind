import { AlertCircle, Check, ChevronRight } from 'lucide-react';
import { Modal } from './Modal';
import type { Issue, Product } from '../core/types';
const number = (value: number) => value.toLocaleString('zh-CN');
interface Props {
  issues: Issue[];
  products: Product[];
  scope: 'all' | 'product';
  onScopeChange: (scope: 'all' | 'product') => void;
  onIssue: (issue: Issue) => void;
  onClose: () => void;
}
export function IssuesDialog({ issues, products, scope, onScopeChange, onIssue, onClose }: Props) {
  return (
    <Modal
      className="issues-modal"
      label="导入异常与提示"
      eyebrow="数据检查"
      title="保留问题，也保留线索。"
      closeLabel="关闭数据检查"
      onClose={onClose}
      description="缺少数量不影响结构；缺少父项的分支不会自动猜测挂接。"
    >
      <div className="issue-filter">
        <div className="view-tabs">
          <button
            className={scope === 'product' ? 'active' : ''}
            onClick={() => onScopeChange('product')}
          >
            当前产品
          </button>
          <button className={scope === 'all' ? 'active' : ''} onClick={() => onScopeChange('all')}>
            全部产品
          </button>
        </div>
        <span>{number(issues.length)} 项</span>
      </div>
      <div className="issues-list">
        {issues.slice(0, 500).map((issue) => (
          <button key={issue.id} onClick={() => onIssue(issue)}>
            <AlertCircle size={17} className={issue.severity === 'error' ? 'red' : 'amber-text'} />
            <div>
              <strong>
                第 {issue.row} 行{' '}
                <span>{issue.severity === 'error' ? '结构异常' : '数据提示'}</span>
              </strong>
              <p>{issue.message}</p>
              <small>{products.find((p) => p.id === issue.productId)?.name || '未识别产品'}</small>
            </div>
            <ChevronRight size={17} />
          </button>
        ))}
        {issues.length > 500 && (
          <p className="list-footnote">已显示前 500 条，可切换到具体产品查看。</p>
        )}
        {!issues.length && (
          <div className="empty-small">
            <Check size={28} />
            <p>当前范围未发现导入异常</p>
          </div>
        )}
      </div>
    </Modal>
  );
}
