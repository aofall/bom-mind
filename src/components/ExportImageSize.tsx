import { useMemo } from 'react';
import { layoutExportTree, pngDimensions, type ExportLayoutOptions } from '../core/export-layout';
import type { Project } from '../core/types';

interface Props {
  project: Project;
  productId: string;
  full?: boolean;
  collapsed?: Set<string>;
  layout: ExportLayoutOptions;
  firstOnly?: boolean;
}
export function ExportImageSize({
  project,
  productId,
  full = true,
  collapsed,
  layout,
  firstOnly = false,
}: Props) {
  const dimensions = useMemo(() => {
    if (!project.nodes[productId]) return null;
    const diagram = layoutExportTree(project, productId, collapsed, full, layout);
    return {
      width: diagram.width,
      height: diagram.height,
      png: pngDimensions(diagram.width, diagram.height),
    };
  }, [project, productId, collapsed, full, layout]);
  if (!dimensions) return null;
  return (
    <p className="export-image-size" role="status">
      {firstOnly ? '首个产品预计尺寸：' : '预计尺寸：'}SVG {dimensions.width} × {dimensions.height}
      ；PNG {dimensions.png.width} × {dimensions.png.height}。
      {dimensions.png.scale < 1 && (
        <strong>PNG 将缩小以符合尺寸限制，完整清晰图建议使用 SVG。</strong>
      )}
    </p>
  );
}
