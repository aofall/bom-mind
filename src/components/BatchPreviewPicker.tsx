import { useMemo, useState } from 'react';
import type { Project } from '../core/types';

interface Props {
  products: Project['products'];
  productId: string;
  onChange: (id: string) => void;
}
export function BatchPreviewPicker({ products, productId, onChange }: Props) {
  const [search, setSearch] = useState('');
  const index = products.findIndex((product) => product.id === productId);
  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return products.filter((product) =>
      `${product.code} ${product.name} ${product.spec}`.toLowerCase().includes(term),
    );
  }, [products, search]);
  const current = products[index];
  return (
    <div className="batch-preview-picker">
      <p>
        正在预览第 {index + 1} / {products.length} 个产品；排版设置应用于全部已选产品。
      </p>
      <label className="visually-hidden" htmlFor="preview-product-search">
        搜索已选产品
      </label>
      <input
        id="preview-product-search"
        placeholder="搜索已选产品名称、编码或规格"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
      />
      <div>
        <button
          type="button"
          aria-label="预览上一个产品"
          disabled={index <= 0}
          onClick={() => onChange(products[index - 1].id)}
        >
          上一项
        </button>
        <select
          aria-label="选择预览产品"
          value={productId}
          onChange={(event) => onChange(event.target.value)}
        >
          {current && !filtered.some((product) => product.id === productId) && (
            <option value={productId}>
              {current.code} · {current.name}（当前预览）
            </option>
          )}
          {filtered.map((product) => (
            <option key={product.id} value={product.id}>
              {product.code} · {product.name}
            </option>
          ))}
        </select>
        <button
          type="button"
          aria-label="预览下一个产品"
          disabled={index < 0 || index >= products.length - 1}
          onClick={() => onChange(products[index + 1].id)}
        >
          下一项
        </button>
      </div>
      {search && <span role="status">找到 {filtered.length} 个已选产品，选择后切换预览。</span>}
    </div>
  );
}
