import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import * as echarts from 'echarts/core';
import { TreeChart } from 'echarts/charts';
import { TooltipComponent } from 'echarts/components';
import { SVGRenderer } from 'echarts/renderers';
import { quantityLabel } from '../core/parser';
import { visibleNodeIds } from '../core/export';
import type { Project } from '../core/types';
echarts.use([TreeChart, TooltipComponent, SVGRenderer]);
export interface GraphHandle {
  zoom: (factor: number) => void;
  reset: () => void;
  focus: (id: string) => void;
}
interface Props {
  project: Project;
  rootId: string;
  collapsed: Set<string>;
  selected: string;
  matches: Set<string>;
  onSelect: (id: string) => void;
  onToggle: (id: string) => void;
}
export const BomGraph = forwardRef<GraphHandle, Props>(function BomGraph(
  { project, rootId, collapsed, selected, matches, onSelect, onToggle },
  ref,
) {
  const container = useRef<HTMLDivElement>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const chart = useRef<echarts.EChartsType | null>(null);
  const centeredRoot = useRef<string | null>(null);
  const [scale, setScale] = useState(1);
  const ids = visibleNodeIds(project, rootId, collapsed);
  const leafCount = ids.filter(
    (id) => collapsed.has(id) || !project.nodes[id].children.length,
  ).length;
  const depth = Math.max(...ids.map((id) => project.nodes[id].level));
  const width = Math.max(850, (depth + 1) * 280 + 150);
  const height = Math.max(620, leafCount * 100 + 120);
  useImperativeHandle(ref, () => ({
    zoom: (factor) => setScale((v) => Math.max(0.35, Math.min(1.8, v * factor))),
    reset: () => {
      setScale(1);
      viewport.current?.scrollTo({
        left: 0,
        top: Math.max(0, height / 2 - viewport.current.clientHeight / 2),
        behavior: 'smooth',
      });
      chart.current?.setOption({ series: [{ zoom: 1, center: ['50%', '50%'] }] });
    },
    focus: (id) => {
      const i = ids.indexOf(id);
      if (i < 0) return;
      viewport.current?.scrollTo({
        left: Math.max(0, project.nodes[id].level * 250 - 100),
        top:
          id === rootId
            ? Math.max(0, height / 2 - (viewport.current?.clientHeight ?? 400) / 2)
            : Math.max(0, (i / ids.length) * height - 200),
        behavior: 'smooth',
      });
    },
  }));
  useEffect(() => {
    if (!container.current) return;
    chart.current = echarts.init(container.current, undefined, { renderer: 'svg' });
    return () => {
      chart.current?.dispose();
      chart.current = null;
    };
  }, []);
  useEffect(() => {
    const drawNode = (id: string): Record<string, unknown> => {
      const n = project.nodes[id];
      const root = !n.level;
      const match = matches.has(id);
      const active = selected === id;
      const isCollapsed = collapsed.has(id) && n.children.length > 0;
      return {
        id,
        name: n.name,
        value: n.code,
        children: isCollapsed ? [] : n.children.map(drawNode),
        symbolSize: root ? [208, 78] : [190, 78],
        itemStyle: {
          color: root
            ? '#153d34'
            : match
              ? '#fff7df'
              : active
                ? '#edf6ef'
                : n.children.length
                  ? '#f0f5eb'
                  : '#fff',
          borderColor: active ? '#2b755a' : match ? '#d49f3b' : root ? '#153d34' : '#d6e0d9',
          borderWidth: active ? 2 : 1,
          borderRadius: 10,
        },
        label: {
          color: root ? '#fff' : '#2d4035',
          formatter: `${n.name}\n${n.spec || n.code}\n${root ? n.code : `原表数量 ${quantityLabel(n.quantity)}${isCollapsed ? `  ⊕ ${n.children.length}` : ''}`}`,
        },
      };
    };
    chart.current?.resize({ width: width * scale, height: height * scale });
    chart.current?.setOption(
      {
        animationDuration: 200,
        animationDurationUpdate: 180,
        tooltip: {
          trigger: 'item',
          renderMode: 'richText',
          formatter: (params: { data: { id: string } }) => {
            const n = project.nodes[params.data.id];
            return `${n.name}\n${n.code}\n${n.spec || '规格未提供'}${n.level ? `\n原表数量：${quantityLabel(n.quantity)}\n原表第 ${n.sourceRow} 行` : ''}`;
          },
        },
        series: [
          {
            type: 'tree',
            data: [drawNode(rootId)],
            orient: 'LR',
            left: 130 * scale,
            right: 130 * scale,
            top: 65,
            bottom: 65,
            symbol: 'roundRect',
            edgeShape: 'curve',
            edgeForkPosition: '50%',
            expandAndCollapse: false,
            roam: true,
            initialTreeDepth: -1,
            emphasis: { focus: 'ancestor' },
            lineStyle: { color: '#becfc5', width: 1.4, curveness: 0.45 },
            label: {
              position: 'inside',
              verticalAlign: 'middle',
              align: 'center',
              fontSize: 13,
              lineHeight: 20,
              width: 165,
              overflow: 'truncate',
              fontFamily: 'Microsoft YaHei, PingFang SC, sans-serif',
            },
            leaves: { label: { position: 'inside' } },
          },
        ],
      },
      { notMerge: true },
    );
    chart.current?.off('click');
    chart.current?.on('click', (params) => {
      const id = (params.data as { id: string }).id;
      onSelect(id);
      if (project.nodes[id].children.length) {
        onToggle(id);
      }
    });
  }, [project, rootId, collapsed, selected, matches, onSelect, onToggle, width, height, scale]);
  useEffect(() => {
    if (centeredRoot.current === rootId) return;
    centeredRoot.current = rootId;
    if (viewport.current) {
      viewport.current.scrollTop = Math.max(0, height / 2 - viewport.current.clientHeight / 2);
    }
    // Center the product root when a product opens; preserve scrolling while exploring it.
  }, [rootId, height]);
  return (
    <div ref={viewport} className="graph-viewport" aria-label="产品结构图，可拖动和缩放">
      <div ref={container} style={{ width: width * scale, height: height * scale }} />
    </div>
  );
});
