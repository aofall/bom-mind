import { useRef, type ReactNode, type RefObject } from 'react';
import { useDialogFocus } from '../hooks/useDialogFocus';
import { PanelRightClose, X } from 'lucide-react';

interface Props {
  expanded: boolean;
  isDesktop: boolean;
  onClose: () => void;
  trigger: RefObject<HTMLButtonElement | null>;
  children: ReactNode;
}
export function NodeDetailsPanel({ expanded, isDesktop, onClose, trigger, children }: Props) {
  const panel = useRef<HTMLElement>(null);
  useDialogFocus(panel, expanded && !isDesktop, onClose, trigger);
  function dismiss() {
    onClose();
    if (isDesktop) trigger.current?.focus({ preventScroll: true });
  }
  return (
    <>
      {expanded && !isDesktop && (
        <div className="detail-backdrop" aria-hidden="true" onClick={dismiss} />
      )}
      <aside
        ref={panel}
        id="node-details-panel"
        className={`detail-panel ${expanded && !isDesktop ? 'mobile-open' : ''}`}
        hidden={!expanded}
        aria-labelledby="node-details-title"
        role={isDesktop ? 'complementary' : 'dialog'}
        aria-modal={!isDesktop && expanded ? true : undefined}
        tabIndex={-1}
      >
        <div className="detail-heading">
          <span id="node-details-title">节点详情</span>
          <span className="small-muted desktop-only">可追溯至原表</span>
          <button
            type="button"
            className="icon-button"
            aria-label={isDesktop ? '收起节点详情' : '关闭节点详情'}
            title={isDesktop ? '收起节点详情' : '关闭节点详情'}
            onClick={dismiss}
          >
            {isDesktop ? <PanelRightClose size={17} /> : <X size={17} />}
          </button>
        </div>
        {children}
      </aside>
    </>
  );
}
