import { execFileSync } from 'node:child_process';
import {
  existsSync,
  linkSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { electronEnv, seedSettings } from './helpers';

/**
 * Fluxos principais no app real (build em `out/`), com diretório de dados isolado.
 * Chamadas ao sistema (seletor de pasta, gerenciador de arquivos, abrir arquivo) são
 * interceptadas no processo principal para verificar que foram feitas com o caminho certo.
 */
test.describe.configure({ mode: 'serial' });

let app: ElectronApplication;
let page: Page;
let fixture: string;
let other: string;
let userData: string;

const write = (root: string, rel: string, bytes: number) => {
  const full = path.join(root, rel);
  mkdirSync(path.dirname(full), { recursive: true });
  writeFileSync(full, Buffer.alloc(bytes, 1));
};

async function launch(): Promise<void> {
  app = await electron.launch({
    args: ['.'],
    env: electronEnv({
      TIDYSPACE_USER_DATA: userData,
      TIDYSPACE_TEST_SCAN_DELAY_MS: '1500',
      TIDYSPACE_TEST_TRASH_DELAY_MS: '2500',
    }),
  });
  page = await app.firstWindow();
  if (process.env.E2E_SCREENSHOTS) await page.setViewportSize({ width: 1440, height: 860 });
  // Intercepta APIs do sistema no processo principal.
  await app.evaluate(({ shell, dialog }) => {
    const g = globalThis as unknown as { __calls: [string, string][]; __pick: string };
    g.__calls = [];
    shell.showItemInFolder = (p: string) => void g.__calls.push(['reveal', p]);
    shell.openPath = async (p: string) => {
      g.__calls.push(['open', p]);
      return '';
    };
    dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [g.__pick] })) as typeof dialog.showOpenDialog;
  });
}

const systemCalls = () => app.evaluate(() => (globalThis as unknown as { __calls: [string, string][] }).__calls);

/** Analisa uma pasta pelo fluxo real da interface (botão "Analisar pasta…"). */
async function scanFolder(folder: string) {
  await app.evaluate((_e, p) => void ((globalThis as unknown as { __pick: string }).__pick = p), folder);
  await page.getByRole('button', { name: 'Início' }).click();
  await page.getByRole('button', { name: 'Analisar pasta…' }).click();
}

const shot = async (name: string) => {
  if (!process.env.E2E_SCREENSHOTS) return;
  await page.waitForTimeout(700); // espera a transição de entrada da tela
  await page.screenshot({ path: path.join(process.env.E2E_SCREENSHOTS, `${name}.png`) });
};

const table = () => page.getByRole('table', { name: 'Detalhamento da pasta' });
const row = (name: string) => table().locator('tr.r', { has: page.getByText(name, { exact: true }) });
const menuItem = (name: string | RegExp) => page.getByRole('menu').getByRole('menuitem', { name });
const savedItem = (root: string) =>
  page.locator('.recent-item').filter({ has: page.locator('.p').getByText(root, { exact: true }) });

