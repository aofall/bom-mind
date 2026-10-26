import { forwardRef, useImperativeHandle, useRef } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import type { HierarchyTableModel, TableCell } from '../core/hierarchy-table';

function CellLines({ cell }: { cell: TableCell }) {
  return (
    <>
      {cell.lines.map((line, index) => (
        <span
          key={index}
          className={line.field === 'name' ? 'table-node-name' : 'table-node-meta'}
          style={{ fontSize: line.size, lineHeight: `${Math.ceil(line.size * 1.6)}px` }}
        >
          {line.text || '\u00a0'}
        </span>
      ))}
    </>
  );
}
export interface TableHandle {
  focus: (id: string) => void;
}
interface Props {
  model: HierarchyTableModel;
  selected?: string;
  matches?: ReadonlySet<string>;
  onSelect?: (id: string) => void;
  onToggle?: (id: string) => void;
}
export const HierarchyTable = forwardRef<TableHandle, Props>(function HierarchyTable(
  { model, selected, matches, onSelect, onToggle },
  ref,
) {
  const viewport = useRef<HTMLDivElement>(null);
  useImperativeHandle(ref, () => ({
    focus(id) {
      viewport.current
        ?.querySelector<HTMLElement>(`[data-table-node-id="${CSS.escape(id)}"]`)
        ?.scrollIntoView({ block: 'center', inline: 'center', behavior: 'smooth' });
    },
  }));
  return (
    <div
      ref={viewport}
      className="hierarchy-table-viewport"
      tabIndex={0}
      aria-label="产品层级组合表，可横向和纵向滚动"
    >
      <table
        className="hierarchy-table"
        style={{
          width: model.columns * model.options.columnWidth,
          fontSize: model.options.fontSize,
        }}
      >
        <caption>
          <strong>
            {model.product.name} [{model.product.code}]
          </strong>
          <span>
            {model.product.spec || '产品规格未提供'} ·{' '}
            {model.full ? '完整产品结构' : '当前展开结构'}
          </span>
          <small>— 无更深层材料 · … 下级已折叠 · 数量按原表显示，不累计、不换算</small>
        </caption>
        <colgroup>
          {Array.from({ length: model.columns }, (_, column) => (
            <col key={column} style={{ width: model.options.columnWidth }} />
          ))}
        </colgroup>
        <thead>
          <tr>
            {Array.from({ length: model.columns }, (_, column) => (
              <th key={column} scope="col">
                {column + 1} 级材料
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {model.rows.map((row, index) => (
            <tr key={index} style={{ height: model.rowHeights[index] }}>
              {row.map((cell) =>
                cell.kind === 'empty' ? (
                  <td
                    key={cell.column}
                    className="table-empty"
                    title={cell.folded ? '下级已折叠' : '该分支没有更深层材料'}
                  >
                    {cell.folded ? '…' : '—'}
                  </td>
                ) : (
                  <td
                    key={cell.column}
                    rowSpan={cell.rowSpan}
                    data-table-node-id={cell.node.id}
                    className={`table-cell ${cell.node.children.length ? 'branch' : ''} ${selected === cell.node.id ? 'selected' : ''} ${matches?.has(cell.node.id) ? 'match' : ''}`}
                  >
                    {onSelect ? (
                      <button
                        type="button"
                        className="table-node"
                        aria-label={`选择节点 ${cell.node.name}`}
                        aria-pressed={selected === cell.node.id}
                        onClick={() => onSelect(cell.node.id)}
                      >
                        <CellLines cell={cell} />
                      </button>
                    ) : (
                      <div className="table-node">
                        <CellLines cell={cell} />
                      </div>
                    )}
                    {!model.full && cell.node.children.length > 0 && onToggle && (
                      <button
                        type="button"
                        className="table-branch-toggle"
                        aria-label={`${cell.folded ? '展开' : '收起'}表格节点 ${cell.node.name}`}
                        onClick={() => onToggle(cell.node.id)}
                      >
                        {cell.folded ? <ChevronRight size={13} /> : <ChevronDown size={13} />}{' '}
                        {cell.folded ? '展开下级' : '收起下级'}
                      </button>
                    )}
                  </td>
                ),
              )}
            </tr>
          ))}
          {!model.rows.length && (
            <tr>
              <td colSpan={model.columns} className="table-empty-message">
                {model.full
                  ? '没有可展示的有效材料节点，请查看数据异常。'
                  : '产品根节点已折叠，可选择完整结构或展开产品根节点。'}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
});
