// Renders a `.vue` card to HTML in Node, no browser: its final state, used by the PNG page and the website export.

import {readFileSync, readdirSync} from 'node:fs';
import {basename, join} from 'node:path';
import vue from '@vitejs/plugin-vue';
import {type ViteDevServer, createServer, transformWithOxc} from 'vite';
import {type App, type Component, createSSRApp} from 'vue';
import {renderToString} from 'vue/server-renderer';
import {COMPONENTS_DIR, PACKAGE_DIR, PAGE_WIDTH, REPO_DIR, escapeHtml} from './card.ts';

const THEME_FILE = join(REPO_DIR, 'container/website/sites/rpc/theme.css');

const FONTS = [
  ['Card Inter', 'normal', '100 900', 'inter.woff2'],
  ['Card Mono', 'normal', '100 800', 'jetbrains-mono.woff2'],
  ['Card Mono', 'italic', '100 800', 'jetbrains-mono-italic.woff2'],
] as const;

/** `@font-face` rules for the card fonts; `src` says where each file is served from. */
export const fontFaces = (src: (file: string) => string) =>
  FONTS.map(
    ([family, style, weight, file]) =>
      `@font-face{font-family:'${family}';font-style:${style};font-weight:${weight};font-display:block;src:url(${src(file)}) format('woff2');}`
  ).join('\n');

/** Each `Npx` becomes `calc(N * var(--u))`, so the card scales with its container; 1200px wide = 1px per --u. */
export const scaleCss = (css: string) =>
  // comments pass through as written
  css.replace(/\/\*[\s\S]*?\*\/|(-?\d*\.?\d+)px\b/g, (match, size?: string) => (size === undefined ? match : `calc(${size} * var(--u))`));

export const cardCss = () => scaleCss(readFileSync(join(PACKAGE_DIR, 'card.css'), 'utf8'));

// The PNG page needs the player as plain JS; the website compiles the .ts copy itself.
const playerJs = async () => (await transformWithOxc(readFileSync(join(PACKAGE_DIR, 'player.ts'), 'utf8'), 'player.ts')).code;

let server: Promise<ViteDevServer> | undefined;

function vite(): Promise<ViteDevServer> {
  server ??= createServer({
    root: PACKAGE_DIR,
    configFile: false,
    logLevel: 'error',
    plugins: [vue()],
    server: {middlewareMode: true, hmr: false, watch: null},
    appType: 'custom',
  });
  return server;
}

export async function closeRenderer(): Promise<void> {
  const running = server;
  server = undefined;
  if (running) await (await running).close();
}

const componentFiles = () =>
  readdirSync(COMPONENTS_DIR)
    .filter((file) => file.endsWith('.vue'))
    .map((file) => join(COMPONENTS_DIR, file));

/** The card's HTML, its root `.code-card` element and nothing else. A bad prop or a Vue warning throws. */
export async function renderFragment(cardPath: string): Promise<string> {
  const dev = await vite();
  // cards and components are re-read on every render, so `card serve` shows an edit on refresh
  dev.moduleGraph.invalidateAll();
  const card = (await dev.ssrLoadModule(cardPath)).default as Component;
  const app = createSSRApp(card);
  for (const file of componentFiles()) app.component(basename(file, '.vue'), (await dev.ssrLoadModule(file)).default);
  const html = await renderStrict(app, basename(cardPath));
  if (!html.startsWith('<div class="code-card')) throw new Error(`${basename(cardPath)}: the card must be one <CardFrame>`);
  return html;
}

/** Renders the app, then fails on any Vue warning (a bad prop) or error: Vue itself only logs them. */
export async function renderStrict(app: App, name: string): Promise<string> {
  const problems: string[] = [];
  app.config.warnHandler = (message, _instance, trace) => void problems.push(`${message}${trace}`);
  app.config.errorHandler = (error) => void problems.push(error instanceof Error ? error.message : String(error));
  let html = '';
  try {
    html = await renderToString(app);
  } catch (error) {
    problems.push(error instanceof Error ? error.message : String(error));
  }
  if (problems.length) throw new Error(`${name}: ${problems.join('\n')}`);
  return html;
}

type PageOptions = {zoom?: number; preview?: boolean};

const fontData = (file: string) =>
  `data:font/woff2;base64,${readFileSync(join(PACKAGE_DIR, 'fonts', file)).toString('base64')}`;

const PREVIEW_CONTROLS =
  '<div class="cc-preview"><button data-do="play">Play</button><button data-do="pause">Pause</button>' +
  '<button data-do="reset">Replay</button><span class="cc-hint"></span></div><div class="cc-errors"></div>';
const PREVIEW_SCRIPT = `
      window.cardChecks.then((errors) => {
        document.querySelector('.cc-errors').textContent = errors.join('\\n');
      });
      document.querySelector('.cc-hint').textContent = arm(card) ? '' : 'reduced motion is on: no animation';
      document.fonts.ready.then(() => requestAnimationFrame(() => play(card)));
      document.querySelector('.cc-preview').addEventListener('click', (event) => {
        const action = event.target.dataset?.do;
        if (action === 'reset') { reset(card); requestAnimationFrame(() => play(card)); }
        else if (action === 'play') play(card);
        else if (action === 'pause') pause(card);
      });`;

/** The whole page `card shot` photographs and `card serve` shows: fonts inlined, rpc theme, one card. */
export async function renderPage(cardPath: string, {zoom = 1, preview = false}: PageOptions = {}): Promise<string> {
  const card = await renderFragment(cardPath);
  const slots: Record<string, string> = {
    pageTitle: escapeHtml(basename(cardPath, '.vue')),
    fontFaces: fontFaces(fontData),
    theme: readFileSync(THEME_FILE, 'utf8'),
    css: cardCss(),
    // The screenshot tool saves at CSS pixels, so a sharp 2x PNG means zooming the page itself.
    zoom: String(zoom),
    pageWidth: String(PAGE_WIDTH),
    controls: preview ? PREVIEW_CONTROLS : '',
    card,
    player: await playerJs(),
    previewScript: preview ? PREVIEW_SCRIPT : '',
  };
  // A function replacer, so a `$` in the card is never read as a replacement pattern.
  return readFileSync(join(PACKAGE_DIR, 'shell.html'), 'utf8').replace(/\{\{(\w+)\}\}/g, (_, slot: string) => slots[slot] ?? '');
}