test.beforeAll(async () => {
  fixture = mkdtempSync(path.join(os.tmpdir(), 'tidyspace-e2e-'));
  other = mkdtempSync(path.join(os.tmpdir(), 'tidyspace-e2e-b-'));
  userData = mkdtempSync(path.join(os.tmpdir(), 'tidyspace-data-'));
  seedSettings(userData, { language: 'pt-BR' });
  write(fixture, 'videos/filme.mp4', 3_000_000);
  write(fixture, 'videos/trailer.mkv', 1_200_000);
  write(fixture, 'downloads/instalador.exe', 900_000);
  write(fixture, 'projeto/src/index.ts', 20_000);
  write(fixture, 'projeto/node_modules/lib/index.js', 400_000);
  write(fixture, 'notas.txt', 5_000);
  // Projeto parado há 200 dias (sugestão "node_modules inativos") e uma instalação do Node,
  // que nunca deve ser sugerida.
  write(fixture, 'antigo/package.json', 100);
  write(fixture, 'antigo/node_modules/lib/index.js', 300_000);
  write(fixture, 'antigo2/package.json', 100);
  write(fixture, 'antigo2/node_modules/lib/index.js', 200_000);
  write(fixture, 'nvm/v18/node_modules/npm/index.js', 250_000);
  const old = new Date(Date.now() - 200 * 86_400_000);
  for (const p of [
    'antigo/package.json',
    'antigo/node_modules/lib/index.js',
    'antigo2/package.json',
    'antigo2/node_modules/lib/index.js',
    'nvm/v18/node_modules/npm/index.js',
  ]) {
    utimesSync(path.join(fixture, p), old, old);
  }
  // Datas das pastas por último (criar arquivos atualiza a data da pasta). antigo2 é o mais antigo.
  const older = new Date(Date.now() - 300 * 86_400_000);
  for (const [p, when] of [
    ['antigo/node_modules/lib', old],
    ['antigo/node_modules', old],
    ['antigo2/node_modules/lib/index.js', older],
    ['antigo2/node_modules/lib', older],
    ['antigo2/node_modules', older],
  ] as const) {
    utimesSync(path.join(fixture, p), when, when);
  }
  // Pasta onde o usuário atual não pode apagar nada (simula pasta protegida do sistema).
  write(fixture, 'protegido/segredo.bin', 600_000);
  if (process.platform === 'win32') lockFolder(path.join(fixture, 'protegido'), true);
  write(other, 'backup.zip', 2_000_000);
  await launch();
});

/** Nega (ou restaura) o direito de apagar dentro da pasta para o usuário atual (Windows). */
function lockFolder(dir: string, lock: boolean) {
  const user = process.env.USERNAME ?? '';
  const args = lock ? [dir, '/deny', `${user}:(OI)(CI)(DE,DC)`] : [dir, '/remove:d', user];
  execFileSync('icacls', args, { stdio: 'ignore' });
}

test.afterAll(async () => {
  await app?.close();
  if (process.platform === 'win32') lockFolder(path.join(fixture, 'protegido'), false);
  for (const d of [fixture, other, userData]) rmSync(d, { recursive: true, force: true });
});

test('mostra a tela inicial com os volumes', async () => {
  await expect(page.getByRole('heading', { name: /Onde está o seu/ })).toBeVisible();
  await expect(page.locator('.drive').first()).toBeVisible();
  await expect(page.locator('.statusbar')).toContainText(/Motor (nativo|Node)/);
  await shot('01-home');
});

test('permite sair da tela de análise e voltar enquanto ela roda', async () => {
  await scanFolder(fixture);
  await expect(page.locator('.scan .target')).toHaveText(fixture);
  await page.getByRole('button', { name: 'Ajustes' }).first().click();
  // Atalho na barra lateral, banner no Início e barra de status levam de volta ao progresso.
  const scanNav = page.locator('.nav-btn.scanning');
  await expect(scanNav).toBeVisible();
  await page.getByRole('button', { name: 'Início' }).click();
  await expect(page.locator('.scan-banner')).toContainText('Análise em andamento');
  await shot('02-background-scan');
  await page.locator('.status-scan').click();
  await expect(page.locator('.scan .target')).toHaveText(fixture);
  // Ao terminar, a própria tela leva ao Explorar.
  await expect(page.locator('.crumbs')).toBeVisible({ timeout: 20_000 });
  await expect(scanNav).toHaveCount(0);
});

test('avisa quando a análise termina fora da tela de progresso', async () => {
  await scanFolder(fixture);
  await page.getByRole('button', { name: 'Ajustes' }).first().click();
  const toast = page.locator('.toast', { hasText: 'concluída' });
  await expect(toast).toBeVisible({ timeout: 20_000 });
  await toast.getByRole('button', { name: 'Abrir' }).click();
  await expect(page.locator('.crumbs')).toBeVisible();
});

