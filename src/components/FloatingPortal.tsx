import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';

export type FloatingPlacement =
  | 'bottom-start'
  | 'bottom-end'
  | 'bottom-center'
  | 'top-center'
  | 'top-start';

export interface FloatingPortalProps {
  isOpen: boolean;
  anchorRef?: React.RefObject<HTMLElement | null>;
  anchorPoint?: { x: number; y: number; width?: number; height?: number } | null;
  placement?: FloatingPlacement;
  offsetPx?: number;
  viewportPaddingPx?: number;
  onClose?: () => void;
  closeOnEscape?: boolean;
  returnFocusRef?: React.RefObject<HTMLElement | null>;
  role?: React.AriaRole;
  ariaLabel?: string;
  id?: string;
  dataTestId?: string;
  className?: string;
  style?: React.CSSProperties;
  onMouseDown?: React.MouseEventHandler<HTMLDivElement>;
  onClick?: React.MouseEventHandler<HTMLDivElement>;
  children: React.ReactNode;
}

export function clampFloatingCoordinates(params: {
  anchorRect: { left: number; top: number; width: number; height: number };
  floatingWidth: number;
  floatingHeight: number;
  viewportWidth: number;
  viewportHeight: number;
  placement: FloatingPlacement;
  offsetPx: number;
  paddingPx: number;
}): { left: number; top: number; maxWidth: number } {
  const {
    anchorRect,
    floatingWidth,
    floatingHeight,
    viewportWidth,
    viewportHeight,
    placement,
    offsetPx,
    paddingPx,
  } = params;

  const safeVw = Math.max(160, viewportWidth || 360);
  const safeVh = Math.max(160, viewportHeight || 640);
  const maxWidth = Math.max(120, safeVw - paddingPx * 2);
  const effectiveW = Math.min(floatingWidth || 240, maxWidth);
  const effectiveH = Math.min(floatingHeight || 120, safeVh - paddingPx * 2);

  let rawLeft = anchorRect.left;
  if (placement === 'bottom-end') {
    rawLeft = anchorRect.left + anchorRect.width - effectiveW;
  } else if (placement === 'bottom-center' || placement === 'top-center') {
    rawLeft = anchorRect.left + anchorRect.width / 2 - effectiveW / 2;
  }

  let rawTop =
    placement === 'top-center' || placement === 'top-start'
      ? anchorRect.top - effectiveH - offsetPx
      : anchorRect.top + anchorRect.height + offsetPx;

  // Flip vertically if top placement clips above viewport or bottom placement overflows below
  if (
    (placement === 'top-center' || placement === 'top-start') &&
    rawTop < paddingPx &&
    anchorRect.top + anchorRect.height + offsetPx + effectiveH <=
      safeVh - paddingPx
  ) {
    rawTop = anchorRect.top + anchorRect.height + offsetPx;
  } else if (
    placement.startsWith('bottom') &&
    rawTop + effectiveH > safeVh - paddingPx &&
    anchorRect.top - effectiveH - offsetPx >= paddingPx
  ) {
    rawTop = anchorRect.top - effectiveH - offsetPx;
  }

  const maxLeft = Math.max(paddingPx, safeVw - effectiveW - paddingPx);
  const maxTop = Math.max(paddingPx, safeVh - effectiveH - paddingPx);

  return {
    left: Math.round(Math.min(Math.max(paddingPx, rawLeft), maxLeft)),
    top: Math.round(Math.min(Math.max(paddingPx, rawTop), maxTop)),
    maxWidth: Math.round(maxWidth),
  };
}

