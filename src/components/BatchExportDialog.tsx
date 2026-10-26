import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowDownToLine, LoaderCircle } from 'lucide-react';
import { Modal } from './Modal';
import { download } from '../core/export';
import {
  exportProductBatch,
  productDirectoryCsv,
  selectedProducts,
  type BatchArchive,
  type BatchFormat,
  type BatchProgress,
  type BatchSummary,
} from '../core/batch-export';
import type { Project } from '../core/types';
import type { ExportLayoutOptions } from '../core/export-layout';
import { ExportWorkspace } from './ExportWorkspace';
import { BatchPreviewPicker } from './BatchPreviewPicker';
import type { TableOptions } from '../core/hierarchy-table';

interface Props {
  project: Project;
  selectedIds: Set<string>;
  onClose: () => void;
  layout: ExportLayoutOptions;
  onLayoutChange: (value: ExportLayoutOptions) => void;
  table: TableOptions;
  onTableChange: (value: TableOptions) => void;
}
export function BatchExportDialog({
  project,
  selectedIds,
  onClose,
  layout,
  onLayoutChange,
  table,
  onTableChange,
}: Props) {
  const [ids] = useState(() => new Set(selectedIds));
  const [products] = useState(() => selectedProducts(project, ids));
  const [previewId, setPreviewId] = useState(() => products[0]?.id ?? '');
  const [format, setFormat] = useState<BatchFormat>('svg');
  const [phase, setPhase] = useState<'idle' | 'running' | 'ready' | 'done' | 'cancelled' | 'error'>(
    'idle',
  );
  const [progress, setProgress] = useState<BatchProgress | null>(null);
  const [archive, setArchive] = useState<BatchArchive | null>(null);
  const [summary, setSummary] = useState<BatchSummary | null>(null);
  const [error, setError] = useState('');
  const controller = useRef<AbortController | null>(null);
  const mounted = useRef(true);
  const downloadButton = useRef<HTMLButtonElement>(null);
  const cancelButton = useRef<HTMLButtonElement>(null);
  const pending = useRef<{ resolve: () => void; reject: (error: unknown) => void } | null>(null);
  const abortPendingExport = useCallback(() => {
    controller.current?.abort();
    pending.current?.reject(new DOMException('已取消导出', 'AbortError'));
    pending.current = null;
  }, []);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      abortPendingExport();
    };
  }, [abortPendingExport]);
  useEffect(() => {
    if (phase === 'ready') {
      downloadButton.current?.focus();
    } else if (phase === 'running') {
      cancelButton.current?.focus();
    }
  }, [phase]);
  const running = phase === 'running' || phase === 'ready';
  function cancel() {
    abortPendingExport();
    setArchive(null);
  }
  async function start() {
    if (controller.current) return;
    const job = new AbortController();
    controller.current = job;
    setPhase('running');
    setSummary(null);
    setError('');
    setProgress(null);
    try {
      const result = await exportProductBatch({
        project,
        ids,
        format,
        layout,
        table,
        signal: job.signal,
        onProgress: (next) => {
          if (mounted.current) {
            setProgress(next);
          }
        },
        onArchive: (next) =>
          new Promise<void>((resolve, reject) => {
            if (job.signal.aborted || !mounted.current) {
              reject(new DOMException('已取消导出', 'AbortError'));
              return;
            }
            pending.current = { resolve, reject };
            setArchive(next);
            setPhase('ready');
          }),
      });
      if (mounted.current) {
        setSummary(result);
        setPhase('done');
      }
    } catch (cause) {
      if (mounted.current) {
        setArchive(null);
        if (job.signal.aborted) {
          setPhase('cancelled');
        } else {
          setError(cause instanceof Error ? cause.message : '批量导出失败');
          setPhase('error');
        }
      }
    } finally {
      if (controller.current === job) {
        controller.current = null;
      }
    }
  }
  function saveArchive() {
    if (!archive) return;
    download(archive.blob, archive.name);
    setArchive(null);
    setPhase('running');
    pending.current?.resolve();
    pending.current = null;
  }
  return (
    <Modal
      className="batch-modal wide-export-modal"
      label="批量导出产品"
      eyebrow="批量导出"
      title={`已选 ${products.length.toLocaleString('zh-CN')} 个产品`}
      closeLabel="关闭批量导出"
      onClose={onClose}
      description="按原目录顺序导出，每个产品保留完整结构。"
      footer={
        <>
          {running ? (
            <button ref={cancelButton} className="button outline" onClick={cancel}>
              取消导出
            </button>
          ) : (
            <button className="button outline" onClick={onClose}>
              关闭
            </button>
          )}
          <button
            className="button primary"
            disabled={running || !products.length}
            onClick={() => void start()}
          >
            {running && <LoaderCircle size={15} className="spin" />}
            {phase === 'done' || phase === 'cancelled' || phase === 'error'
              ? '重新生成 ZIP'
              : '生成 ZIP'}
          </button>
        </>
      }
    >
      <ExportWorkspace
        project={project}
        productId={previewId}
        layout={layout}
        onLayoutChange={onLayoutChange}
        disabled={running}
        previewKind={format === 'xlsx' ? 'table' : 'image'}
        table={table}
        onTableChange={onTableChange}
        previewHeader={
          <BatchPreviewPicker products={products} productId={previewId} onChange={setPreviewId} />
        }
      >
        <div className="batch-content">
          <button
            className="button outline directory-csv"
            disabled={running}
            onClick={() =>
              download(productDirectoryCsv(products), '产品目录.csv', 'text/csv;charset=utf-8')
            }
          >
            <ArrowDownToLine size={16} />
            仅下载已选产品目录 CSV
          </button>
          <fieldset disabled={running} className="batch-formats">
            <legend>产品结构格式</legend>
            {(['svg', 'text', 'png', 'xlsx'] as const).map((kind) => (
              <label key={kind}>
                <input
                  type="radio"
                  name="batch-format"
                  value={kind}
                  checked={format === kind}
                  onChange={() => setFormat(kind)}
                />
                {kind === 'svg'
                  ? 'SVG 矢量图'
                  : kind === 'text'
                    ? '缩进文本'
                    : kind === 'xlsx'
                      ? 'Excel 组合表'
                      : 'PNG 图片'}
              </label>
            ))}
          </fieldset>
          <p className="batch-note">
            ZIP 包含每个产品的结构文件、目录 CSV 和导出结果。较大任务按约 32 MB
            原始文件大小分包；下载当前包后继续下一包，单个产品文件不拆分。
          </p>
          {format === 'png' && (
            <p className="batch-note">
              PNG 按产品逐个生成，耗时比 SVG 和文本更长；大图会按现有图片尺寸上限缩放。
            </p>
          )}
          {progress && (
            <div className="batch-progress" role="status">
              <strong>
                {phase === 'ready'
                  ? `第 ${progress.part} 包已准备好`
                  : progress.phase === 'packing' && running
                    ? `正在打包第 ${progress.part} 包…`
                    : `已处理 ${progress.done.toLocaleString('zh-CN')} / ${progress.total.toLocaleString('zh-CN')}`}
              </strong>
              <progress max={progress.total} value={progress.done} aria-label="批量导出进度" />
              <span>
                成功 {progress.success} 项，失败 {progress.failed} 项
              </span>
            </div>
          )}
          {archive && (
            <button
              ref={downloadButton}
              className="button primary archive-download"
              onClick={saveArchive}
            >
              <ArrowDownToLine size={16} />
              {archive.last ? '下载 ZIP' : `下载第 ${archive.part} 包并继续`}
            </button>
          )}
          {phase === 'done' && summary && (
            <p className="batch-result" role="status">
              导出完成：成功 {summary.success} 项，失败 {summary.failed} 项，共下载 {summary.parts}{' '}
              个 ZIP。{summary.failed > 0 && '失败原因见包内导出结果。'}
            </p>
          )}
          {phase === 'cancelled' && (
            <p className="batch-result" role="status">
              已取消导出。此前下载的 ZIP 仍可使用，尚未下载的内容已释放。
            </p>
          )}
          {error && (
            <p className="batch-error" role="alert">
              {error}
            </p>
          )}
        </div>
      </ExportWorkspace>
    </Modal>
  );
}
