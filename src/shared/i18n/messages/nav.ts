import type { ThemeId } from '../../themes';
import { defineMessages } from '../define';

/** Estrutura do app: raiz (App.tsx), barra lateral, barra de título, barra de status e componentes comuns. */
export default defineMessages(
  {
    dropTitle: 'Solte a pasta para analisar',
    dropHint: 'A análise começa imediatamente, só dessa pasta para baixo',
    dropUnreadable: 'Não foi possível ler o caminho do item arrastado',
    engineFailed: (error: string) => `Falha ao iniciar o motor de análise: ${error}`,

    // Barra de título
    searchPlaceholder: 'Buscar arquivos e pastas na análise…',
    switchTheme: 'Alternar tema',
    settings: 'Ajustes',
    minimize: 'Minimizar',
    maximize: 'Maximizar',
    restore: 'Restaurar',
    close: 'Fechar',

    // Barra lateral
    mainNav: 'Navegação principal',
    home: 'Início',
    explore: 'Explorar',
    largest: 'Maiores',
    types: 'Tipos',
    clean: 'Limpeza',
    navSaving: 'Salvando',
    navScanning: 'Analisando',

    // Barra de status
    scanProgressTitle: 'Ver o progresso da análise',
    scanStatus: (saving: boolean, percent: number | null) =>
      `${saving ? 'Salvando análise' : 'Analisando'}${percent !== null ? ` ${percent}%` : '…'} · ver progresso`,
    ready: 'Pronto',
    cleanupProgressTitle: 'Ver o progresso da limpeza',
    cleaning: (current: number, total: number) => `Limpando ${current} de ${total} · ver`,
    totals: (files: string, size: string, onDisk: boolean) =>
      `${files} arquivos · ${size}${onDisk ? ' em disco' : ' (lógico)'}`,
    scannedIn: (duration: string) => `varredura em ${duration}`,
    noAccess: (count: string) => `${count} itens sem acesso`,
    noScan: 'Nenhuma análise carregada',
    engine: (label: string) => `Motor ${label}`,
    theme: (name: string) => `Tema: ${name}`,

    // Motor de varredura (barra de status e ajustes)
    engineNative: 'nativo (Rust)',
    engineNode: 'Node',
    engineFallback: 'Node (fallback)',

    // Descrição dos temas (os nomes são próprios e não se traduzem)
    themeDesc: {
      neon: 'Escuro · ciano/violeta',
      aurora: 'Escuro · lilás/menta',
      solar: 'Terminal âmbar',
      glacier: 'Claro · azul',
    } satisfies Record<ThemeId, string>,

    // Menu de contexto e ações sobre itens
    actionsFor: (name: string) => `Ações para ${name}`,
    exploreFolder: 'Explorar esta pasta',
    showInExplore: 'Mostrar no Explorar',
    scanOnlyFolder: 'Analisar somente esta pasta',
    reveal: 'Mostrar no gerenciador de arquivos',
    revealed: (name: string) => `“${name}” mostrado no gerenciador de arquivos`,
    openFromCloud: 'Abrir (baixa da nuvem)',
    open: 'Abrir',
    downloading: (size: string) => `Baixando ${size} da nuvem para abrir…`,
    opening: (name: string) => `Abrindo “${name}”`,
    copyPath: 'Copiar caminho',
    pathCopied: 'Caminho copiado',
    removeFromCleanup: 'Remover da limpeza',
    addToCleanup: 'Adicionar à limpeza',
    addedToCleanup: (n: number) => `${n} ${n > 1 ? 'itens adicionados' : 'item adicionado'} à limpeza`,
    alreadyQueued: 'Já está na fila de limpeza',

    // Componentes comuns
    errorTitle: 'Algo deu errado',
    retry: 'Tentar de novo',
    inUse: 'em uso',
  },
  {
    dropTitle: 'Drop the folder to analyze',
    dropHint: 'Analysis starts right away, from that folder down',
    dropUnreadable: 'Could not read the path of the dropped item',
    engineFailed: (error: string) => `Failed to start the analysis engine: ${error}`,

    searchPlaceholder: 'Search files and folders in the scan…',
    switchTheme: 'Switch theme',
    settings: 'Settings',
    minimize: 'Minimize',
    maximize: 'Maximize',
    restore: 'Restore',
    close: 'Close',

    mainNav: 'Main navigation',
    home: 'Home',
    explore: 'Explore',
    largest: 'Largest',
    types: 'Types',
    clean: 'Cleanup',
    navSaving: 'Saving',
    navScanning: 'Scanning',

    scanProgressTitle: 'Show scan progress',
    scanStatus: (saving: boolean, percent: number | null) =>
      `${saving ? 'Saving scan' : 'Scanning'}${percent !== null ? ` ${percent}%` : '…'} · view progress`,
    ready: 'Ready',
    cleanupProgressTitle: 'Show cleanup progress',
    cleaning: (current: number, total: number) => `Cleaning ${current} of ${total} · view`,
    totals: (files: string, size: string, onDisk: boolean) =>
      `${files} files · ${size}${onDisk ? ' on disk' : ' (logical)'}`,
    scannedIn: (duration: string) => `scanned in ${duration}`,
    noAccess: (count: string) => `${count} items not accessible`,
    noScan: 'No scan loaded',
    engine: (label: string) => `Engine: ${label}`,
    theme: (name: string) => `Theme: ${name}`,

    engineNative: 'native (Rust)',
    engineNode: 'Node',
    engineFallback: 'Node (fallback)',

    themeDesc: {
      neon: 'Dark · cyan/violet',
      aurora: 'Dark · lilac/mint',
      solar: 'Amber terminal',
      glacier: 'Light · blue',
    },

    actionsFor: (name: string) => `Actions for ${name}`,
    exploreFolder: 'Explore this folder',
    showInExplore: 'Show in Explore',
    scanOnlyFolder: 'Scan only this folder',
    reveal: 'Show in file manager',
    revealed: (name: string) => `Showed “${name}” in the file manager`,
    openFromCloud: 'Open (downloads from the cloud)',
    open: 'Open',
    downloading: (size: string) => `Downloading ${size} from the cloud to open…`,
    opening: (name: string) => `Opening “${name}”`,
    copyPath: 'Copy path',
    pathCopied: 'Path copied',
    removeFromCleanup: 'Remove from cleanup',
    addToCleanup: 'Add to cleanup',
    addedToCleanup: (n: number) => `${n} ${n > 1 ? 'items' : 'item'} added to cleanup`,
    alreadyQueued: 'Already in the cleanup queue',

    errorTitle: 'Something went wrong',
    retry: 'Try again',
    inUse: 'used',
  },
);
