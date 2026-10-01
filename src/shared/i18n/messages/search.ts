import { defineMessages } from '../define';

/** Busca global (Ctrl K). */
export default defineMessages(
  {
    label: 'Buscar',
    placeholder: (root: string) => `Buscar em ${root}…`,
    pickVolume: 'Escolha um volume para analisar',
    scanVolume: (mountPoint: string) => `Analisar ${mountPoint}`,
    nothingFound: 'Nada encontrado',
  },
  {
    label: 'Search',
    placeholder: (root: string) => `Search in ${root}…`,
    pickVolume: 'Choose a drive to scan',
    scanVolume: (mountPoint: string) => `Scan ${mountPoint}`,
    nothingFound: 'No results',
  },
);