test('Explorar: gráfico e tabela, navegação e sunburst', async () => {
  await expect(row('videos')).toBeVisible();
  await expect(table().locator('tbody tr').first()).toContainText('videos');
  await expect(page.locator('.tm-tile').first()).toBeVisible();
  await shot('03-explore-treemap');
  await page.getByRole('radio', { name: 'Sunburst' }).click();
  await expect(page.locator('.sb-arc').first()).toBeVisible();
  await page.getByRole('radio', { name: 'Treemap' }).click();
  await row('videos').getByText('videos', { exact: true }).click();
  await expect(page.locator('.crumbs button').last()).toHaveText('videos');
  await expect(row('filme.mp4')).toBeVisible();
  await page.keyboard.press('Backspace');
  await expect(page.locator('.crumbs button')).toHaveCount(1);
});

test.describe('menu de contexto', () => {
  test('arquivo: gerenciador de arquivos, abrir, copiar caminho e fila de limpeza', async () => {
    const file = path.join(fixture, 'videos', 'filme.mp4');
    await row('videos').getByText('videos', { exact: true }).click();
    await row('filme.mp4').click({ button: 'right' });
    await shot('04-context-menu');

    await menuItem('Mostrar no gerenciador de arquivos').click();
    await expect(page.locator('.toast', { hasText: 'mostrado no gerenciador' })).toBeVisible();
    await row('filme.mp4').click({ button: 'right' });
    await menuItem('Abrir').click();
    await expect.poll(systemCalls).toEqual([
      ['reveal', file],
      ['open', file],
    ]);

    await row('filme.mp4').click({ button: 'right' });
    await menuItem('Copiar caminho').click();
    await expect.poll(() => app.evaluate(({ clipboard }) => clipboard.readText())).toBe(file);

    await row('filme.mp4').click({ button: 'right' });
    await menuItem('Adicionar à limpeza').click();
    await expect(page.locator('.nav-btn .badge')).toHaveText('1');
    await row('filme.mp4').click({ button: 'right' });
    await menuItem('Remover da limpeza').click();
    await expect(page.locator('.nav-btn .badge')).toHaveCount(0);
  });

  test('arquivo: "Mostrar no Explorar" a partir de Maiores seleciona e destaca a linha', async () => {
    await page.getByRole('button', { name: 'Maiores' }).click();
    const largest = page.getByRole('table', { name: 'Maiores itens' });
    await largest.locator('tr.r', { hasText: 'instalador.exe' }).click({ button: 'right' });
    await menuItem('Mostrar no Explorar').click();
    await expect(page.locator('.crumbs button').last()).toHaveText('downloads');
    await expect(row('instalador.exe')).toHaveClass(/sel/);
    await expect(row('instalador.exe')).toHaveClass(/flash/);
  });

  test('pasta: explorar e analisar somente ela', async () => {
    await page.locator('.crumbs button').first().click();
    await row('projeto').click({ button: 'right' });
    await menuItem('Explorar esta pasta').click();
    await expect(page.locator('.crumbs button').last()).toHaveText('projeto');

    await page.locator('.crumbs button').first().click();
    await row('projeto').click({ button: 'right' });
    await menuItem('Analisar somente esta pasta').click();
    await expect(page.locator('.scan .target')).toHaveText(path.join(fixture, 'projeto'));
    await expect(page.locator('.crumbs button').first()).toHaveText(path.join(fixture, 'projeto'), { timeout: 20_000 });
  });
});

test('reabre análises salvas sem varrer de novo, inclusive após reiniciar o app', async () => {
  await scanFolder(other);
  await expect(page.locator('.crumbs button').first()).toHaveText(other, { timeout: 20_000 });

  await page.getByRole('button', { name: 'Início' }).click();
  const saved = page.locator('.recent-item');
  await expect(saved).toHaveCount(3);
  await shot('05-saved-scans');
  await savedItem(fixture).locator('button').first().click();
  await expect(page.locator('.crumbs button').first()).toHaveText(fixture);
  await expect(row('videos')).toBeVisible();

  // Reinicia: a última análise aberta volta sozinha, direto do banco local.
  await app.close();
  await launch();
  await expect(page.getByRole('button', { name: 'Explorar' })).toBeEnabled();
  await expect(page.locator('.statusbar')).toContainText(other);
});

