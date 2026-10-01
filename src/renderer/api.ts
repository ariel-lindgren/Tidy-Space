import type { TidySpaceApi } from '@shared/ipc';

declare global {
  interface Window {
    tidyspace: TidySpaceApi;
  }
}

/** Ponte com o processo principal (exposta pelo preload). Isolada aqui para facilitar mocks nos testes. */
export const api = (): TidySpaceApi => window.tidyspace;
