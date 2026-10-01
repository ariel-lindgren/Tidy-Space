import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

/**
 * Diálogo modal acessível: foco preso dentro, Esc fecha, clique fora fecha (se permitido),
 * foco devolvido a quem abriu. Animação de saída antes de desmontar.
 */
export function Modal({
  onClose,
  children,
  dismissable = true,
  label,
  className = '',
  top = false,
}: {
  onClose: () => void;
  children: ReactNode;
  dismissable?: boolean;
  label: string;
  className?: string;
  top?: boolean;
}) {
  const [leaving, setLeaving] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const close = () => {
    if (!dismissable || leaving) return;
    setLeaving(true);
    setTimeout(onClose, 180);
  };
  const closeRef = useRef(close);
  closeRef.current = close;

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const first = box.current?.querySelector<HTMLElement>('input, button:not([disabled]), [tabindex="0"]');
    first?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        closeRef.current();
      }
      if (e.key !== 'Tab' || !box.current) return;
      const focusables = [
        ...box.current.querySelectorAll<HTMLElement>('input, button:not([disabled]), [tabindex="0"]'),
      ];
      if (!focusables.length) return;
      const [a, z] = [focusables[0] as HTMLElement, focusables[focusables.length - 1] as HTMLElement];
      if (e.shiftKey && document.activeElement === a) {
        e.preventDefault();
        z.focus();
      } else if (!e.shiftKey && document.activeElement === z) {
        e.preventDefault();
        a.focus();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      previous?.focus?.();
    };
  }, []);

  return createPortal(
    <div className={`modal-back ${leaving ? 'out' : ''}`} onMouseDown={e => e.target === e.currentTarget && close()}>
      <div
        ref={box}
        className={`modal panel ${className}`}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        style={top ? { alignSelf: 'start', marginTop: '12vh' } : undefined}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}