export const FloatingPortal = forwardRef<HTMLDivElement, FloatingPortalProps>(
  function FloatingPortal(
    {
      isOpen,
      anchorRef,
      anchorPoint,
      placement = 'bottom-start',
      offsetPx = 6,
      viewportPaddingPx = 8,
      onClose,
      closeOnEscape = true,
      returnFocusRef,
      role,
      ariaLabel,
      id,
      dataTestId,
      className = '',
      style,
      onMouseDown,
      onClick,
      children,
    },
    forwardedRef
  ) {
    const innerRef = useRef<HTMLDivElement | null>(null);
    useImperativeHandle(
      forwardedRef,
      () => innerRef.current as HTMLDivElement,
      []
    );

    const onCloseRef = useRef(onClose);
    onCloseRef.current = onClose;
    const returnFocusHolderRef = useRef(returnFocusRef);
    returnFocusHolderRef.current = returnFocusRef;

    const [coords, setCoords] = useState<{
      left: number;
      top: number;
      maxWidth: number;
    }>({
      left: viewportPaddingPx,
      top: viewportPaddingPx,
      maxWidth:
        typeof window !== 'undefined'
          ? Math.max(120, window.innerWidth - viewportPaddingPx * 2)
          : 304,
    });

    const updatePosition = useCallback(() => {
      if (typeof window === 'undefined') return;
      const el = innerRef.current;
      const anchorEl = anchorRef?.current;

      let anchorRect: {
        left: number;
        top: number;
        width: number;
        height: number;
      };
      if (anchorPoint) {
        anchorRect = {
          left: anchorPoint.x,
          top: anchorPoint.y,
          width: anchorPoint.width ?? 0,
          height: anchorPoint.height ?? 0,
        };
      } else if (anchorEl) {
        const r = anchorEl.getBoundingClientRect();
        anchorRect = {
          left: r.left,
          top: r.top,
          width: r.width,
          height: r.height,
        };
      } else {
        anchorRect = {
          left: viewportPaddingPx,
          top: viewportPaddingPx,
          width: 0,
          height: 0,
        };
      }

      const floatingWidth = el?.offsetWidth || 240;
      const floatingHeight = el?.offsetHeight || 120;

      const next = clampFloatingCoordinates({
        anchorRect,
        floatingWidth,
        floatingHeight,
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
        placement,
        offsetPx,
        paddingPx: viewportPaddingPx,
      });

      setCoords((prev) =>
        prev.left === next.left &&
        prev.top === next.top &&
        prev.maxWidth === next.maxWidth
          ? prev
          : next
      );
    }, [anchorPoint, anchorRef, offsetPx, placement, viewportPaddingPx]);

    useLayoutEffect(() => {
      if (!isOpen) return;
      updatePosition();
    }, [isOpen, updatePosition, children]);

    useEffect(() => {
      if (!isOpen || typeof window === 'undefined') return;
      const onResizeOrScroll = () => updatePosition();
      window.addEventListener('resize', onResizeOrScroll);
      window.addEventListener('scroll', onResizeOrScroll, true);
      return () => {
        window.removeEventListener('resize', onResizeOrScroll);
        window.removeEventListener('scroll', onResizeOrScroll, true);
      };
    }, [isOpen, updatePosition]);

    useEffect(() => {
      if (!isOpen || !closeOnEscape || !onCloseRef.current) return;
      const onKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          e.stopPropagation();
          onCloseRef.current?.();
          const focusTarget =
            returnFocusHolderRef.current?.current ?? anchorRef?.current;
          if (focusTarget && typeof focusTarget.focus === 'function') {
            focusTarget.focus();
            if (document.activeElement !== focusTarget) {
              window.requestAnimationFrame(() => {
                focusTarget.focus();
              });
            }
          }
        }
      };
      window.addEventListener('keydown', onKeyDown);
      return () => window.removeEventListener('keydown', onKeyDown);
    }, [isOpen, closeOnEscape, anchorRef]);

    if (!isOpen || typeof document === 'undefined') return null;

    return createPortal(
      <div
        ref={innerRef}
        id={id}
        role={role}
        aria-label={ariaLabel}
        data-testid={dataTestId}
        data-sideflow-portal="true"
        onMouseDown={onMouseDown}
        onClick={onClick}
        style={{
          position: 'fixed',
          left: `${coords.left}px`,
          top: `${coords.top}px`,
          maxWidth: `${coords.maxWidth}px`,
          zIndex: 90,
          ...style,
        }}
        className={className}
      >
        {children}
      </div>,
      document.body
    );
  }
);
