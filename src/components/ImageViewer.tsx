/**
 * Fullscreen preview for an image tapped inside a post. Pinch (or wheel) to
 * zoom, drag to pan while zoomed, tap to reset/close. Opening pushes a history
 * entry so the device back button closes the preview instead of leaving the
 * thread.
 */
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { t } from '../lib/i18n';

const MAX_SCALE = 6;

interface Props {
  src: string | null;
  onClose: () => void;
}

type Point = { x: number; y: number };

const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
const center = (a: Point, b: Point) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

export function ImageViewer({ src, onClose }: Props) {
  const [scale, setScale] = useState(1);
  const [pan, setPan] = useState<Point>({ x: 0, y: 0 });
  const pointers = useRef(new Map<number, Point>());
  const pinch = useRef<{ dist: number; scale: number; center: Point } | null>(null);
  const tap = useRef<{ from: Point; moved: boolean } | null>(null);
  // Kept in a ref so the history effect doesn't re-run (and re-push) when the
  // caller hands us a fresh closure.
  const close = useRef(onClose);
  close.current = onClose;

  useEffect(() => {
    if (!src) return;
    setScale(1);
    setPan({ x: 0, y: 0 });
    pointers.current.clear();

    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close.current();
    const onPop = () => close.current();
    // Same URL, existing router state — the router treats the back press as a
    // no-op navigation and we absorb it here.
    window.history.pushState({ ...window.history.state, imageViewer: true }, '');
    window.addEventListener('keydown', onKey);
    window.addEventListener('popstate', onPop);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('popstate', onPop);
      document.body.style.overflow = prevOverflow;
      if (window.history.state?.imageViewer) window.history.back();
    };
  }, [src]);

  if (!src) return null;

  const onPointerDown = (e: React.PointerEvent) => {
    (e.target as Element).setPointerCapture?.(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 1) {
      tap.current = { from: { x: e.clientX, y: e.clientY }, moved: false };
    } else if (pointers.current.size === 2) {
      tap.current = null;
      const [a, b] = [...pointers.current.values()];
      pinch.current = { dist: dist(a, b), scale, center: center(a, b) };
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const prev = pointers.current.get(e.pointerId);
    if (!prev) return;
    const cur = { x: e.clientX, y: e.clientY };
    pointers.current.set(e.pointerId, cur);
    if (tap.current && dist(tap.current.from, cur) > 10) tap.current.moved = true;

    if (pointers.current.size >= 2 && pinch.current) {
      const [a, b] = [...pointers.current.values()];
      const next = center(a, b);
      const ratio = dist(a, b) / pinch.current.dist;
      setScale(Math.min(MAX_SCALE, Math.max(1, pinch.current.scale * ratio)));
      setPan((p) => ({
        x: p.x + next.x - pinch.current!.center.x,
        y: p.y + next.y - pinch.current!.center.y
      }));
      pinch.current.center = next;
    } else if (pointers.current.size === 1 && scale > 1) {
      setPan((p) => ({ x: p.x + cur.x - prev.x, y: p.y + cur.y - prev.y }));
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
    if (pointers.current.size > 0) return;
    const wasTap = tap.current && !tap.current.moved;
    tap.current = null;
    if (wasTap) {
      if (scale > 1) {
        setScale(1);
        setPan({ x: 0, y: 0 });
      } else {
        onClose();
      }
    } else if (scale <= 1) {
      setPan({ x: 0, y: 0 });
    }
  };

  const onWheel = (e: React.WheelEvent) => {
    setScale((s) => Math.min(MAX_SCALE, Math.max(1, s * (e.deltaY < 0 ? 1.15 : 1 / 1.15))));
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center overflow-hidden bg-black/95 select-none"
      style={{ touchAction: 'none' }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onWheel={onWheel}
    >
      <img
        src={src}
        alt=""
        draggable={false}
        className="max-h-full max-w-full object-contain"
        style={{ transform: `translate3d(${pan.x}px, ${pan.y}px, 0) scale(${scale})` }}
      />
      <button
        type="button"
        aria-label={t('common.close')}
        className="absolute right-3 flex h-10 w-10 items-center justify-center rounded-full bg-black/50 text-xl text-white"
        style={{ top: 'calc(env(safe-area-inset-top, 0px) + 0.75rem)' }}
        onClick={onClose}
        onPointerDown={(e) => e.stopPropagation()}
        onPointerUp={(e) => e.stopPropagation()}
      >
        ✕
      </button>
    </div>,
    document.body
  );
}
