import { defineMessages } from '../define';

/** Textos gerados no processo engine (e a explicação da pré-checagem de exclusão, usada no main). */
export default defineMessages(
  {
    /** Nome do grupo "outros" nos gráficos. */
    smallerItems: (n: number) => `${n} ${n > 1 ? 'itens menores' : 'item menor'}`,
    itemNotInScan: (id: number) => `item ${id} não existe nesta análise`,
    scanNotFound: 'análise não encontrada',
    noScanLoaded: 'nenhuma análise carregada',
    notAFolder: (path: string) => `o caminho não é uma pasta: ${path}`,
    nodeEngineChosen: 'motor Node escolhido na inicialização',
    nativeRequired: (reason: string) => `motor nativo exigido (--engine=native), mas não carregou: ${reason}`,
    nativeModuleNotFound: (pattern: string, dirs: string) => `módulo ${pattern} não encontrado em ${dirs}`,
    /** Por que um item não pôde ser removido (`where` = " (caminho)" ou vazio). */
    blockPermission: (where: string) => `requer permissão de administrador${where}`,
    blockInUse: (where: string) => `em uso por outro programa${where}`,
    blockMissing: 'não existe mais no disco',
    blockOther: (where: string, message: string) => `não pode ser removido${where}: ${message}`,
    unknownError: 'erro desconhecido',
  },
  {
    smallerItems: (n: number) => `${n} smaller ${n > 1 ? 'items' : 'item'}`,
    itemNotInScan: (id: number) => `item ${id} does not exist in this scan`,
    scanNotFound: 'scan not found',
    noScanLoaded: 'no scan loaded',
    notAFolder: (path: string) => `the path is not a folder: ${path}`,
    nodeEngineChosen: 'Node engine chosen at startup',
    nativeRequired: (reason: string) => `native engine required (--engine=native), but it failed to load: ${reason}`,
    nativeModuleNotFound: (pattern: string, dirs: string) => `module ${pattern} not found in ${dirs}`,
    blockPermission: (where: string) => `requires administrator permission${where}`,
    blockInUse: (where: string) => `in use by another program${where}`,
    blockMissing: 'no longer exists on disk',
    blockOther: (where: string, message: string) => `cannot be removed${where}: ${message}`,
    unknownError: 'unknown error',
  },
);
