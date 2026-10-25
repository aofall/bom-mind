import { ArrowRight, GitBranch } from 'lucide-react';
import { Modal } from './Modal';
import { getMappingError } from '../core/mapping';
import { FIELDS, FIELD_LABELS, REQUIRED, type Mapping, type SheetInfo } from '../core/types';
const number = (value: number) => value.toLocaleString('zh-CN');
interface Props {
  fileName: string;
  sheets: SheetInfo[];
  sheetName: string;
  headerRow: number;
  mapping: Mapping;
  remember: boolean;
  busy: boolean;
  error: string;
  onSheetChange: (name: string) => void;
  onHeaderRowChange: (row: number) => void;
  onMappingChange: (mapping: Mapping) => void;
  onRememberChange: (remember: boolean) => void;
  onParse: () => void;
  onClose: () => void;
}
export function ImportDialog({
  fileName,
  sheets,
  sheetName,
  headerRow,
  mapping,
  remember,
  busy,
  error,
  onSheetChange,
  onHeaderRowChange,
  onMappingChange,
  onRememberChange,
  onParse,
  onClose,
}: Props) {
  const sheet = sheets.find((item) => item.name === sheetName);
  const header = sheet?.preview[headerRow] ?? [];
  const validMapping = getMappingError(mapping) === null;
  return (
    <Modal
      className="import-modal"
      label="确认导入字段"
      eyebrow="导入预览"
      title="确认清单，让层级正确连接。"
      closeLabel="取消导入"
      onClose={onClose}
      description={fileName}
      footer={
        <>
          <label className="remember-control">
            <input
              type="checkbox"
              checked={remember}
              onChange={(e) => onRememberChange(e.target.checked)}
            />
            在此浏览器记住项目
          </label>
          <button className="button primary" disabled={!validMapping || busy} onClick={onParse}>
            生成结构图
            <ArrowRight size={16} />
          </button>
        </>
      }
    >
      <div className="import-config">
        <label>
          工作表
          <select value={sheetName} onChange={(e) => onSheetChange(e.target.value)}>
            {sheets.map((s) => (
              <option key={s.name}>{s.name}</option>
            ))}
          </select>
        </label>
        <label>
          表头所在行
          <select
            value={headerRow}
            onChange={(e) => {
              const row = Number(e.target.value);
              onHeaderRowChange(row);
              const headerValues = sheet?.preview[row] ?? [];
              onMappingChange(
                Object.fromEntries(
                  FIELDS.map((f) => [
                    f,
                    headerValues.findIndex((c) => String(c ?? '').trim() === FIELD_LABELS[f]),
                  ]),
                ) as Mapping,
              );
            }}
          >
            {(sheet?.preview ?? []).slice(0, 50).map((_, i) => (
              <option key={i} value={i}>
                第 {i + 1} 行
              </option>
            ))}
          </select>
        </label>
        <div className="sheet-size">
          <b>{number(sheet?.rowCount ?? 0)}</b>
          <span>原表行数（含表头）</span>
        </div>
      </div>
      <div className="mapping-heading">
        <strong>字段映射</strong>
        <span>带 * 为建立结构所需字段</span>
      </div>
      <div className="mapping-grid">
        {FIELDS.map((f) => (
          <label key={f}>
            {FIELD_LABELS[f]}
            {REQUIRED.includes(f) && <em> *</em>}
            <select
              value={mapping[f]}
              onChange={(e) => onMappingChange({ ...mapping, [f]: Number(e.target.value) })}
            >
              <option value={-1}>未映射</option>
              {Array.from({ length: sheet?.columnCount ?? 0 }, (_, i) => (
                <option key={i} value={i}>
                  {String.fromCharCode(65 + i)} · {String(header[i] ?? '无标题')}
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>
      <div className="preview-table-wrap">
        <table className="preview-table">
          <thead>
            <tr>
              <th>原行号</th>
              {FIELDS.map((f) => (
                <th key={f}>{FIELD_LABELS[f]}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(sheet?.preview ?? []).slice(headerRow + 1, headerRow + 6).map((r, i) => (
              <tr key={i}>
                <td>{headerRow + i + 2}</td>
                {FIELDS.map((f) => (
                  <td key={f}>{String(r[mapping[f]] ?? '—')}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="import-rule">
        <GitBranch size={17} />
        <p>
          保持原始行序。每个节点在遇到同级、更高层级或产品切换时结束管辖；同码材料按出现位置分别保留。
        </p>
      </div>
      {error && (
        <p className="inline-error" role="alert">
          {error}
        </p>
      )}
    </Modal>
  );
}