test('move itens da fila para a Lixeira e atualiza a análise', async () => {
  await page.getByRole('button', { name: 'Início' }).click();
  await savedItem(fixture).locator('button').first().click();
  await page.getByRole('button', { name: 'Maiores' }).click();
  const largest = page.getByRole('table', { name: 'Maiores itens' });
  await largest.getByText('instalador.exe').click();
  await page.getByRole('button', { name: /Adicionar à limpeza/ }).click();
  await page.getByRole('button', { name: /^Limpeza/ }).click();
  await expect(page.getByText('instalador.exe')).toBeVisible();
  await shot('06-cleanup');
  await page.getByRole('button', { name: 'Mover para a Lixeira' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Mover para a Lixeira' }).click();
  await expect(page.getByRole('dialog')).toContainText('movidos para a Lixeira', { timeout: 20_000 });
  await page.getByRole('button', { name: 'Concluir' }).click();
  await expect(page.getByText('A fila está vazia')).toBeVisible();
  await page.getByRole('button', { name: 'Maiores' }).click();
  await expect(page.getByRole('table', { name: 'Maiores itens' }).getByText('instalador.exe')).toHaveCount(0);
});

test('troca a medida e o tema, e persiste as configurações', async () => {
  await page.getByRole('button', { name: 'Ajustes' }).first().click();
  await page.getByRole('radio', { name: 'Lógico' }).click();
  await expect(page.locator('.statusbar')).toContainText('(lógico)');
  await page.getByRole('radio', { name: 'Em disco' }).click();
  await expect(page.locator('.statusbar')).toContainText('em disco');
  await page.getByRole('radio', { name: /Glacier/ }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'glacier');
  await shot('07-settings');
  const saved = await page.evaluate(() =>
    (
      globalThis as unknown as { tidyspace: { settings: { get(): Promise<{ theme: string }> } } }
    ).tidyspace.settings.get(),
  );
  expect(saved.theme).toBe('glacier');
});

test('revisão de sugestão: lista completa, marcar/desmarcar, filtro, coluna redimensionável', async () => {
  await page.getByRole('button', { name: 'Início' }).click();
  await savedItem(fixture).locator('button').first().click();
  await page.getByRole('button', { name: /^Limpeza/ }).click();
  const card = page.locator('.sg', { hasText: 'node_modules inativos' });
  await expect(card).toBeVisible();
  await card.getByRole('button', { name: /Revisar/ }).click();
  const dialog = page.getByRole('dialog', { name: 'node_modules inativos' });
  const rows = dialog.locator('tbody tr.r');
  // A instalação do Node (nvm) não aparece; os dois projetos parados sim.
  await expect(rows).toHaveCount(2);
  await expect(dialog).not.toContainText('nvm');
  await expect(rows.first().locator('td').nth(1)).toHaveAttribute(
    'title',
    path.join(fixture, 'antigo', 'node_modules'),
  );
  await shot('08-review');

  // Ordenação: padrão por tamanho; data (mais recente primeiro, depois inverte); caminho A→Z.
  const firstPath = () => rows.first().locator('td').nth(1).getAttribute('title');
  const header = (name: RegExp) => dialog.getByRole('columnheader', { name });
  await expect(header(/Em disco/)).toHaveAttribute('aria-sort', 'descending');
  expect(await firstPath()).toBe(path.join(fixture, 'antigo', 'node_modules'));
  await header(/Modificado/).click();
  await expect(header(/Modificado/)).toHaveAttribute('aria-sort', 'descending');
  expect(await firstPath()).toBe(path.join(fixture, 'antigo', 'node_modules'));
  await header(/Modificado/).click();
  await expect(header(/Modificado/)).toHaveAttribute('aria-sort', 'ascending');
  expect(await firstPath()).toBe(path.join(fixture, 'antigo2', 'node_modules'));
  await header(/Item/).click();
  await expect(header(/Item/)).toHaveAttribute('aria-sort', 'ascending');
  expect(await firstPath()).toBe(path.join(fixture, 'antigo', 'node_modules'));

  await dialog.getByRole('button', { name: 'Desmarcar todos' }).click();
  await expect(dialog).toContainText('0 de 2 selecionados');
  await dialog.getByRole('checkbox', { name: 'Marcar todos' }).click();
  await expect(dialog).toContainText('2 de 2 selecionados');
  await dialog.getByRole('textbox', { name: 'Filtrar por caminho' }).fill('antigo2');
  await expect(rows).toHaveCount(1);
  await dialog.getByRole('button', { name: 'Desmarcar filtrados' }).click();
  await expect(dialog).toContainText('1 de 2 selecionados');

  // Arrastar a alça aumenta a coluna do caminho (depois que a animação de entrada termina,
  // senão a posição medida da alça ainda está mudando).
  type Animatable = { getAnimations(o: { subtree: boolean }): { finished: Promise<unknown> }[] };
  await dialog.evaluate(el =>
    Promise.all((el as unknown as Animatable).getAnimations({ subtree: true }).map(an => an.finished)),
  );
  const col = dialog.locator('col').nth(1);
  const before = await col.evaluate(c => parseFloat((c as unknown as { style: { width: string } }).style.width));
  const handle = dialog.getByRole('separator', { name: 'Redimensionar coluna' });
  const box = (await handle.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + 160, box.y + box.height / 2, { steps: 5 });
  await page.mouse.up();
  expect(
    await col.evaluate(c => parseFloat((c as unknown as { style: { width: string } }).style.width)),
  ).toBeGreaterThan(before + 100);

  await dialog.getByRole('button', { name: 'Adicionar selecionados' }).click();
  await expect(page.locator('.q-item')).toHaveCount(1);
  await page
    .locator('.q-item')
    .getByRole('button', { name: /Remover/ })
    .click();
});

test('pasta protegida: pula o item sem travar e explica o motivo', async () => {
  test.skip(process.platform !== 'win32', 'cenário de permissão montado com icacls (Windows)');
  await page.getByRole('button', { name: 'Maiores' }).click();
  await page.getByRole('table', { name: 'Maiores itens' }).getByText('segredo.bin').click();
  await page.getByRole('button', { name: /Adicionar à limpeza/ }).click();
  await page.getByRole('button', { name: /^Limpeza/ }).click();
  await page.getByRole('button', { name: 'Mover para a Lixeira' }).click();
  const started = Date.now();
  await page.getByRole('dialog').getByRole('button', { name: 'Mover para a Lixeira' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('requer permissão de administrador', { timeout: 15_000 });
  await expect(dialog).toContainText('Nenhum item foi removido');
  expect(Date.now() - started).toBeLessThan(10_000);
  await expect(dialog).toContainText('pastas protegidas pelo sistema');
  await shot('09-protected');
  expect(existsSync(path.join(fixture, 'protegido', 'segredo.bin'))).toBe(true);
  await dialog.getByRole('button', { name: 'Concluir' }).click();
});

test('limpeza demorada: mostra progresso, continua em segundo plano e avisa ao terminar', async () => {
  // Parte de uma fila vazia (itens que falharam em testes anteriores continuam na fila, como deveriam).
  await page.getByRole('button', { name: /^Limpeza/ }).click();
  for (let n = await page.locator('.q-item').count(); n > 0; n--) {
    await page
      .locator('.q-item')
      .first()
      .getByRole('button', { name: /Remover/ })
      .click();
  }
  await expect(page.locator('.q-item')).toHaveCount(0);
  await page.getByRole('button', { name: 'Maiores' }).click();
  const largest = page.getByRole('table', { name: 'Maiores itens' });
  await largest.getByText('trailer.mkv').click();
  await largest.getByText('notas.txt').click();
  await page.getByRole('button', { name: /Adicionar à limpeza/ }).click();
  await page.getByRole('button', { name: /^Limpeza/ }).click();
  await page.getByRole('button', { name: 'Mover para a Lixeira' }).click();
  await page
    .getByRole('dialog', { name: 'Confirmar limpeza' })
    .getByRole('button', { name: 'Mover para a Lixeira' })
    .click();

  const progress = page.getByRole('dialog', { name: 'Limpeza' });
  await expect(progress).toContainText('Item 1 de 2');
  await expect(progress.locator('.current-item')).toContainText('trailer.mkv');
  await expect(progress).toContainText('(estimativa)');
  await shot('10-cleanup-progress');

  // Segundo plano: a janela fecha, o app segue utilizável e a barra de status mostra o andamento.
  await progress.getByRole('button', { name: 'Continuar em segundo plano' }).click();
  await expect(progress).toHaveCount(0);
  await expect(page.locator('.statusbar')).toContainText('Limpando');
  await page.getByRole('button', { name: 'Explorar' }).click();
  await expect(page.locator('.crumbs')).toBeVisible();

  const done = page.locator('.toast', { hasText: 'Limpeza concluída' });
  await expect(done).toBeVisible({ timeout: 20_000 });
  await done.getByRole('button', { name: 'Ver resultado' }).click();
  await expect(page.getByRole('dialog', { name: 'Limpeza' })).toContainText('movidos para a Lixeira');
  await page.getByRole('button', { name: 'Concluir' }).click();
  await expect(page.locator('.statusbar')).not.toContainText('Limpando');
});

test('pnpm: remove node_modules com junctions, hard links e caminhos longos sem tocar no store', async () => {
  test.skip(process.platform !== 'win32', 'junctions e o limite de 260 caracteres são do Windows');
  const root = mkdtempSync(path.join(os.tmpdir(), 'tidyspace-pnpm-'));
  try {
    // Layout do pnpm: conteúdo no store; node_modules com hard links para ele e junctions entre pacotes.
    write(root, 'store/v10/files/ab/conteudo', 500_000);
    const storeFile = path.join(root, 'store', 'v10', 'files', 'ab', 'conteudo');
    write(root, 'app/package.json', 100);
    const nm = path.join(root, 'app', 'node_modules');
    const pkg = path.join(nm, '.pnpm', 'lib@1.0.0', 'node_modules', 'lib');
    mkdirSync(pkg, { recursive: true });
    linkSync(storeFile, path.join(pkg, 'index.js'));
    let deep = path.join(pkg, 'dist');
    while (deep.length < 280) deep = path.join(deep, 'pasta-com-nome-comprido');
    write(deep, 'index.js.map', 2_000);
    symlinkSync(pkg, path.join(nm, 'lib'), 'junction');
    symlinkSync(path.join(root, 'store'), path.join(nm, 'store-link'), 'junction');

    await scanFolder(root);
    await expect(page.locator('.crumbs button').first()).toHaveText(root, { timeout: 20_000 });
    await row('app').getByText('app', { exact: true }).click();
    await expect(row('node_modules').locator('.cloud-tag[title*="hard link"]')).toBeVisible();
    await row('node_modules').click({ button: 'right' });
    await menuItem('Adicionar à limpeza').click();
    await page.getByRole('button', { name: /^Limpeza/ }).click();
    await expect(page.locator('.queue-foot')).toContainText('pnpm store prune');
    await shot('11-pnpm-shared');
    await page.getByRole('button', { name: 'Mover para a Lixeira' }).click();
    await page
      .getByRole('dialog', { name: 'Confirmar limpeza' })
      .getByRole('button', { name: 'Mover para a Lixeira' })
      .click();
    const result = page.getByRole('dialog', { name: 'Limpeza' });
    await expect(result).toContainText('movidos para a Lixeira', { timeout: 30_000 });
    await result.getByRole('button', { name: 'Concluir' }).click();

    expect(existsSync(nm)).toBe(false);
    // O destino dos links continua intacto: só os nomes do node_modules e as junctions saíram.
    expect(readFileSync(storeFile)).toHaveLength(500_000);
    expect(existsSync(path.join(root, 'store', 'v10', 'files', 'ab'))).toBe(true);
    // Na Lixeira o hard link ainda existe (mesmo volume): o espaço só volta ao esvaziá-la.
    expect(statSync(storeFile).nlink).toBe(2);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
