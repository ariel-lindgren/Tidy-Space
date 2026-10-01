import { defineMessages } from '../define';

/**
 * Título e descrição de cada regra de sugestão, pela id da regra (`src/engine/suggestions/rules.ts`).
 * Lidos no engine ao calcular as sugestões e ao reabrir uma análise gravada (no idioma atual).
 */
export default defineMessages(
  {
    temp: {
      title: 'Arquivos temporários',
      description: 'Pastas temporárias do usuário e do sistema. Normalmente seguros de remover.',
    },
    'pnpm-store': {
      title: 'Store do pnpm',
      description:
        'Pacotes que nenhum projeto usa mais. Os demais são compartilhados com os node_modules (hard links) e não liberariam espaço.',
    },
    'package-caches': {
      title: 'Caches de pacotes',
      description: 'npm, Yarn, pip, Cargo, Go, Maven, Gradle e NuGet — são baixados de novo quando necessário.',
    },
    'dev-builds': {
      title: 'Artefatos de build do Xcode e simuladores',
      description: 'DerivedData e caches de simulador são recriados na próxima compilação.',
    },
    'node-modules': {
      title: 'node_modules inativos',
      description: 'Projetos sem alteração há mais de 90 dias. Um “npm install” recria tudo.',
    },
    installers: {
      title: 'Instaladores e imagens de disco antigos',
      description: 'Arquivos .exe, .msi, .iso, .dmg, .deb… em Downloads com mais de 6 meses.',
    },
    'crash-dumps': {
      title: 'Despejos de memória e relatórios de falha',
      description: 'Arquivos gerados quando aplicativos ou o sistema travam.',
    },
    'browser-caches': {
      title: 'Cache de navegadores',
      description: 'Chrome, Edge, Brave e Firefox — recriado automaticamente conforme você navega.',
    },
    'user-caches': {
      title: 'Outros caches de aplicativos',
      description: 'Conteúdo de ~/Library/Caches ou ~/.cache. Os apps recriam, mas podem ficar lentos na 1ª vez.',
    },
    'windows-update': {
      title: 'Cache do Windows Update',
      description: 'Pacotes de atualização já instalados. Requer o serviço do Windows Update parado.',
    },
    trash: {
      title: 'Lixeira',
      description: 'Itens já excluídos continuam ocupando espaço até a Lixeira ser esvaziada.',
      /** "Comando" mostrado no macOS: é uma instrução de interface, não um comando de terminal. */
      finderCommand: 'Finder › Esvaziar Lixo',
    },
    hibernation: {
      title: 'Arquivo de hibernação',
      description: 'Desativar a hibernação libera este espaço. Requer terminal como administrador.',
    },
  },
  {
    temp: {
      title: 'Temporary files',
      description: 'User and system temporary folders. Usually safe to remove.',
    },
    'pnpm-store': {
      title: 'pnpm store',
      description:
        'Packages no project uses anymore. The rest are shared with node_modules (hard links) and would not free any space.',
    },
    'package-caches': {
      title: 'Package caches',
      description: 'npm, Yarn, pip, Cargo, Go, Maven, Gradle and NuGet — downloaded again when needed.',
    },
    'dev-builds': {
      title: 'Xcode build artifacts and simulators',
      description: 'DerivedData and simulator caches are recreated on the next build.',
    },
    'node-modules': {
      title: 'Inactive node_modules',
      description: 'Projects unchanged for more than 90 days. An “npm install” recreates everything.',
    },
    installers: {
      title: 'Old installers and disk images',
      description: '.exe, .msi, .iso, .dmg, .deb… files in Downloads older than 6 months.',
    },
    'crash-dumps': {
      title: 'Memory dumps and crash reports',
      description: 'Files created when apps or the system crash.',
    },
    'browser-caches': {
      title: 'Browser caches',
      description: 'Chrome, Edge, Brave and Firefox — rebuilt automatically as you browse.',
    },
    'user-caches': {
      title: 'Other app caches',
      description: 'Contents of ~/Library/Caches or ~/.cache. Apps recreate them, but may be slow the first time.',
    },
    'windows-update': {
      title: 'Windows Update cache',
      description: 'Update packages that are already installed. Requires the Windows Update service to be stopped.',
    },
    trash: {
      title: 'Trash',
      description: 'Deleted items keep taking up space until the Trash is emptied.',
      finderCommand: 'Finder › Empty Trash',
    },
    hibernation: {
      title: 'Hibernation file',
      description: 'Turning off hibernation frees this space. Requires a terminal run as administrator.',
    },
  },
);
