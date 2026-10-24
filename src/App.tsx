import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent } from 'react';
import { AlertCircle, ArrowDownToLine, ArrowLeft, ArrowRight, ArrowUpRight, Box, Boxes, Check, ChevronDown, ChevronRight, CircleHelp, FileJson, FileSpreadsheet, FileText, FolderOpen, GitBranch, Layers3, ListTree, LoaderCircle, Maximize2, Minus, PanelLeftClose, PanelRightClose, Plus, Search, ShieldCheck, Sparkles, Upload, X, ZoomIn, ZoomOut } from 'lucide-react';
import { BomGraph, type GraphHandle } from './components/BomGraph';
import { ancestry, deserializeProject, quantityLabel, serializeProject } from './core/parser';
import { buildSvg, download, exportText, nodeKind, safeFileName, svgToPng, visibleNodeIds } from './core/export';
import { makeDemo } from './core/demo';
import { loadRecent, saveRecent } from './core/storage';
import { FIELDS, FIELD_LABELS, REQUIRED, type BomNode, type Cell, type Issue, type Mapping, type Project, type SheetInfo } from './core/types';

const number = (v: number) => v.toLocaleString('zh-CN');
const DEFAULT_MAPPING = Object.fromEntries(FIELDS.map(f => [f, -1])) as Mapping;
function initialCollapse(project: Project, rootId: string, depth = 2): Set<string> {
  return new Set(Object.values(project.nodes).filter(n => n.productId === rootId && n.level >= depth && n.children.length).map(n => n.id));
}
function App() {
  const [project, setProject] = useState<Project | null>(null), [productId, setProductId] = useState(''), [selectedId, setSelectedId] = useState('');
  const [collapsed, setCollapsed] = useState(new Set<string>()), [view, setView] = useState<'graph' | 'outline'>('graph');
  const [productSearch, setProductSearch] = useState(''), [materialSearch, setMaterialSearch] = useState('');
  const [busy, setBusy] = useState(''), [toast, setToast] = useState(''), [error, setError] = useState(''), [dragging, setDragging] = useState(false);
  const [sheets, setSheets] = useState<SheetInfo[] | null>(null), [sheetName, setSheetName] = useState(''), [headerRow, setHeaderRow] = useState(0), [mapping, setMapping] = useState<Mapping>(DEFAULT_MAPPING), [fileName, setFileName] = useState('');
  const [remember, setRemember] = useState(false), [recentAvailable, setRecentAvailable] = useState(false);
  const [showExport, setShowExport] = useState(false), [exportFull, setExportFull] = useState(true), [showIssues, setShowIssues] = useState(false), [issueScope, setIssueScope] = useState<'all' | 'product'>('product');
  const [help, setHelp] = useState(false), [leftOpen, setLeftOpen] = useState(false), [rightOpen, setRightOpen] = useState(false), [rawIssue, setRawIssue] = useState<Issue | null>(null);
  const fileInput = useRef<HTMLInputElement>(null), worker = useRef<Worker | null>(null), graph = useRef<GraphHandle>(null), revision = useRef(0);
  const applyProject = useCallback((next: Project) => {
    const first = next.products[0]?.id ?? '';
    setProject(next); setProductId(first); setSelectedId(first); setCollapsed(initialCollapse(next, first));
    setProductSearch(''); setMaterialSearch(''); setRawIssue(null); setLeftOpen(false); setError('');
  }, []);
  useEffect(() => {
    let active = true; const rev = revision.current;
    loadRecent().then(recent => { if (active && rev === revision.current && recent) { applyProject(recent); setRemember(true); setRecentAvailable(true); } }).catch(() => {});
    return () => { active = false; };
  }, [applyProject]);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(''), 4500); return () => clearTimeout(t); }, [toast]);
  useEffect(() => {
    if (!project || !remember) return;
    const t = setTimeout(() => { saveRecent(project).then(() => setRecentAvailable(true)).catch(() => setToast('浏览器未能保存项目，请导出 JSON 备份')); }, 350);
    return () => clearTimeout(t);
  }, [project, remember]);
  useEffect(() => () => worker.current?.terminate(), []);
  useEffect(() => {
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape') { setHelp(false); setShowExport(false); setShowIssues(false); setLeftOpen(false); setRightOpen(false); if (sheets) { setSheets(null); setBusy(''); worker.current?.terminate(); } } };
    window.addEventListener('keydown', close); return () => window.removeEventListener('keydown', close);
  }, [sheets]);
  const modalOpen = !!sheets || showExport || showIssues || help;
  useEffect(() => {
    if (!modalOpen) return;
    const previous = document.activeElement as HTMLElement | null;
    const dialog = document.querySelector<HTMLElement>('[role="dialog"]');
    const focusable = () => Array.from(dialog?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), [tabindex="0"]') ?? []);
    focusable()[0]?.focus();
    const trap = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return;
      const items = focusable(), first = items[0], last = items.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener('keydown', trap);
    return () => { document.removeEventListener('keydown', trap); if (previous?.isConnected) previous.focus(); };
  }, [modalOpen]);
  const product = project?.products.find(p => p.id === productId), selected = project?.nodes[selectedId];
  const products = useMemo(() => {
    const term = productSearch.trim().toLowerCase();
    return project?.products.filter(p => !term || `${p.code} ${p.name} ${p.spec}`.toLowerCase().includes(term)) ?? [];
  }, [project, productSearch]);
  const productNodes = useMemo(() => project ? Object.values(project.nodes).filter(n => n.productId === productId) : [], [project, productId]);
  const matchedIds = useMemo(() => {
    const term = materialSearch.trim().toLowerCase();
    return new Set(term ? productNodes.filter(n => `${n.code} ${n.name} ${n.spec}`.toLowerCase().includes(term)).map(n => n.id) : []);
  }, [productNodes, materialSearch]);
  const matches = [...matchedIds];
  const path = project && selected ? ancestry(project, selected.id).map(id => project.nodes[id]) : [];
  const visible = project && productId ? visibleNodeIds(project, productId, collapsed) : [];
  const issues = project?.issues.filter(i => issueScope === 'all' || i.productId === productId) ?? [];
  const selectionCount = selected ? productNodes.filter(n => n.code === selected.code && n.level > 0).length : 0;
  const changeProduct = useCallback((id: string) => {
    if (!project) return;
    setProductId(id); setSelectedId(id); setCollapsed(initialCollapse(project, id)); setMaterialSearch(''); setLeftOpen(false); setRawIssue(null); graph.current?.reset();
  }, [project]);
  const selectNode = useCallback((id: string) => { setSelectedId(id); setRawIssue(null); }, []);
  const toggleNode = useCallback((id: string) => { setCollapsed(previous => { const next = new Set(previous); if (next.has(id)) next.delete(id); else next.add(id); return next; }); }, []);
  function focusNode(id: string) {
    if (!project) return;
    const p = project.nodes[id].productId;
    if (p !== productId) { setProductId(p); setMaterialSearch(''); setCollapsed(initialCollapse(project, p)); }
    const parents = ancestry(project, id);
    setCollapsed(previous => { const next = new Set(previous); parents.forEach(x => next.delete(x)); return next; });
    selectNode(id); setTimeout(() => graph.current?.focus(id), 150);
  }
  useEffect(() => {
    if (!project || !materialSearch.trim()) return;
    setCollapsed(previous => { const next = new Set(previous); matchedIds.forEach(id => ancestry(project, id).forEach(p => next.delete(p))); return next; });
  }, [project, materialSearch, matchedIds]);
  function cancelImport() { worker.current?.terminate(); worker.current = null; setBusy(''); setSheets(null); }
  async function openFile(file: File) {
    revision.current++; cancelImport(); setError(''); setFileName(file.name);
    try {
      if (/\.json$/i.test(file.name)) {
        setBusy('正在恢复项目…'); const next = deserializeProject(await file.text()); applyProject(next); setBusy(''); setToast(`已恢复 ${number(next.stats.products)} 个产品`); return;
      }
      if (!/\.xlsx?$/i.test(file.name)) throw new Error('请选择 .xls、.xlsx 或 BOM Mind 导出的 .json 文件');
      setBusy('正在读取文件…');
      const parser = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' }); worker.current = parser;
      parser.onerror = () => { setError('文件读取失败，请检查文件格式后重新导入'); setBusy(''); parser.terminate(); };
      parser.onmessage = event => {
        const data = event.data;
        if (data.type === 'progress') setBusy(data.message);
        if (data.type === 'error') { setBusy(''); setError(data.message); }
        if (data.type === 'sheets') {
          const items = data.sheets as SheetInfo[]; setSheets(items);
          const best = [...items].sort((a, b) => FIELDS.filter(f => b.mapping[f] >= 0).length - FIELDS.filter(f => a.mapping[f] >= 0).length || b.rowCount - a.rowCount)[0];
          if (!best) { setError('文件没有可读取的工作表'); setBusy(''); return; }
          setSheetName(best.name); setHeaderRow(best.headerRow); setMapping(best.mapping); setBusy('');
        }
        if (data.type === 'project') { const next = data.project as Project; applyProject(next); setSheets(null); setBusy(''); setToast(`已还原 ${number(next.stats.products)} 个产品、${number(next.stats.records)} 条明细`); parser.terminate(); worker.current = null; }
      };
      const buffer = await file.arrayBuffer(); parser.postMessage({ type: 'open', payload: { buffer } }, [buffer]);
    } catch (e) { setError(e instanceof Error ? e.message : '文件读取失败'); setBusy(''); }
  }
  function onFileInput(event: ChangeEvent<HTMLInputElement>) { const file = event.target.files?.[0]; if (file) void openFile(file); event.target.value = ''; }
  function onDrop(event: DragEvent) { event.preventDefault(); setDragging(false); const file = event.dataTransfer.files[0]; if (file) void openFile(file); }
  function parseSelected() {
    setError(''); setBusy('正在生成产品结构…');
    worker.current?.postMessage({ type: 'parse', payload: { sheetName, headerRow, mapping, source: { id: crypto.randomUUID(), fileName, sheetName, importedAt: new Date().toISOString() } } });
  }
  function selectSheet(name: string) { const sheet = sheets?.find(s => s.name === name); if (!sheet) return; setSheetName(name); setHeaderRow(sheet.headerRow); setMapping(sheet.mapping); }
  async function exportFile(kind: 'json' | 'svg' | 'png' | 'text') {
    if (!project || !product) return;
    try {
      if (kind === 'json') download(serializeProject(project), `${safeFileName(project.source.fileName.replace(/\.[^.]+$/, ''))}.bom-mind.json`, 'application/json');
      else if (kind === 'text') download(exportText(project, productId), `${safeFileName(product.name)}.txt`);
      else { setBusy('正在生成导出图片…'); const output = buildSvg(project, productId, collapsed, exportFull); const name = `${safeFileName(product.name)}-${exportFull ? '完整' : '当前视图'}`; if (kind === 'svg') download(output.svg, `${name}.svg`, 'image/svg+xml;charset=utf-8'); else download(await svgToPng(output.svg, output.width, output.height), `${name}.png`); }
      setShowExport(false); setToast('已生成下载文件');
    } catch (e) { setError(e instanceof Error ? e.message : '导出失败'); } finally { setBusy(''); }
  }
  function openIssue(issue: Issue) { if (issue.productId) { setProductId(issue.productId); setCollapsed(initialCollapse(project!, issue.productId)); } if (issue.nodeId) focusNode(issue.nodeId); else { setRawIssue(issue); setSelectedId(issue.productId ?? ''); } setShowIssues(false); setRightOpen(true); }
  const sheet = sheets?.find(s => s.name === sheetName), header = sheet?.preview[headerRow] ?? [];
  const validMapping = REQUIRED.every(f => mapping[f] >= 0) && new Set(FIELDS.map(f => mapping[f]).filter(v => v >= 0)).size === FIELDS.filter(f => mapping[f] >= 0).length;
  return <div className={`app ${dragging ? 'is-dragging' : ''}`} onDragOver={e => { e.preventDefault(); if (e.dataTransfer.types.includes('Files')) setDragging(true); }} onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragging(false); }} onDrop={onDrop}>
    <input ref={fileInput} className="visually-hidden" type="file" accept=".xls,.xlsx,.json" onChange={onFileInput} aria-label="选择 Excel 或 JSON 项目文件" />
    <header className="app-header">
      <a className="brand" href="#" onClick={e => e.preventDefault()}><span className="brand-mark"><Layers3 size={23} strokeWidth={1.7} /></span><span>BOM<span className="brand-light"> Mind</span><small>物料结构工作台</small></span></a>
      <div className="header-divider" /><span className="header-context">从产品，看见每一层组成</span>
      <div className="header-actions"><span className="local-status"><span className="status-dot" />浏览器本地处理</span><button className="icon-button help-button" aria-label="查看使用说明" onClick={() => setHelp(true)}><CircleHelp size={19} /></button><button className="button primary" onClick={() => fileInput.current?.click()} disabled={!!busy}><Upload size={16} />导入文件</button></div>
    </header>
    {!project ? <main className="welcome">
      <div className="welcome-copy"><span className="eyebrow"><span />EXCEL → PRODUCT STRUCTURE</span><h1>一张物料清单，<br />清晰的产品全貌。</h1><p>把导出的 BOM 转成可探索的结构图。<br />从成品到半成品，再到每一项原材料，沿着层级一目了然。</p><div className="welcome-tags"><span><Check size={14} />保留原始层级</span><span><Check size={14} />按产品独立展开</span><span><Check size={14} />无需上传数据</span></div><div className="mini-flow" aria-label="产品、半成品、原材料组成示意"><div className="mini-node dark"><Box size={19} /><span>成品</span></div><div className="mini-connector" /><div className="mini-node"><Boxes size={19} /><span>半成品</span></div><div className="mini-connector" /><div className="mini-node pale"><Layers3 size={19} /><span>原材料</span></div></div></div>
      <section className="import-card"><div className="import-card-top"><span className="step-tag">01 / 开始探索</span><span className="small-muted">.xls / .xlsx / .json</span></div><div className="upload-zone" role="button" tabIndex={0} onClick={() => fileInput.current?.click()} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInput.current?.click(); } }}><span className="upload-symbol"><FileSpreadsheet size={32} strokeWidth={1.4} /></span><h2>将 BOM 文件拖到这里</h2><p>或点击选择本地文件</p><span className="button primary">选择文件<ArrowUpRight size={16} /></span><span className="upload-note">自动识别工作表与字段，导入前可预览</span></div><div className="import-bottom"><ShieldCheck size={17} /><p>文件在当前设备内解析<br /><span>材料内容不会发送到服务器</span></p></div><button className="demo-button" onClick={() => { revision.current++; applyProject(makeDemo()); }}><Sparkles size={16} /><span>先用演示数据体验</span><ArrowRight size={16} /></button>{recentAvailable && <span className="small-muted">此浏览器已保存最近项目</span>}</section>
      <div className="welcome-footer"><span>为多层 BOM 而设计</span><span>导入清单<ChevronRight size={13} />选择产品<ChevronRight size={13} />探索结构<ChevronRight size={13} />导出分享</span></div>
    </main> : <>
      <div className="project-bar"><div className="source-file"><FileSpreadsheet size={17} /><div><strong title={project.source.fileName}>{project.source.fileName}</strong><span>{project.source.sheetName}<i />{project.source.demo ? '演示项目 · 虚构数据' : '按原始行序解析'}</span></div></div><div className="project-metrics"><span><b>{number(project.stats.products)}</b> 产品</span><span><b>{number(project.stats.records)}</b> 明细</span><span><b>{project.stats.maxDepth}</b> 级材料</span></div><button className={`issue-summary ${project.issues.length ? 'has-issues' : ''}`} onClick={() => { setIssueScope('all'); setShowIssues(true); }}><AlertCircle size={15} />{project.issues.length ? `${number(project.issues.length)} 项需查看` : '无导入异常'}</button><label className="remember-control" title="只保存到此浏览器，不会跨设备同步"><input type="checkbox" checked={remember} onChange={e => { setRemember(e.target.checked); if (!e.target.checked) void saveRecent(null).then(() => { setRecentAvailable(false); setToast('已清除此浏览器保存的项目'); }).catch(() => setToast('本地记录清除失败')); }} />记住项目</label><button className="button outline compact" onClick={() => setShowExport(true)}><ArrowDownToLine size={15} />导出<ChevronDown size={13} /></button></div>
      <main className="workspace">
        <aside className={`product-sidebar ${leftOpen ? 'mobile-open' : ''}`}><div className="sidebar-heading"><span>产品目录 <b>{number(project.products.length)}</b></span><button className="icon-button mobile-close" aria-label="关闭产品目录" onClick={() => setLeftOpen(false)}><X size={17} /></button></div><div className="search-field"><Search size={15} /><input placeholder="搜索产品名称、代码…" aria-label="搜索产品" value={productSearch} onChange={e => setProductSearch(e.target.value)} />{productSearch && <button aria-label="清空产品搜索" onClick={() => setProductSearch('')}><X size={13} /></button>}</div><div className="list-caption">{productSearch ? `${number(products.length)} 个匹配产品` : '选择产品以查看组成'}</div><div className="product-list">{products.slice(0, 200).map(p => <button key={p.id} className={`product-item ${productId === p.id ? 'active' : ''}`} onClick={() => changeProduct(p.id)}><span className="product-icon"><Box size={17} /></span><span className="product-item-body"><strong>{p.name}</strong><span className="code-label">{p.code}</span><span className="product-item-meta">{p.count} 条明细<span>·</span>{p.maxDepth} 级{p.issueCount > 0 && <span className="tiny-issue">{p.issueCount} 提示</span>}</span></span><ChevronRight size={13} className="product-arrow" /></button>)}{products.length > 200 && <p className="list-footnote">已显示前 200 项，请搜索缩小范围。</p>}{!products.length && <div className="empty-small"><Search size={24} /><p>没有找到匹配产品</p><button onClick={() => setProductSearch('')}>清空搜索</button></div>}</div><div className="sidebar-footer"><GitBranch size={15} />每个产品独立建树</div></aside>
        <section className="canvas-panel"><div className="canvas-heading"><div><div className="canvas-kicker"><button className="icon-button mobile-action" aria-label="打开产品目录" onClick={() => setLeftOpen(true)}><FolderOpen size={16} /></button><span>产品结构</span><ChevronRight size={13} /><span>{product?.code}</span></div><h1>{product?.name}</h1><p>{product?.spec || '产品规格未提供'}<span>·</span>{product?.count} 个材料节点</p></div><button className="icon-button mobile-action" aria-label="查看节点详情" onClick={() => setRightOpen(true)}><ListTree size={20} /></button><span className="root-badge"><span />产品根节点 + {product?.maxDepth} 级材料</span></div>
          <div className="canvas-toolbar"><div className="view-tabs" role="group" aria-label="显示方式"><button className={view === 'graph' ? 'active' : ''} onClick={() => setView('graph')}><GitBranch size={15} />结构图</button><button className={view === 'outline' ? 'active' : ''} onClick={() => setView('outline')}><ListTree size={15} />文字树</button></div><div className="toolbar-divider" /><select className="depth-select" aria-label="展开层级" value="" onChange={e => { const depth = Number(e.target.value); setCollapsed(depth < 0 ? new Set() : initialCollapse(project, productId, depth)); }}><option value="" disabled>展开层级</option><option value="1">展开至 1 级</option><option value="2">展开至 2 级</option><option value="3">展开至 3 级</option><option value="-1">全部展开</option><option value="0">全部收起</option></select><div className="material-search search-field"><Search size={14} /><input placeholder="查找当前产品材料" aria-label="查找当前产品材料" value={materialSearch} onChange={e => setMaterialSearch(e.target.value)} />{materialSearch && <><span className="search-count">{matches.length}</span><button aria-label="定位下一条匹配材料" disabled={!matches.length} onClick={() => { const index = matches.indexOf(selectedId); focusNode(matches[(index + 1) % matches.length]); }}><ArrowRight size={14} /></button><button aria-label="清空材料搜索" onClick={() => setMaterialSearch('')}><X size={13} /></button></>}</div></div>
          <div className="canvas-body">{view === 'graph' ? <BomGraph key={productId} ref={graph} project={project} rootId={productId} collapsed={collapsed} selected={selectedId} matches={matchedIds} onSelect={selectNode} onToggle={toggleNode} /> : <div className="outline-view" role="tree" aria-label="产品物料文字树">{visible.map(id => { const node = project.nodes[id]; return <div key={id} role="treeitem" aria-level={node.level + 1} aria-expanded={node.children.length ? !collapsed.has(id) : undefined} aria-selected={selectedId === id} className={`outline-row ${selectedId === id ? 'selected' : ''} ${matchedIds.has(id) ? 'match' : ''}`} style={{ paddingLeft: 16 + node.level * 22 }}><button className="outline-toggle" aria-label={`${collapsed.has(id) ? '展开' : '收起'} ${node.name}`} disabled={!node.children.length} onClick={() => toggleNode(id)}>{node.children.length ? collapsed.has(id) ? <ChevronRight size={15} /> : <ChevronDown size={15} /> : <span className="leaf-dot" />}</button><button className="outline-content" onClick={() => { selectNode(id); setRightOpen(true); }}><span className={`outline-node-icon ${!node.level ? 'root' : ''}`}><Box size={15} /></span><span><strong>{node.name}</strong><small>{node.code} {node.spec && ` · ${node.spec}`}</small></span><span className={`outline-qty ${node.quantity == null && node.level ? 'missing' : ''}`}>{node.level ? quantityLabel(node.quantity) : '产品'}</span></button></div>; })}</div>}
            {view === 'graph' && <div className="zoom-controls"><button title="缩小" aria-label="缩小结构图" onClick={() => graph.current?.zoom(0.8)}><Minus size={17} /></button><button title="重置视图" aria-label="重置结构图视图" onClick={() => graph.current?.reset()}><Maximize2 size={16} /></button><button title="放大" aria-label="放大结构图" onClick={() => graph.current?.zoom(1.25)}><Plus size={17} /></button></div>}<div className="canvas-hint">{view === 'graph' ? '点击节点查看详情与展开 · 拖动画布平移' : '展开箭头查看下级 · 点击材料查看详情'}</div></div>
          <footer className="canvas-footer"><div><span className="legend-dot root" />产品<span className="legend-dot branch" />含下级材料<span className="legend-dot leaf" />末级材料</div><span>显示 {visible.length} / {(product?.count ?? 0) + 1} 个节点</span></footer>
        </section>
        <aside className={`detail-panel ${rightOpen ? 'mobile-open' : ''}`}><div className="detail-heading"><span>节点详情</span><button className="icon-button mobile-close" aria-label="关闭节点详情" onClick={() => setRightOpen(false)}><X size={17} /></button><span className="small-muted desktop-only">可追溯至原表</span></div>{rawIssue ? <><div className="detail-main"><span className="type-badge warning">结构异常</span><h2>原表第 {rawIssue.row} 行</h2><p className="issue-text">{rawIssue.message}</p></div><div className="detail-fields">{FIELDS.map(f => <div key={f}><dt>{FIELD_LABELS[f]}</dt><dd>{String(project.records.find(r => r.sourceRow === rawIssue.row)?.values[f] ?? '未提供')}</dd></div>)}</div></> : selected && <><div className="detail-main"><span className={`type-badge ${selected.level === 0 ? 'green' : ''}`}><Box size={12} />{nodeKind(selected)}</span><h2>{selected.name}</h2><p>{selected.spec || '规格未提供'}</p></div><dl className="detail-fields"><div><dt>{selected.level ? '材料代码' : '产品代码'}</dt><dd className="code-value">{selected.code}</dd></div><div><dt>原表层次</dt><dd>{selected.level ? <span className="level-token">{selected.levelText}</span> : '产品根节点（补充）'}</dd></div><div><dt>原表数量</dt><dd className={`quantity-value ${selected.level && selected.quantity == null ? 'missing' : ''}`}>{selected.level ? quantityLabel(selected.quantity) : '不适用'}{selected.level > 0 && <small>单位未提供</small>}</dd></div><div><dt>直接下级</dt><dd>{selected.children.length} 项{selected.children.length > 0 && <button className="text-action" onClick={() => toggleNode(selected.id)}>{collapsed.has(selected.id) ? '展开' : '收起'}<ChevronDown size={12} /></button>}</dd></div><div><dt>来源位置</dt><dd><FileSpreadsheet size={13} />{project.source.sheetName}<small>Excel 第 {selected.sourceRow} 行{!selected.level && '（产品首条明细）'}</small></dd></div></dl>{selectionCount > 1 && selected.level > 0 && <div className="detail-notice"><GitBranch size={15} /><span>此材料在本产品出现 {selectionCount} 次<br /><small>各分支独立保留，未合并数量。</small></span></div>}{selected.level > 0 && selected.quantity == null && <div className="detail-notice amber"><AlertCircle size={15} /><span>此项数量未提供<br /><small>保留空值，不按 0 或 1 处理。</small></span></div>}<div className="path-section"><h3>所属路径</h3><div className="node-path">{path.map((node, i) => <div key={node.id}><span className={`path-dot ${i === path.length - 1 ? 'active' : ''}`} /><button onClick={() => focusNode(node.id)}>{node.name}</button></div>)}</div></div>{selected.children.length > 0 && <div className="children-section"><h3>直接下级 <span>{selected.children.length}</span></h3>{selected.children.map(id => <button key={id} onClick={() => focusNode(id)}><span>{project.nodes[id].name}</span><ChevronRight size={13} /></button>)}</div>}</>}<div className="quantity-note"><ShieldCheck size={15} /><p>数量按原表显示。<br />尚未进行单位换算与累计用量计算。</p></div></aside>
      </main>
    </>}
    {error && !sheets && <div className="error-banner" role="alert"><AlertCircle size={17} /><span>{error}</span><button aria-label="关闭错误提示" onClick={() => setError('')}><X size={16} /></button></div>}
    {toast && <div className="toast" role="status"><Check size={17} />{toast}</div>}
    {dragging && <div className="drop-overlay"><Upload size={38} /><h2>松开以导入文件</h2><p>支持 Excel 和 BOM Mind JSON 项目</p></div>}
    {busy && <div className="busy-overlay" role="status"><div><LoaderCircle className="spin" size={25} /><strong>{busy}</strong><span>文件内容仅在当前设备内处理</span><button className="text-action" onClick={cancelImport}>取消</button></div></div>}
    {sheets && <div className="modal-backdrop" onClick={cancelImport}><section className="modal import-modal" role="dialog" aria-modal="true" aria-label="确认导入字段" onClick={e => e.stopPropagation()}><div className="modal-header"><div><span className="eyebrow">导入预览</span><h2>确认清单，让层级正确连接。</h2><p>{fileName}</p></div><button className="icon-button" aria-label="取消导入" onClick={cancelImport}><X size={20} /></button></div><div className="import-config"><label>工作表<select value={sheetName} onChange={e => selectSheet(e.target.value)}>{sheets.map(s => <option key={s.name}>{s.name}</option>)}</select></label><label>表头所在行<select value={headerRow} onChange={e => { const row = Number(e.target.value); setHeaderRow(row); const headerValues = sheet?.preview[row] ?? []; setMapping(Object.fromEntries(FIELDS.map(f => [f, headerValues.findIndex(c => String(c ?? '').trim() === FIELD_LABELS[f])])) as Mapping); }}>{(sheet?.preview ?? []).slice(0, 50).map((_, i) => <option key={i} value={i}>第 {i + 1} 行</option>)}</select></label><div className="sheet-size"><b>{number(sheet?.rowCount ?? 0)}</b><span>原表行数（含表头）</span></div></div><div className="mapping-heading"><strong>字段映射</strong><span>带 * 为建立结构所需字段</span></div><div className="mapping-grid">{FIELDS.map(f => <label key={f}>{FIELD_LABELS[f]}{REQUIRED.includes(f) && <em> *</em>}<select value={mapping[f]} onChange={e => setMapping({ ...mapping, [f]: Number(e.target.value) })}><option value={-1}>未映射</option>{Array.from({ length: sheet?.columnCount ?? 0 }, (_, i) => <option key={i} value={i}>{String.fromCharCode(65 + i)} · {String(header[i] ?? '无标题')}</option>)}</select></label>)}</div><div className="preview-table-wrap"><table className="preview-table"><thead><tr><th>原行号</th>{FIELDS.map(f => <th key={f}>{FIELD_LABELS[f]}</th>)}</tr></thead><tbody>{(sheet?.preview ?? []).slice(headerRow + 1, headerRow + 6).map((r, i) => <tr key={i}><td>{headerRow + i + 2}</td>{FIELDS.map(f => <td key={f}>{String(r[mapping[f]] ?? '—')}</td>)}</tr>)}</tbody></table></div><div className="import-rule"><GitBranch size={17} /><p>保持原始行序。每个节点在遇到同级、更高层级或产品切换时结束管辖；同码材料按出现位置分别保留。</p></div>{error && <p className="inline-error" role="alert">{error}</p>}<div className="modal-footer"><label className="remember-control"><input type="checkbox" checked={remember} onChange={e => setRemember(e.target.checked)} />在此浏览器记住项目</label><button className="button primary" disabled={!validMapping || !!busy} onClick={parseSelected}>生成结构图<ArrowRight size={16} /></button></div></section></div>}
    {showExport && project && <div className="modal-backdrop" onClick={() => setShowExport(false)}><section className="modal export-modal" role="dialog" aria-modal="true" aria-label="导出项目" onClick={e => e.stopPropagation()}><div className="modal-header"><div><span className="eyebrow">保存与分享</span><h2>把结构带走。</h2><p>图像和文本导出当前产品；JSON 保存全部产品。</p></div><button className="icon-button" aria-label="关闭导出" onClick={() => setShowExport(false)}><X size={20} /></button></div><div className="export-scope"><span>图片内容</span><label><input type="radio" checked={exportFull} onChange={() => setExportFull(true)} />完整产品结构</label><label><input type="radio" checked={!exportFull} onChange={() => setExportFull(false)} />当前展开结构</label></div><div className="export-options"><button onClick={() => void exportFile('png')}><span className="export-icon"><ArrowDownToLine size={21} /></span><div><strong>PNG 图片</strong><span>用于文档、汇报与分享</span></div><ArrowUpRight size={17} /></button><button onClick={() => void exportFile('svg')}><span className="export-icon"><GitBranch size={21} /></span><div><strong>SVG 矢量图</strong><span>放大清晰，保留完整画布</span></div><ArrowUpRight size={17} /></button><button onClick={() => void exportFile('text')}><span className="export-icon"><FileText size={21} /></span><div><strong>缩进文本</strong><span>完整产品层级，可复制与核对</span></div><ArrowUpRight size={17} /></button><button onClick={() => void exportFile('json')}><span className="export-icon"><FileJson size={21} /></span><div><strong>JSON 项目</strong><span>保存全部产品，可重新导入或换设备打开</span></div><ArrowUpRight size={17} /></button></div><div className="modal-note"><ShieldCheck size={15} />下载到本地，不会自动共享给其他人。</div></section></div>}
    {showIssues && project && <div className="modal-backdrop" onClick={() => setShowIssues(false)}><section className="modal issues-modal" role="dialog" aria-modal="true" aria-label="导入异常与提示" onClick={e => e.stopPropagation()}><div className="modal-header"><div><span className="eyebrow">数据检查</span><h2>保留问题，也保留线索。</h2><p>缺少数量不影响结构；缺少父项的分支不会自动猜测挂接。</p></div><button className="icon-button" aria-label="关闭数据检查" onClick={() => setShowIssues(false)}><X size={20} /></button></div><div className="issue-filter"><div className="view-tabs"><button className={issueScope === 'product' ? 'active' : ''} onClick={() => setIssueScope('product')}>当前产品</button><button className={issueScope === 'all' ? 'active' : ''} onClick={() => setIssueScope('all')}>全部产品</button></div><span>{number(issues.length)} 项</span></div><div className="issues-list">{issues.slice(0, 500).map(issue => <button key={issue.id} onClick={() => openIssue(issue)}><AlertCircle size={17} className={issue.severity === 'error' ? 'red' : 'amber-text'} /><div><strong>第 {issue.row} 行 <span>{issue.severity === 'error' ? '结构异常' : '数据提示'}</span></strong><p>{issue.message}</p><small>{project.products.find(p => p.id === issue.productId)?.name || '未识别产品'}</small></div><ChevronRight size={17} /></button>)}{issues.length > 500 && <p className="list-footnote">已显示前 500 条，可切换到具体产品查看。</p>}{!issues.length && <div className="empty-small"><Check size={28} /><p>当前范围未发现导入异常</p></div>}</div></section></div>}
    {help && <div className="modal-backdrop" onClick={() => setHelp(false)}><section className="modal help-modal" role="dialog" aria-modal="true" aria-label="使用说明" onClick={e => e.stopPropagation()}><div className="modal-header"><div><span className="eyebrow">BOM MIND</span><h2>按顺序，读懂每一层。</h2></div><button className="icon-button" aria-label="关闭说明" onClick={() => setHelp(false)}><X size={20} /></button></div><div className="help-content"><h3>1. 导入完整 BOM</h3><p>选择 .xls 或 .xlsx，确认工作表和字段。层次支持 .1、..2、...3 或正整数。产品代码、层次和材料代码是必需字段。</p><h3>2. 严格保留分支边界</h3><p>每个节点只管理后续更深层级。遇到同级、更高层级或产品变化就结束。不能先排序，也不会按照材料代码跨分支合并。</p><div className="rule-example">1 → 2 → 3 → 2 → 3 → 1<small>两个 2 各有自己的 3，最后一个 1 开启新分支。</small></div><h3>3. 数量与材料类别</h3><p>数量按原表显示，空值为“未提供”，未进行逐层相乘或单位换算。“末级材料”仅表示本次导出没有下级，不等于已确认其业务分类。</p><h3>4. 保存和换设备使用</h3><p>JSON 保存全部产品及原始记录，导入即可重建。“记住项目”只保存到当前浏览器。换设备请携带原始 Excel 或导出的 JSON。</p><p className="help-privacy"><ShieldCheck size={17} />文件在浏览器本地解析，不上传材料内容。网页首次访问需要网络。</p></div></section></div>}
  </div>;
}
export default App;
