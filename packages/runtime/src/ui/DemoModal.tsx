import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

export interface DemoModalProps {
  open: boolean;
  onClose: () => void;
  /** The player to show, typically `<Demo config={…} />`. Mounted only while open. */
  children: ReactNode;
  /** Accessible name for the dialog. */
  label?: string;
}

/**
 * Pop-up for React hosts: the same overlay the `embed.js` loader draws
 * around an iframe, but rendering the player in-process through a portal,
 * so a React app needs no iframe and no second copy of the runtime. Escape
 * and a click on the scrim call `onClose`; the page stops scrolling while
 * open and focus returns to where it was on close.
 */
export function DemoModal({ open, onClose, children, label = 'Demo' }: DemoModalProps) {
  const restoreFocus = useRef<Element | null>(null);

  useEffect(() => {
    if (!open) return;
    restoreFocus.current = document.activeElement;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    document.documentElement.classList.add('demo-modal-no-scroll');
    return () => {
      document.removeEventListener('keydown', onKey);
      document.documentElement.classList.remove('demo-modal-no-scroll');
      const el = restoreFocus.current;
      if (el && 'focus' in el && typeof (el as HTMLElement).focus === 'function') {
        (el as HTMLElement).focus();
      }
    };
  }, [open, onClose]);

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="demo-modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={label}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="demo-modal-frame">{children}</div>
    </div>,
    document.body,
  );
}
