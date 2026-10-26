import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent,
} from 'react';
import { Maximize2, Minus, Plus } from 'lucide-react';
import type { ExportDiagram } from '../core/export-layout';
import { renderExportDiagram } from '../core/export-svg';
import { quantityLabel } from '../core/parser';

export interface DiagramHandle {
  zoom: (factor: number) => void;
  reset: () => void;
  focus: (id: string) => void;
}
interface Props {
  diagram: ExportDiagram;
  label: string;
  fit?: boolean;
  controls?: boolean;
  selected?: string;
  matches?: Set<string>;
  collapsed?: Set<string>;
  onSelect?: (id: string) => void;
  onToggle?: (id: string) => void;
}

export const DiagramViewport = forwardRef<DiagramHandle, Props>(function DiagramViewport(
  {
    diagram,
    label,
    fit = false,
    controls = false,
    selected,
    matches,
    collapsed,
    onSelect,
    onToggle,
  },
  ref,
) {
  const viewport = useRef<HTMLDivElement>(null);
  const surface = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const autoFit = useRef(fit);
  const previous = useRef<{ diagram: ExportDiagram; scale: number } | null>(null);
  const drag = useRef<{ x: number; y: number; left: number; top: number } | null>(null);
  const suppressClick = useRef(false);
  const selectedId = useRef(selected);
  const focusedId = useRef<string | null>(null);
  // The renderer escapes every source string before it reaches the SVG markup.
  const svg = useMemo(() => renderExportDiagram(diagram), [diagram]);
  useLayoutEffect(() => {
    selectedId.current = selected;
  }, [selected]);

  const fitScale = useCallback(() => {
    const element = viewport.current;
    return element
      ? Math.max(
          0.01,
          Math.min(
            1,
            (element.clientWidth - 24) / diagram.width,
            (element.clientHeight - 24) / diagram.height,
          ),
        )
      : 1;
  }, [diagram]);
  function zoom(factor: number) {
    autoFit.current = false;
    setScale((value) => Math.max(0.01, Math.min(3, value * factor)));
  }
  useImperativeHandle(ref, () => ({
    zoom,
    reset() {
      autoFit.current = fit;
      previous.current = null;
      setScale(fit ? fitScale() : 1);
      const root = diagram.cards[0];
      if (viewport.current && !fit) {
        viewport.current.scrollTo({
          left: 0,
          top: Math.max(0, root.y + root.height / 2 - viewport.current.clientHeight / 2),
        });
      }
    },
    focus(id) {
      const card = diagram.cards.find((item) => item.node.id === id);
      const element = viewport.current;
      if (!card || !element) return;
      element.scrollTo({
        left: Math.max(0, (card.x + card.width / 2) * scale - element.clientWidth / 2),
        top: Math.max(0, (card.y + card.height / 2) * scale - element.clientHeight / 2),
        behavior: 'smooth',
      });
    },
  }));

  useLayoutEffect(() => {
    const element = viewport.current;
    if (!element) return;
    const update = () => {
      if (autoFit.current) {
        setScale(fitScale());
      }
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, [fitScale]);

  useLayoutEffect(() => {
    const element = viewport.current;
    if (!element) return;
    const old = previous.current;
    if (autoFit.current) {
      element.scrollTo(0, 0);
    } else if (old) {
      const anchorId = selectedId.current ?? diagram.cards[0].node.id;
      const before =
        old.diagram.cards.find((card) => card.node.id === anchorId) ?? old.diagram.cards[0];
      const after =
        diagram.cards.find((card) => card.node.id === before.node.id) ?? diagram.cards[0];
      const screenX = (before.x + before.width / 2) * old.scale - element.scrollLeft;
      const screenY = (before.y + before.height / 2) * old.scale - element.scrollTop;
      element.scrollTo(
        (after.x + after.width / 2) * scale - screenX,
        (after.y + after.height / 2) * scale - screenY,
      );
    } else {
      const root = diagram.cards[0];
      element.scrollTo(
        0,
        Math.max(0, (root.y + root.height / 2) * scale - element.clientHeight / 2),
      );
    }
    previous.current = { diagram, scale };
  }, [diagram, scale]);

  useEffect(() => {
    if (!onSelect) return;
    const nodes = new Map(diagram.cards.map((card) => [card.node.id, card.node]));
    surface.current?.querySelectorAll<SVGGElement>('g[data-node-id]').forEach((element) => {
      const id = element.dataset.nodeId!;
      const node = nodes.get(id)!;
      element.classList.toggle('diagram-selected', selected === id);
      element.classList.toggle('diagram-match', matches?.has(id) ?? false);
      element.setAttribute('tabindex', '0');
      element.setAttribute('role', 'treeitem');
      element.setAttribute('aria-level', String(node.level + 1));
      element.setAttribute('aria-selected', String(selected === id));
      element.setAttribute('aria-label', node.name);
      if (node.children.length) element.setAttribute('aria-expanded', String(!collapsed?.has(id)));
      const title = element.querySelector('title');
      if (title) {
        title.textContent = `${node.name}\n${node.code}\n${node.spec || '规格未提供'}${node.level ? `\n原表数量：${quantityLabel(node.quantity)}\n原表第 ${node.sourceRow} 行` : ''}`;
      }
      if (focusedId.current === id && document.activeElement === document.body) {
        element.focus({ preventScroll: true });
      }
    });
  }, [diagram, selected, matches, collapsed, onSelect]);

  function nodeId(target: EventTarget | null) {
    return target instanceof Element
      ? target.closest<SVGGElement>('g[data-node-id]')?.dataset.nodeId
      : undefined;
  }
  function activate(target: EventTarget | null) {
    const id = nodeId(target);
    if (!id || !onSelect) return;
    onSelect(id);
    if (diagram.cards.find((card) => card.node.id === id)?.node.children.length) onToggle?.(id);
  }
  function pointerDown(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0 || !viewport.current) return;
    suppressClick.current = false;
    drag.current = {
      x: event.clientX,
      y: event.clientY,
      left: viewport.current.scrollLeft,
      top: viewport.current.scrollTop,
    };
  }
  function pointerMove(event: PointerEvent<HTMLDivElement>) {
    const start = drag.current;
    const element = viewport.current;
    if (!start || !element) return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    if (Math.hypot(dx, dy) > 5) {
      suppressClick.current = true;
      element.setPointerCapture(event.pointerId);
      element.scrollTo(start.left - dx, start.top - dy);
    }
  }
  return (
    <div className="diagram-view">
      <div
        ref={viewport}
        className="diagram-viewport"
        aria-label={label}
        role={onSelect ? 'tree' : 'region'}
        tabIndex={0}
        onPointerDown={pointerDown}
        onPointerMove={pointerMove}
        onPointerUp={() => {
          drag.current = null;
        }}
        onPointerCancel={() => {
          drag.current = null;
        }}
        onLostPointerCapture={() => {
          drag.current = null;
        }}
        onFocusCapture={(event) => {
          focusedId.current = nodeId(event.target) ?? null;
        }}
        onBlurCapture={(event) => {
          if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget)) {
            focusedId.current = null;
          }
        }}
        onClick={(event) => {
          if (!suppressClick.current) activate(event.target);
        }}
        onKeyDown={(event) => {
          if ((event.key === 'Enter' || event.key === ' ') && nodeId(event.target)) {
            event.preventDefault();
            activate(event.target);
          }
        }}
      >
        <div
          className="diagram-stage"
          style={{ width: diagram.width * scale, height: diagram.height * scale }}
        >
          <div
            ref={surface}
            className="diagram-surface"
            style={{ width: diagram.width, height: diagram.height, transform: `scale(${scale})` }}
            dangerouslySetInnerHTML={{ __html: svg }}
          />
        </div>
      </div>
      {controls && (
        <div className="diagram-controls" role="group" aria-label="预览缩放">
          <button type="button" aria-label="缩小预览" onClick={() => zoom(0.8)}>
            <Minus size={15} />
          </button>
          <output>{Math.round(scale * 100)}%</output>
          <button type="button" aria-label="放大预览" onClick={() => zoom(1.25)}>
            <Plus size={15} />
          </button>
          <button
            type="button"
            onClick={() => {
              autoFit.current = true;
              setScale(fitScale());
              viewport.current?.scrollTo(0, 0);
            }}
          >
            <Maximize2 size={14} />
            适应画布
          </button>
          <button
            type="button"
            onClick={() => {
              autoFit.current = false;
              setScale(1);
            }}
          >
            实际大小
          </button>
        </div>
      )}
    </div>
  );
});
