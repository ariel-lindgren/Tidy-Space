import type { CategoryId } from '../../types';
import { defineMessages } from '../define';

export default defineMessages<Record<CategoryId, string>>(
  {
    video: 'Vídeos',
    image: 'Imagens',
    audio: 'Áudio',
    doc: 'Documentos',
    code: 'Código e dependências',
    archive: 'Compactados',
    install: 'Instaladores e binários',
    vdisk: 'Discos virtuais',
    system: 'Sistema e cache',
    other: 'Outros',
  },
  {
    video: 'Videos',
    image: 'Images',
    audio: 'Audio',
    doc: 'Documents',
    code: 'Code and dependencies',
    archive: 'Archives',
    install: 'Installers and binaries',
    vdisk: 'Virtual disks',
    system: 'System and cache',
    other: 'Other',
  },
);
