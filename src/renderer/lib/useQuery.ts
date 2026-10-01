import { useEffect, useRef, useState } from 'react';
import type { ScanSummary } from '@shared/types';

/** Chave de cache de uma análise: muda ao abrir outra, ao alterar a árvore ou ao trocar a medida. */
export const scanKey = (s: ScanSummary): string => `${s.id}|${s.treeVersion}|${s.measure}`;

export interface QueryState<T> {
  data: T | undefined;
  error: Error | null;
  loading: boolean;
}

const CACHE_LIMIT = 200;
const cache = new Map<string, unknown>();

function remember(key: string, value: unknown): void {
  cache.delete(key);
  cache.set(key, value);
  if (cache.size > CACHE_LIMIT) cache.delete(cache.keys().next().value as string);
}

/** Limpa o cache (ex.: ao carregar uma nova análise). */
export function clearQueryCache(): void {
  cache.clear();
}

/**
 * Busca assíncrona com cache em memória e proteção contra respostas fora de ordem.
 * A chave deve incluir tudo do que o resultado depende (inclusive a versão da árvore).
 * Enquanto uma nova chave carrega, o dado anterior continua visível (sem "piscar").
 */
export function useQuery<T>(key: readonly unknown[] | null, fetcher: () => Promise<T>): QueryState<T> {
  const k = key ? JSON.stringify(key) : null;
  const [state, setState] = useState<QueryState<T>>(() => ({
    data: k && cache.has(k) ? (cache.get(k) as T) : undefined,
    error: null,
    loading: !!k && !cache.has(k),
  }));
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  useEffect(() => {
    if (!k) return;
    if (cache.has(k)) {
      setState({ data: cache.get(k) as T, error: null, loading: false });
      return;
    }
    let alive = true;
    setState(s => ({ ...s, loading: true, error: null }));
    fetcherRef.current().then(
      data => {
        remember(k, data);
        if (alive) setState({ data, error: null, loading: false });
      },
      (error: unknown) => {
        if (alive)
          setState(s => ({ ...s, error: error instanceof Error ? error : new Error(String(error)), loading: false }));
      },
    );
    return () => {
      alive = false;
    };
  }, [k]);

  return state;
}
