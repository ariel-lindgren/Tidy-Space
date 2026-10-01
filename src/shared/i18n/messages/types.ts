import { defineMessages } from '../define';

/** Tela Tipos de arquivo. */
export default defineMessages(
  {
    title: 'Tipos de arquivo',
    subtitle:
      'Como o espaço se divide por categoria e por extensão. Clique numa categoria para ver os maiores arquivos dela.',
    total: 'TOTAL',
    hoverHint: 'Passe o mouse ou clique nas fatias',
    filesShort: (count: string) => `${count} arq.`,
    heaviestExtensions: 'Extensões mais pesadas',
    largestIn: (category: string) => `Maiores em ${category}`,
    seeAllInLargest: 'Ver todos em Maiores',
    showNameInExplore: (name: string) => `Mostrar ${name} no Explorar`,
  },
  {
    title: 'File types',
    subtitle: 'How space breaks down by category and extension. Click a category to see its largest files.',
    total: 'TOTAL',
    hoverHint: 'Hover or click the slices',
    filesShort: (count: string) => `${count} files`,
    heaviestExtensions: 'Heaviest extensions',
    largestIn: (category: string) => `Largest in ${category}`,
    seeAllInLargest: 'See all in Largest',
    showNameInExplore: (name: string) => `Show ${name} in Explore`,
  },
);
