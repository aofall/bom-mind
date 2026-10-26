import { useRef, type ReactNode } from 'react';
import { useDialogFocus } from '../hooks/useDialogFocus';
import { X } from 'lucide-react';

interface Props {
  className: string;
  label: string;
  eyebrow: string;
  title: ReactNode;
  description?: ReactNode;
  closeLabel: string;
  onClose: () => void;
  footer?: ReactNode;
  children: ReactNode;
}

export function Modal({
  className,
  label,
  eyebrow,
  title,
  description,
  closeLabel,
  onClose,
  footer,
  children,
}: Props) {
  const dialog = useRef<HTMLElement>(null);
  useDialogFocus(dialog, true, onClose);
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <section
        ref={dialog}
        className={`modal ${className}`}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="modal-header">
          <div>
            <span className="eyebrow">{eyebrow}</span>
            <h2>{title}</h2>
            {description != null && <p>{description}</p>}
          </div>
          <button type="button" className="icon-button" aria-label={closeLabel} onClick={onClose}>
            <X size={20} />
          </button>
        </div>
        {children}
        {footer && <div className="modal-footer">{footer}</div>}
      </section>
    </div>
  );
}
