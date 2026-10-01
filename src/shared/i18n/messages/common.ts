import { defineMessages } from '../define';

/** Textos genéricos reaproveitados em várias telas. */
export default defineMessages(
  {
    cancel: 'Cancelar',
    close: 'Fechar',
    done: 'Concluir',
    save: 'Salvar',
    add: 'Adicionar',
    remove: 'Remover',
    folder: 'pasta',
    file: 'arquivo',
    items: (n: number) => `${n} ${n === 1 ? 'item' : 'itens'}`,
    files: (n: string | number) => `${n} ${String(n) === '1' ? 'arquivo' : 'arquivos'}`,
  },
  {
    cancel: 'Cancel',
    close: 'Close',
    done: 'Done',
    save: 'Save',
    add: 'Add',
    remove: 'Remove',
    folder: 'folder',
    file: 'file',
    items: (n: number) => `${n} ${n === 1 ? 'item' : 'items'}`,
    files: (n: string | number) => `${n} ${String(n) === '1' ? 'file' : 'files'}`,
  },
);
