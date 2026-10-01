/**
 * Ponto de entrada do processo engine (Electron `utilityProcess`). Isola o scanner nativo e o
 * índice em memória do processo principal: uma falha aqui não derruba a janela, e varreduras
 * pesadas não travam a interface.
 */
import path from 'node:path';
import { EngineService } from './EngineService';
import type { EngineEvent, EngineMessage, EngineRequest } from './protocol';
import { nativeChecker, nodeChecker } from './deletePreflight';
import { DelayedScanner } from './scanner/DelayedScanner';
import { DEMO_VOLUME, DemoScanner } from './scanner/DemoScanner';
import { loadNativeAddon } from './scanner/loadNative';
import { parseEngineChoice } from '@shared/engineChoice';
import { LOCALES, setLocale, type Locale } from '@shared/i18n';
import { selectEngine } from './scanner/selectEngine';
import { envFromProcess } from './suggestions/rules';
import { listVolumes, volumeStats } from './volumes';

const port = process.parentPort;
const post = (msg: EngineMessage) => port.postMessage(msg);

const dataDir = process.env.TIDYSPACE_DATA_DIR;
if (!dataDir) throw new Error('TIDYSPACE_DATA_DIR não definido');

// Idioma inicial (o main reenvia o idioma em `configure`): textos gerados antes disso, como o
// motivo de o motor nativo não estar em uso, já saem no idioma certo.
const startLocale = process.env.TIDYSPACE_LOCALE;
if (LOCALES.includes(startLocale as Locale)) setLocale(startLocale as Locale);

// O processo principal já validou `--engine=`; aqui só por garantia.
const engineChoice = parseEngineChoice(process.env.TIDYSPACE_ENGINE) ?? 'auto';
const searchDirs = (process.env.TIDYSPACE_NATIVE_DIRS ?? '').split(path.delimiter).filter(Boolean);
const selected = selectEngine(engineChoice, () => loadNativeAddon(searchDirs));
if (selected.nativeError) console.warn(`[engine] motor ${selected.scanner.kind}: ${selected.nativeError}`);

const baseScanner = selected.scanner;
// Só em testes E2E: atrasa a varredura para exercitar fluxos com análise em andamento.
const testDelay = Number(process.env.TIDYSPACE_TEST_SCAN_DELAY_MS ?? 0);
const testHold = process.env.TIDYSPACE_TEST_SCAN_HOLD;
const delayed = testDelay > 0 || testHold ? new DelayedScanner(baseScanner, testDelay, testHold) : baseScanner;
// Só para os prints do README: pasta fictícia com arquivos esparsos e volume fictício.
const demo = process.env.TIDYSPACE_DEMO === '1';
const scanner = demo ? new DemoScanner(delayed) : delayed;

const service = new EngineService({
  scanner,
  nativeError: selected.nativeError,
  engineChoice,
  dataDir,
  listVolumes: () => listVolumes(selected.addon),
  volumeStats: demo ? async () => DEMO_VOLUME : volumeStats,
  suggestionEnv: envFromProcess,
  indexOptions: {
    separator: process.platform === 'win32' ? '\\' : '/',
    caseInsensitive: process.platform === 'win32' || process.platform === 'darwin',
  },
  emit: (event: EngineEvent) => post(event),
  deleteChecker: selected.addon ? nativeChecker(selected.addon) : nodeChecker(),
});

port.on('message', async ({ data }: { data: EngineRequest }) => {
  try {
    const result = await service.dispatch(data.method, data.params);
    post({ kind: 'reply', id: data.id, ok: true, result });
  } catch (err) {
    post({ kind: 'reply', id: data.id, ok: false, error: err instanceof Error ? err.message : String(err) });
  }
});
