import { forwardRef, useMemo } from 'react';
import { layoutExportTree, type ExportLayoutOptions } from '../core/export-layout';
import type { Project } from '../core/types';
import { DiagramViewport, type DiagramHandle } from './DiagramViewport';

export type GraphHandle = DiagramHandle;
interface Props {
  project: Project;
  rootId: string;
  collapsed: Set<string>;
  layout: ExportLayoutOptions;
  selected: string;
  matches: Set<string>;
  onSelect: (id: string) => void;
  onToggle: (id: string) => void;
}
export const BomGraph = forwardRef<GraphHandle, Props>(function BomGraph(
  { project, rootId, collapsed, layout, ...interaction },
  ref,
) {
  const diagram = useMemo(
    () => layoutExportTree(project, rootId, collapsed, false, layout),
    [project, rootId, collapsed, layout],
  );
  return (
    <DiagramViewport
      ref={ref}
      diagram={diagram}
      label="产品结构图，可拖动和缩放"
      collapsed={collapsed}
      {...interaction}
    />
  );
});
