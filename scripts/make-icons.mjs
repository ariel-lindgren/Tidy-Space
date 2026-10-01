/**
 * Gera os ícones do app a partir da marca da barra de título (`.brand-mark` em app.css, tema Neon):
 * quadrado arredondado com gradiente cônico e o recorte escuro. Cada tamanho é renderizado pelo
 * próprio Electron (nada de redimensionar bitmap), então os ícones pequenos ficam nítidos.
 *
 * Uso: `npm run icons` → build/icon.png (1024), build/icon.ico, build/icon.icns,
 * build/icons/<N>x<N>.png (Linux) e resources/icon.png (ícone da janela em tempo de execução).
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { app, BrowserWindow } from 'electron';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const COLORS = { bg: '#05070c', accent: '#2de2ff', accent2: '#b16cff' };

/** Proporções da marca de 22px: cantos 7px, recorte com 5px de margem e cantos 3px. */
function mark(size) {
  const margin = Math.max(1, Math.round(size * 0.08));
  const s = size - margin * 2;
  return `<div style="width:${size}px;height:${size}px;padding:${margin}px;box-sizing:border-box">
    <div style="position:relative;width:${s}px;height:${s}px;border-radius:${Math.round(s * 0.32)}px;
      background:conic-gradient(from 200deg, ${COLORS.accent}, ${COLORS.accent2}, ${COLORS.accent})">
      <div style="position:absolute;inset:${Math.round(s * 0.227)}px;border-radius:${Math.round(s * 0.136)}px;background:${COLORS.bg};
        clip-path:polygon(0 0, 55% 0, 55% 45%, 100% 45%, 100% 100%, 0 100%)"></div>
    </div></div>`;
}

/**
 * Duas renderizações, porque a janela offscreen não passa da altura da tela: o 1024 sozinho; depois
 * o 512 à esquerda e os demais empilhados ao lado dele (16 + 24 + … + 256 = 568px de altura).
 */
const PASSES = [
  [{ size: 1024, x: 0, y: 0 }],
  [
    { size: 512, x: 0, y: 0 },
    ...[256, 128, 64, 48, 32, 24, 16].map((size, i, all) => ({
      size,
      x: 512,
      y: all.slice(0, i).reduce((a, s) => a + s, 0),
    })),
  ],
];

const page = items => `<!doctype html><html><body style="margin:0;background:transparent">
  ${items.map(({ size, x, y }) => `<div style="position:absolute;left:${x}px;top:${y}px">${mark(size)}</div>`).join('')}
</body></html>`;

/** Renderiza uma página offscreen (o quadro chega pelo evento `paint`, com transparência). */
async function render(html, width, height) {
  const win = new BrowserWindow({
    width,
    height,
    show: false,
    transparent: true,
    frame: false,
    webPreferences: { offscreen: true },
  });
  let frame = null;
  win.webContents.on('paint', (_event, _dirty, image) => (frame = image));
  win.webContents.setFrameRate(5);
  await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
  await new Promise(r => setTimeout(r, 800));
  win.destroy();
  if (!frame) throw new Error('nenhum quadro renderizado');
  const size = frame.getSize();
  if (size.width < width || size.height < height)
    throw new Error(`quadro ${size.width}x${size.height} menor que ${width}x${height}`);
  return frame;
}

/** ICO com as imagens em PNG (aceito desde o Windows Vista). */
function ico(images) {
  const header = Buffer.alloc(6 + images.length * 16);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  let offset = header.length;
  images.forEach(({ size, png }, i) => {
    const e = 6 + i * 16;
    header.writeUInt8(size >= 256 ? 0 : size, e);
    header.writeUInt8(size >= 256 ? 0 : size, e + 1);
    header.writeUInt16LE(1, e + 4);
    header.writeUInt16LE(32, e + 6);
    header.writeUInt32LE(png.length, e + 8);
    header.writeUInt32LE(offset, e + 12);
    offset += png.length;
  });
  return Buffer.concat([header, ...images.map(i => i.png)]);
}

/** ICNS com entradas PNG (tipos modernos, inclusive as variantes @2x). */
function icns(bySize) {
  const types = [
    ['icp4', 16],
    ['icp5', 32],
    ['icp6', 64],
    ['ic07', 128],
    ['ic08', 256],
    ['ic09', 512],
    ['ic10', 1024],
    ['ic11', 32],
    ['ic12', 64],
    ['ic13', 256],
    ['ic14', 512],
  ];
  const chunks = types.map(([type, size]) => {
    const png = bySize.get(size);
    const head = Buffer.alloc(8);
    head.write(type, 0, 'ascii');
    head.writeUInt32BE(png.length + 8, 4);
    return Buffer.concat([head, png]);
  });
  const head = Buffer.alloc(8);
  head.write('icns', 0, 'ascii');
  head.writeUInt32BE(8 + chunks.reduce((a, c) => a + c.length, 0), 4);
  return Buffer.concat([head, ...chunks]);
}

app.disableHardwareAcceleration();
// Entre uma renderização e outra não há janelas abertas: não encerrar o app por isso.
app.on('window-all-closed', () => {});
app.whenReady().then(async () => {
  try {
    const bySize = new Map();
    for (const items of PASSES) {
      const width = Math.max(...items.map(i => i.x + i.size));
      const height = Math.max(...items.map(i => i.y + i.size));
      const frame = await render(page(items), width, height);
      for (const { size, x, y } of items) bySize.set(size, frame.crop({ x, y, width: size, height: size }).toPNG());
    }

    const build = path.join(root, 'build');
    mkdirSync(path.join(build, 'icons'), { recursive: true });
    mkdirSync(path.join(root, 'resources'), { recursive: true });
    writeFileSync(path.join(build, 'icon.png'), bySize.get(1024));
    writeFileSync(
      path.join(build, 'icon.ico'),
      ico([16, 24, 32, 48, 64, 128, 256].map(size => ({ size, png: bySize.get(size) }))),
    );
    writeFileSync(path.join(build, 'icon.icns'), icns(bySize));
    for (const size of [16, 32, 48, 64, 128, 256, 512]) {
      writeFileSync(path.join(build, 'icons', `${size}x${size}.png`), bySize.get(size));
    }
    writeFileSync(path.join(root, 'resources', 'icon.png'), bySize.get(256));
    process.stdout.write('ícones gerados em build/ e resources/icon.png\n');
  } catch (err) {
    console.error(err);
    process.exitCode = 1;
  }
  app.quit();
});
