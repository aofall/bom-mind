import { useEffect, useMemo, useRef, type KeyboardEvent } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { ArrowDownToLine, Box, ChevronRight, Search, X } from 'lucide-react';
import type { Product } from '../core/types';

interface Props {
  products: Product[];
  allProducts: Product[];
  activeId: string;
  selectedIds: Set<string>;
  search: string;
  open: boolean;
  onSearch: (value: string) => void;
  onSelect: (id: string) => void;
  onSelection: (ids: Set<string>) => void;
  onExport: () => void;
  onClose: () => void;
}

export function ProductDirectory({
  products,
  allProducts,
  activeId,
  selectedIds,
  search,
  open,
  onSearch,
  onSelect,
  onSelection,
  onExport,
  onClose,
}: Props) {
  const scroll = useRef<HTMLDivElement>(null);
  const selectAll = useRef<HTMLInputElement>(null);
  const previousActive = useRef(activeId);
  const virtualizer = useVirtualizer({
    count: products.length,
    getScrollElement: () => scroll.current,
    estimateSize: () => 118,
    getItemKey: (index) => products[index].id,
    overscan: 6,
  });
  const matchedSelected = useMemo(
    () => products.filter((p) => selectedIds.has(p.id)).length,
    [products, selectedIds],
  );
  const allChecked = products.length > 0 && matchedSelected === products.length;
  useEffect(() => {
    if (selectAll.current) {
      selectAll.current.indeterminate = matchedSelected > 0 && !allChecked;
    }
  }, [matchedSelected, allChecked]);
  useEffect(() => {
    scroll.current?.scrollTo({ top: 0 });
  }, [search]);
  useEffect(() => {
    if (previousActive.current !== activeId) {
      previousActive.current = activeId;
      const index = products.findIndex((p) => p.id === activeId);
      if (index >= 0) {
        virtualizer.scrollToIndex(index, { align: 'auto' });
      }
    }
  }, [activeId, products, virtualizer]);
  function toggle(id: string) {
    const next = new Set(selectedIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    onSelection(next);
  }
  function toggleMatches() {
    const next = new Set(selectedIds);
    products.forEach((p) => {
      if (allChecked) {
        next.delete(p.id);
      } else {
        next.add(p.id);
      }
    });
    onSelection(next);
  }
  function navigate(event: KeyboardEvent<HTMLDivElement>) {
    if (
      !['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key) ||
      event.target instanceof HTMLInputElement ||
      !products.length
    ) {
      return;
    }
    const focusedId =
      (event.target as HTMLElement).closest<HTMLElement>('[data-product-id]')?.dataset.productId ??
      activeId;
    const current = Math.max(
      0,
      products.findIndex((p) => p.id === focusedId),
    );
    const index =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? products.length - 1
          : Math.max(
              0,
              Math.min(products.length - 1, current + (event.key === 'ArrowDown' ? 1 : -1)),
            );
    event.preventDefault();
    virtualizer.scrollToIndex(index, { align: 'auto' });
    const id = products[index].id;
    onSelect(id);
    requestAnimationFrame(() =>
      scroll.current
        ?.querySelector<HTMLElement>(`[data-product-id="${CSS.escape(id)}"]`)
        ?.focus({ preventScroll: true }),
    );
  }
  return (
    <aside className={`product-sidebar ${open ? 'mobile-open' : ''}`}>
      <div className="sidebar-heading">
        <span>
          产品目录 <b>{allProducts.length.toLocaleString('zh-CN')}</b>
        </span>
        <button className="icon-button mobile-close" aria-label="关闭产品目录" onClick={onClose}>
          <X size={17} />
        </button>
      </div>
      <div className="search-field">
        <Search size={15} />
        <input
          placeholder="搜索产品名称、代码…"
          aria-label="搜索产品"
          value={search}
          onChange={(e) => onSearch(e.target.value)}
        />
        {search && (
          <button aria-label="清空产品搜索" onClick={() => onSearch('')}>
            <X size={13} />
          </button>
        )}
      </div>
      <div className="directory-select-all">
        <label>
          <input
            ref={selectAll}
            type="checkbox"
            checked={allChecked}
            disabled={!products.length}
            onChange={toggleMatches}
          />
          全选搜索结果 <span>（{products.length.toLocaleString('zh-CN')} 项）</span>
        </label>
      </div>
      <div
        ref={scroll}
        className="product-list virtual-scroll"
        aria-label="产品目录列表"
        tabIndex={0}
        onKeyDown={navigate}
      >
        <div className="virtual-product-list" style={{ height: virtualizer.getTotalSize() }}>
          {virtualizer.getVirtualItems().map((item) => {
            const p = products[item.index];
            return (
              <div
                key={item.key}
                ref={virtualizer.measureElement}
                data-index={item.index}
                className="virtual-product-row"
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  transform: `translateY(${item.start}px)`,
                }}
              >
                <div className={`product-choice ${activeId === p.id ? 'active' : ''}`}>
                  <input
                    type="checkbox"
                    aria-label={`选择产品 ${p.code} ${p.name}`}
                    checked={selectedIds.has(p.id)}
                    onChange={() => toggle(p.id)}
                  />
                  <button
                    className="product-item"
                    aria-current={activeId === p.id ? 'true' : undefined}
                    data-product-id={p.id}
                    onClick={() => onSelect(p.id)}
                  >
                    <span className="product-icon">
                      <Box size={17} />
                    </span>
                    <span className="product-item-body">
                      <strong title={p.name}>{p.name}</strong>
                      <span className="code-label" title={p.code}>
                        {p.code}
                      </span>
                      <span className="product-item-meta">
                        {p.count} 条明细<span>·</span>
                        {p.maxDepth} 级
                        {p.issueCount > 0 && (
                          <span className="tiny-issue">{p.issueCount} 提示</span>
                        )}
                      </span>
                    </span>
                    <ChevronRight size={13} className="product-arrow" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
        {!products.length && (
          <div className="empty-small">
            <Search size={24} />
            <p>没有找到匹配产品</p>
            <button onClick={() => onSearch('')}>清空搜索</button>
          </div>
        )}
      </div>
      <div className="directory-actions">
        <p role="status">
          已选 <b>{selectedIds.size.toLocaleString('zh-CN')}</b> 项
          {selectedIds.size > matchedSelected && (
            <span>，其中 {selectedIds.size - matchedSelected} 项不在当前结果中</span>
          )}
        </p>
        <div>
          <button
            className="text-action"
            onClick={() => onSelection(new Set(allProducts.map((p) => p.id)))}
          >
            选择全部产品
          </button>
          <button
            className="text-action"
            disabled={!selectedIds.size}
            onClick={() => onSelection(new Set())}
          >
            清空选择
          </button>
        </div>
        <button className="button primary" disabled={!selectedIds.size} onClick={onExport}>
          <ArrowDownToLine size={15} />
          批量导出（{selectedIds.size.toLocaleString('zh-CN')}）
        </button>
      </div>
    </aside>
  );
}
