import { defineMessages } from '../define';

/** Tela de ajustes e avisos do settingsStore. */
export default defineMessages(
  {
    eyebrow: 'Preferências',
    title: 'Ajustes',

    appearance: 'Aparência',
    theme: 'Tema',
    language: 'Idioma',
    languageHint: 'Idioma da interface. “Automático” segue o idioma do sistema operacional.',
    languageSystem: 'Automático (idioma do sistema)',
    languageSystemTitle: (name: string) => `Idioma do sistema: ${name}`,
    motion: 'Animações',
    motionHint: 'Transições, zoom dos gráficos e efeitos. “Reduzida” é para quem prefere menos movimento.',
    motionFull: 'Completa',
    motionReduced: 'Reduzida',
    motionOff: 'Desligada',
    backgroundFx: 'Efeitos de fundo',
    backgroundFxHint: 'Grade em perspectiva e brilhos animados atrás da interface.',

    analysis: 'Análise',
    units: 'Unidades',
    unitsHint: 'Binário (1 GB = 1024³ bytes, como o Windows) ou decimal (como o fabricante do disco e o macOS).',
    unitsBinary: 'Binário',
    unitsDecimal: 'Decimal',
    measure: 'Tamanho considerado',
    measureHint:
      'Em disco: o que realmente ocupa espaço — arquivos do OneDrive/iCloud/Dropbox que estão só na nuvem contam 0. Lógico: o tamanho nominal de cada arquivo.',
    measureDisk: 'Em disco',
    measureLogical: 'Lógico',
    cloudBlind:
      'O motor de varredura em uso (Node) não consegue identificar arquivos que estão só na nuvem no Windows; eles aparecem com o tamanho completo. O motor nativo (Rust) identifica.',
    includeHidden: 'Incluir arquivos ocultos e de sistema',
    includeHiddenHint: 'Arquivos de paginação e hibernação, lixeira, pastas que começam com ponto etc.',
    followSymlinks: 'Seguir links simbólicos e junctions',
    followSymlinksHint: 'Pode contar o mesmo conteúdo duas vezes. Ciclos são detectados.',
    hardLinks: 'Identificar hard links (pnpm, WinSxS)',
    hardLinksHint:
      'Conta uma vez só o conteúdo com vários nomes e mostra o que a limpeza realmente libera. No Windows, deixa a varredura de node_modules do pnpm e da pasta do Windows mais lenta.',
    oneFilesystem: 'Não atravessar para outros sistemas de arquivos',
    oneFilesystemHint: 'Linux/macOS: ignora pontos de montagem dentro da pasta analisada (como du -x).',
    threads: 'Threads de varredura',
    threadsHint: (engine: string) =>
      `0 = automático. SSDs se beneficiam de mais threads; em HDs, 2–4 costuma ser o ideal. Motor: ${engine}.`,
    threadsAuto: 'auto',
    fastPathWin: 'listagem paralela (o tamanho já vem na listagem)',
    fastPathMac: 'leitura paralela com lstat',
    fastPathLinux: 'leitura paralela com statx',

    savedScans: 'Análises salvas',
    keep: 'Guardar as últimas',
    keepHint:
      'As análises ficam num banco local e podem ser reabertas sem varrer de novo. As mais antigas são apagadas automaticamente.',
    keepLabel: 'Quantidade de análises guardadas',
    storage: 'Espaço usado',
    storageHint: (count: string) => `${count} análises gravadas na pasta de dados do app (subpasta scans).`,
    deleteAll: 'Apagar todas',
    confirmDeleteAll: 'Confirmar: apagar todas',
    allDeleted: 'Todas as análises foram apagadas',

    cleanup: 'Limpeza',
    permanent: 'Permitir exclusão definitiva',
    permanentHint:
      'Por padrão os itens vão para a Lixeira. Ligando isto, a fila de limpeza ganha a opção de apagar sem volta (com confirmação extra).',
    permanentNotice:
      'A exclusão definitiva não pode ser desfeita. Pastas do sistema e a sua pasta pessoal continuam protegidas.',

    exclusions: 'Exclusões',
    // Recebe os exemplos já formatados (elementos <code>) e devolve as partes da frase na ordem do idioma.
    exclusionsHint: <T>(path: T, name: T, ext: T) => [
      'Caminhos (',
      path,
      '), nomes (',
      name,
      ') ou extensões (',
      ext,
      ') ignorados nas análises.',
    ],
    removeExclusion: (path: string) => `Remover exclusão ${path}`,
    exclusionPlaceholder: 'Ex.: D:\\Jogos, node_modules ou *.tmp',
    newExclusion: 'Nova exclusão',

    about: 'Sobre',
    engine: 'Motor de varredura:',
    engineChosen: (choice: string) => `escolhido com --engine=${choice}`,
    nativeFailedStrict:
      'O módulo nativo não carregou e --engine=native não permite usar o Node: as análises vão falhar.',
    nativeFailed: 'O módulo nativo não carregou; a análise funciona, porém mais devagar.',

    saveFailed: (error: string) => `Não foi possível salvar: ${error}`,
  },
  {
    eyebrow: 'Preferences',
    title: 'Settings',

    appearance: 'Appearance',
    theme: 'Theme',
    language: 'Language',
    languageHint: 'Interface language. “Automatic” follows the operating system language.',
    languageSystem: 'Automatic (system language)',
    languageSystemTitle: (name: string) => `System language: ${name}`,
    motion: 'Animations',
    motionHint: 'Transitions, chart zoom and effects. “Reduced” is for those who prefer less motion.',
    motionFull: 'Full',
    motionReduced: 'Reduced',
    motionOff: 'Off',
    backgroundFx: 'Background effects',
    backgroundFxHint: 'Perspective grid and animated glows behind the interface.',

    analysis: 'Scanning',
    units: 'Units',
    unitsHint: 'Binary (1 GB = 1024³ bytes, like Windows) or decimal (like drive manufacturers and macOS).',
    unitsBinary: 'Binary',
    unitsDecimal: 'Decimal',
    measure: 'Size to count',
    measureHint:
      'On disk: the space actually taken — OneDrive/iCloud/Dropbox files that live only in the cloud count as 0. Logical: the nominal size of each file.',
    measureDisk: 'On disk',
    measureLogical: 'Logical',
    cloudBlind:
      'The scan engine in use (Node) cannot detect cloud-only files on Windows; they show up at full size. The native engine (Rust) can.',
    includeHidden: 'Include hidden and system files',
    includeHiddenHint: 'Page and hibernation files, the trash, folders starting with a dot, etc.',
    followSymlinks: 'Follow symbolic links and junctions',
    followSymlinksHint: 'May count the same content twice. Loops are detected.',
    hardLinks: 'Detect hard links (pnpm, WinSxS)',
    hardLinksHint:
      'Counts content with several names only once and shows what a cleanup really frees. On Windows, it slows down scanning pnpm node_modules and the Windows folder.',
    oneFilesystem: 'Stay on one file system',
    oneFilesystemHint: 'Linux/macOS: skips mount points inside the scanned folder (like du -x).',
    threads: 'Scan threads',
    threadsHint: (engine: string) =>
      `0 = automatic. SSDs benefit from more threads; on HDDs, 2–4 is usually best. Engine: ${engine}.`,
    threadsAuto: 'auto',
    fastPathWin: 'parallel listing (sizes come with the listing)',
    fastPathMac: 'parallel reads with lstat',
    fastPathLinux: 'parallel reads with statx',

    savedScans: 'Saved scans',
    keep: 'Keep the latest',
    keepHint:
      'Scans are stored in a local database and can be reopened without rescanning. Older ones are deleted automatically.',
    keepLabel: 'Number of saved scans',
    storage: 'Storage used',
    storageHint: (count: string) => `${count} scans stored in the app data folder (scans subfolder).`,
    deleteAll: 'Delete all',
    confirmDeleteAll: 'Confirm: delete all',
    allDeleted: 'All scans were deleted',

    cleanup: 'Cleanup',
    permanent: 'Allow permanent deletion',
    permanentHint:
      'By default, items go to the Trash. Turning this on gives the cleanup queue an option to delete permanently (with extra confirmation).',
    permanentNotice: 'Permanent deletion cannot be undone. System folders and your home folder stay protected.',

    exclusions: 'Exclusions',
    exclusionsHint: <T>(path: T, name: T, ext: T) => [
      'Paths (',
      path,
      '), names (',
      name,
      ') or extensions (',
      ext,
      ') skipped during scans.',
    ],
    removeExclusion: (path: string) => `Remove exclusion ${path}`,
    exclusionPlaceholder: 'E.g. D:\\Games, node_modules or *.tmp',
    newExclusion: 'New exclusion',

    about: 'About',
    engine: 'Scan engine:',
    engineChosen: (choice: string) => `selected with --engine=${choice}`,
    nativeFailedStrict:
      'The native module failed to load and --engine=native does not allow falling back to Node: scans will fail.',
    nativeFailed: 'The native module failed to load; scanning still works, but more slowly.',

    saveFailed: (error: string) => `Could not save: ${error}`,
  },
);
