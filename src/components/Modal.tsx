import React, { useEffect, useRef } from 'react';

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  ariaLabel: string;
  role?: 'dialog' | 'alertdialog';
  id?: string;
  dataTestId?: string;
  maxWidthClass?: string;
  panelClassName?: string;
  initialFocusRef?: React.RefObject<HTMLElement | null>;
  onEscapeIntercept?: () => boolean;
  children: React.ReactNode;
}

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'summary',
  'button:not([disabled])',
  'textarea:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

function getVisibleFocusables(panel: HTMLElement): HTMLElement[] {
  return Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (el) => {
      if (el.hasAttribute('disabled') || el.tabIndex === -1) return false;
      if (el.hasAttribute('hidden') || el.getAttribute('aria-hidden') === 'true') {
        return false;
      }
      if (el.classList.contains('hidden')) return false;
      const parentDetails = el.closest('details');
      if (parentDetails && !parentDetails.open && el.tagName !== 'SUMMARY') {
        return false;
      }
      return true;
    }
  );
}

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  ariaLabel,
  role = 'dialog',
  id,
  dataTestId,
  maxWidthClass = 'max-w-md',
  panelClassName = 'border-slate-700 space-y-4',
  initialFocusRef,
  onEscapeIntercept,
  children,
}) => {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const initialFocusRefHolder = useRef(initialFocusRef);
  initialFocusRefHolder.current = initialFocusRef;
  const onEscapeInterceptRef = useRef(onEscapeIntercept);
  onEscapeInterceptRef.current = onEscapeIntercept;

  useEffect(() => {
    if (!isOpen) return;

    previousFocusRef.current = document.activeElement as HTMLElement | null;
    document.body.setAttribute('data-sideflow-modal-open', 'true');

    // Ensure initial focus lands on initialFocusRef (if provided) or inside the modal
    const rafId = window.requestAnimationFrame(() => {
      const panel = panelRef.current;
      if (!panel) return;
      const preferred = initialFocusRefHolder.current?.current;
      if (preferred && panel.contains(preferred)) {
        preferred.focus();
        return;
      }
      if (!panel.contains(document.activeElement)) {
        const focusables = getVisibleFocusables(panel);
        if (focusables.length > 0) {
          focusables[0].focus();
        } else {
          panel.focus();
        }
      }
    });

    const handleKeyDownCapture = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        if (onEscapeInterceptRef.current?.()) {
          return;
        }
        onCloseRef.current();
        return;
      }

      if (e.key === 'Tab') {
        const panel = panelRef.current;
        if (!panel) return;
        const focusables = getVisibleFocusables(panel);

        if (focusables.length === 0) {
          e.preventDefault();
          panel.focus();
          return;
        }

        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        const active = document.activeElement as HTMLElement | null;

        if (e.shiftKey) {
          if (!active || !panel.contains(active) || active === first) {
            e.preventDefault();
            last.focus();
          }
        } else {
          if (!active || !panel.contains(active) || active === last) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDownCapture, true);

    return () => {
      window.cancelAnimationFrame(rafId);
      window.removeEventListener('keydown', handleKeyDownCapture, true);
      document.body.removeAttribute('data-sideflow-modal-open');
      const prevEl = previousFocusRef.current;
      if (prevEl && document.body.contains(prevEl)) {
        try {
          prevEl.focus();
        } catch {
          // ignore
        }
      }
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div
      id={id}
      data-testid={dataTestId}
      role={role}
      aria-modal="true"
      aria-label={ariaLabel}
      onClick={onClose}
      className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4"
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className={`bg-slate-900 border rounded-2xl ${maxWidthClass} w-full p-5 shadow-2xl focus:outline-none ${panelClassName}`}
      >
        {children}
      </div>
    </div>
  );
};
