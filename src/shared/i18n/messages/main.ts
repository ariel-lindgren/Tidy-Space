import { defineMessages } from '../define';

/** Textos gerados no processo principal: erros das ações de arquivo, política de segurança e diálogos. */
export default defineMessages(
  {
    pickFolderTitle: 'Escolha a pasta para analisar',
    itemNotFound: 'item não encontrado na análise atual',
    permanentDeleteDisabled: 'A exclusão definitiva está desativada nas configurações.',
    timeout:
      'tempo esgotado — o sistema pode ter aberto um pedido de permissão; verifique se há uma janela do sistema aberta',
    protectedItem: (reason: string) => `protegido: ${reason}`,
    engineExited: 'o processo de análise foi encerrado',
    engineUnavailable: 'processo de análise indisponível',
    engineTimeout: (method: string) => `tempo esgotado em ${method}`,
    appQuitting: 'aplicativo encerrando',
    /** Motivos da política de segurança (src/main/safety.ts). */
    safety: {
      relativePath: 'caminho relativo',
      volumeRoot: 'raiz do volume',
      homeOrAncestor: 'pasta do usuário ou um de seus ancestrais',
      systemFile: 'arquivo essencial do sistema',
      systemFolder: 'pasta protegida do sistema',
      containsSystemFolder: 'contém pasta do sistema',
    },
  },
  {
    pickFolderTitle: 'Choose a folder to scan',
    itemNotFound: 'item not found in the current scan',
    permanentDeleteDisabled: 'Permanent deletion is turned off in Settings.',
    timeout: 'timed out — the system may have opened a permission prompt; check for an open system window',
    protectedItem: (reason: string) => `protected: ${reason}`,
    engineExited: 'the scan process exited',
    engineUnavailable: 'scan process unavailable',
    engineTimeout: (method: string) => `timed out in ${method}`,
    appQuitting: 'app is quitting',
    safety: {
      relativePath: 'relative path',
      volumeRoot: 'volume root',
      homeOrAncestor: 'your user folder or one of its parents',
      systemFile: 'essential system file',
      systemFolder: 'protected system folder',
      containsSystemFolder: 'contains a system folder',
    },
  },
);
