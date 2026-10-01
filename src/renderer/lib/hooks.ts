import { useEffect, useLayoutEffect, useRef, useState } from 'react';

/** Tamanho de um elemento, atualizado por ResizeObserver (agrupado por frame). */
export function useElementSize<T extends HTMLElement>(): [
  React.RefObject<T | null>,
  { width: number; height: number },
] {
  const ref = useRef<T>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    let frame = 0;
    const measure = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => setSize({ width: el.clientWidth, height: el.clientHeight }));
    };
    setSize({ width: el.clientWidth, height: el.clientHeight });
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => {
      cancelAnimationFrame(frame);
      ro.disconnect();
    };
  }, []);
  return [ref, size];
}

/** Interpolação 0→1 (ease-out) disparada quando `trigger` muda. Com `enabled=false` fica em 1. */
export function useTween(trigger: unknown, durationMs: number, enabled: boolean): number {
  const [t, setT] = useState(enabled ? 0 : 1);
  useEffect(() => {
    if (!enabled) {
      setT(1);
      return;
    }
    let frame = 0;
    const start = performance.now();
    const step = (now: number) => {
      const p = Math.min(1, (now - start) / durationMs);
      setT(1 - Math.pow(1 - p, 3));
      if (p < 1) frame = requestAnimationFrame(step);
    };
    setT(0);
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [trigger, durationMs, enabled]);
  return t;
}

/** Contador animado até `value`. */
export function useCountUp(value: number, durationMs: number, enabled: boolean): number {
  const [shown, setShown] = useState(enabled ? 0 : value);
  const from = useRef(0);
  useEffect(() => {
    if (!enabled) {
      setShown(value);
      return;
    }
    let frame = 0;
    const start = performance.now();
    const origin = from.current;
    const step = (now: number) => {
      const p = Math.min(1, (now - start) / durationMs);
      const v = origin + (value - origin) * (1 - Math.pow(1 - p, 4));
      setShown(v);
      from.current = v;
      if (p < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [value, durationMs, enabled]);
  return shown;
}

/** Atalhos globais; ignora quando o foco está num campo de texto (exceto se `allowInInputs`). */
export function useHotkey(
  match: (e: KeyboardEvent) => boolean,
  handler: (e: KeyboardEvent) => void,
  allowInInputs = false,
): void {
  const ref = useRef({ match, handler });
  ref.current = { match, handler };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = /^(input|textarea|select)$/i.test((e.target as HTMLElement)?.tagName ?? '');
      if (typing && !allowInInputs) return;
      if (ref.current.match(e)) ref.current.handler(e);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [allowInInputs]);
}
