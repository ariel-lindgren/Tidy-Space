import { defineMessages } from '../define';

/** Tela inicial: discos, análises salvas e atalhos. */
export default defineMessages(
  {
    eyebrow: 'Análise de espaço em disco',
    // Título com a palavra em destaque no meio: antes + destaque + depois.
    titleBefore: 'Onde está o seu ',
    titleAccent: 'espaço',
    titleAfter: '?',
    sub: 'Escolha um disco inteiro ou apenas uma pasta. Você explora o resultado em gráfico ou em tabela.',
    scanFolder: 'Analisar pasta…',

    bannerSaving: 'Salvando a análise',
    bannerScanning: 'Análise em andamento',
    viewProgress: 'Ver progresso',

    removable: 'removível',
    used: 'Usado',
    free: 'Livre',
    loaded: 'Análise carregada',
    lastScan: (when: string) => `Última análise ${when}`,
    neverScanned: 'Nunca analisado',
    scan: 'Analisar',

    folderCardTitle: 'Analisar uma pasta',
    folderCardHint: 'Escolha uma pasta ou arraste-a para esta janela. Só o que está dentro dela é analisado.',

    savedScans: 'Análises salvas',
    noScans: 'Nenhuma análise ainda.',
    openTitle: 'Abrir esta análise (sem varrer de novo)',
    onDisk: (size: string) => `${size} em disco`,
    inCloud: (size: string) => `${size} na nuvem`,
    openTag: 'aberta',
    rescanTitle: 'Analisar de novo',
    rescanLabel: (path: string) => `Analisar ${path} de novo`,
    deleteTitle: 'Apagar esta análise',
    deleteLabel: (path: string) => `Apagar análise de ${path}`,

    shortcuts: 'Atalhos',
    kSearch: 'Buscar na análise',
    kUp: 'Subir um nível',
    kChart: 'Alternar gráfico',
    kTheme: 'Trocar tema',
  },
  {
    eyebrow: 'Disk space analysis',
    titleBefore: 'Where did your ',
    titleAccent: 'space',
    titleAfter: ' go?',
    sub: 'Pick a whole drive or just one folder, then explore the results as a chart or a table.',
    scanFolder: 'Scan folder…',

    bannerSaving: 'Saving the scan',
    bannerScanning: 'Scan in progress',
    viewProgress: 'View progress',

    removable: 'removable',
    used: 'Used',
    free: 'Free',
    loaded: 'Scan loaded',
    lastScan: (when: string) => `Last scanned ${when}`,
    neverScanned: 'Never scanned',
    scan: 'Scan',

    folderCardTitle: 'Scan a folder',
    folderCardHint: 'Choose a folder or drag it onto this window. Only what is inside it gets scanned.',

    savedScans: 'Saved scans',
    noScans: 'No scans yet.',
    openTitle: 'Open this scan (without rescanning)',
    onDisk: (size: string) => `${size} on disk`,
    inCloud: (size: string) => `${size} in the cloud`,
    openTag: 'open',
    rescanTitle: 'Scan again',
    rescanLabel: (path: string) => `Scan ${path} again`,
    deleteTitle: 'Delete this scan',
    deleteLabel: (path: string) => `Delete scan of ${path}`,

    shortcuts: 'Keyboard shortcuts',
    kSearch: 'Search the scan',
    kUp: 'Go up one level',
    kChart: 'Switch chart',
    kTheme: 'Change theme',
  },
);
