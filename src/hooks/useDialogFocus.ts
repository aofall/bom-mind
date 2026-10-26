import { useEffect, useRef, type RefObject } from 'react';

export function useDialogFocus(
  dialog: RefObject<HTMLElement | null>,
  active: boolean,
  onClose: () => void,
  fallback?: RefObject<HTMLElement | null>,
) {
  const close = useRef(onClose);
  useEffect(() => {
    close.current = onClose;
  }, [onClose]);
  useEffect(() => {
    const element = dialog.current;
    if (!active || !element) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusable = () =>
      Array.from(
        element.querySelectorAll<HTMLElement>(
          'a[href], button:not(:disabled), input:not(:disabled):not([type="hidden"]), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]',
        ),
      ).filter(
        (item) =>
          item.getClientRects().length > 0 && getComputedStyle(item).visibility !== 'hidden',
      );
    (focusable()[0] ?? element).focus({ preventScroll: true });
    const handleKey = (event: KeyboardEvent) => {
      const dialogs = document.querySelectorAll('[role="dialog"][aria-modal="true"]');
      if (dialogs[dialogs.length - 1] !== element) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        close.current();
        return;
      }
      if (event.key !== 'Tab') return;
      const items = focusable();
      const first = items[0] ?? element;
      const last = items.at(-1) ?? element;
      if (!element.contains(document.activeElement)) {
        event.preventDefault();
        first.focus();
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', handleKey);
    const fallbackElement = fallback?.current;
    return () => {
      document.removeEventListener('keydown', handleKey);
      const target =
        previous?.isConnected && previous.getClientRects().length ? previous : fallbackElement;
      if (target?.isConnected && target.getClientRects().length) {
        target.focus({ preventScroll: true });
      }
    };
  }, [active, dialog, fallback]);
}
