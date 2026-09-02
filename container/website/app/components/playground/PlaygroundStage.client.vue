<script setup lang="ts">
// PlaygroundStage - the interactive playground UI (client-only: it lazy-loads
// Monaco + the resolver WASM, both browser-only). A Vue port of the former
// <runtypes-playground> web component. Three columns:
//   1. Source     - the TypeScript type (or builder) editor, its
//                   read-only import header + call footer, and the "Transformed
//                   Src" view of what the build plugin injects.
//   2. Generated  - the code RunTypes generates for the selected function + type.
//   3. Function   - a build-function picker, a JS-expression input pane with
//                   Random valid / Random invalid, a Run button, and the result.
// Above: real-world presets + a TS-type / Builder mode switch.
//
// The engine (../../playground) is framework-agnostic; this component owns the
// Monaco wiring, the debounced codegen, and the highlighted output. Colors follow
// the site's design tokens (light + dark); Monaco's own theme tracks the color mode.

import {
  run,
  mock,
  mockInvalid,
  versions,
  generatedCache,
  transformedSource,
  factoryImport,
  factoryCall,
  operationByKey,
  setRuntypesPackageSources,
  OPERATIONS,
  ROOT_TYPE,
  type RunResult,
  type Diagnostic,
  type Mode,
  type Operation,
  type ResolverOptions,
} from '../../playground/index.ts';
import {PRESETS, type Preset} from '../../playground/presets.ts';
// Monaco's language services (TypeScript completions, hovers, signature help) run
// inside web workers. Vite's `?worker` suffix bundles each entry as its own worker
// chunk and hands back a constructor - the canonical way to wire Monaco under Vite.
// Static imports are safe here: this is a `.client.vue` component (never SSR'd) and
// the worker code lands in separate chunks, so the main Monaco module still
// lazy-loads. The previous empty-blob stub kept the editor rendering but left the
// TS worker mute, so autocomplete never appeared; these give it a real worker.
import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';
import TsWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker';

type Monaco = typeof import('monaco-editor');
type Editor = import('monaco-editor').editor.IStandaloneCodeEditor;
type EditorOptions = import('monaco-editor').editor.IStandaloneEditorConstructionOptions;
type TextModel = import('monaco-editor').editor.ITextModel;
type PrettierApi = {format: (src: string, opts: Record<string, unknown>) => Promise<string>; plugins: unknown[]};

const props = withDefaults(
  defineProps<{type?: string; operation?: string; input?: string; height?: string}>(),
  {height: '520px'},
);

// Debounce before regenerating the code column: long while typing in the type
// editor, short for a discrete change (function picker / preset / mode).
const TYPE_DEBOUNCE_MS = 2000;
const PICK_DEBOUNCE_MS = 150;

// The per-title guidance shown in each numbered badge's tooltip.
const STEP_TIPS = {
  source: 'Edit MyType and watch the change flow through to the transformed source and the generated functions.',
  transformed:
    'The transformed code: the generated functions are imported and referenced by a stable type id (one id per type). RunTypes makes the smallest change it can to your original source.',
  cache:
    'The real, ready-to-run code RunTypes generates for your type. This is what actually executes for the function you picked, specialized to your exact shape (no schema walking or reflection at runtime).',
  function: 'Pick one of the functions RunTypes generates from your type, then run it against the input below.',
} as const;

const config = useRuntimeConfig();
const colorMode = useColorMode();
const monacoTheme = computed(() => (colorMode.value === 'dark' ? 'vs-dark' : 'vs'));
// Match the type-stack background to Monaco's editor surface so the strips read as
// one file in both themes (vs-dark editor bg vs the vs light bg).
const editorBg = computed(() => (colorMode.value === 'dark' ? '#1e1e1e' : '#fffffe'));

// ---- reactive UI state ------------------------------------------------------

const mode = ref<Mode>('type');
const presetIndex = ref(0);
const operationKey = ref<string>(props.operation ?? OPERATIONS[0]?.key ?? '');
const ready = ref(false);
const overlayError = ref('');
const codegenBusy = ref(false);
const codeHint = ref('');
const timing = ref('');
const outputHtml = ref('<div class="rtpg-placeholder">Run to see the result</div>');
const transformviewHtml = ref('<div class="rtpg-placeholder">resolving…</div>');
const codeviewHtml = ref('<div class="rtpg-placeholder">resolving…</div>');
const genRandomBusy = ref(false);
const genInvalidBusy = ref(false);
// Which generator the sample input last came from, so a type edit refreshes it
// with the same intent: a deliberately invalid value stays invalid against the
// new type instead of silently turning valid.
const lastMockKind = ref<'valid' | 'invalid'>('valid');

// Every engine call uses the STATIC call form (`createX<MyType>()`), in BOTH
// authoring modes: a builder preset closes with `type MyType = InferType<typeof
// <schema>>`, so it ends at the same handle the TS-type mode does. That is the
// shape to write in an app, since the schema const stays unused and the build
// then emits no runtype cache for it. `mode` selects only which preset text the
// editor loads. (The engine still renders the value-first form
// `createX(<schema>)` for anyone driving it headlessly; the UI does not ask.)
const CALL_FORM: Mode = 'type';

const currentOp = computed<Operation>(() => operationByKey(operationKey.value));
const needsInput = computed(() => currentOp.value.needsInput);
const runLabel = computed(() => (currentOp.value.kind === 'graph' ? 'Unpack RunTypes' : 'Run'));
const typeHintHtml = computed(() =>
  mode.value === 'builder'
    ? `define <code>${ROOT_TYPE}</code> from RT/TF builders`
    : `define <code>${ROOT_TYPE}</code>`,
);

// The operation picker, grouped by family (Validation / JSON encode / ...) so the
// strategy variants read as a small menu rather than a flat list.
const operationGroups = computed(() => {
  const groups: {label: string; ops: readonly Operation[]}[] = [];
  for (const op of OPERATIONS) {
    let group = groups[groups.length - 1];
    if (!group || group.label !== op.group) {
      group = {label: op.group, ops: []};
      groups.push(group);
    }
    (group.ops as Operation[]).push(op);
  }
  return groups;
});

// ---- non-reactive engine/editor handles -------------------------------------

let monaco: Monaco | null = null;
let prettier: PrettierApi | null = null;
let typeEditor: Editor | null = null;
let inputEditor: Editor | null = null;
// The read-only `import { … }` header and `const … = createX<MyType>()` footer
// editors that sandwich the editable type body, so the snippet reads as a real file.
let headerEditor: Editor | null = null;
let footerEditor: Editor | null = null;
// Explicit file:/// models for the three TypeScript editors. Monaco resolves the
// real `@mionjs/run-types` overlay (staged under a virtual node_modules) only for a
// `file://` model (an auto `inmemory://` model can't walk up to node_modules)so
// each editor gets a per-instance file URI. Disposed on unmount (editor.dispose()
// leaves externally-created models alive).
let headerModel: TextModel | null = null;
let bodyModel: TextModel | null = null;
let footerModel: TextModel | null = null;
let codeTimer: ReturnType<typeof setTimeout> | null = null;
let codeSeq = 0;
let mockTimer: ReturnType<typeof setTimeout> | null = null;
let mockSeq = 0;
// True while a programmatic setValue rewrites the type editor (preset load, mode
// switch). Those paths bring their own matching input, so only USER edits of the
// type resync the sample value.
let writingTypeSource = false;
// Set when a type edit lands while the current function reads no input
// (getRunType): nothing to regenerate now, but the value is stale for the next
// function that does read it.
let inputStale = false;

const headerEditorEl = ref<HTMLElement>();
const editorEl = ref<HTMLElement>();
const footerEditorEl = ref<HTMLElement>();
const inputEditorEl = ref<HTMLElement>();

// ---- pure helpers (ported verbatim from the web component) -------------------

function escapeHtml(text: unknown): string {
  return String(text).replace(/[&<>]/g, (c) => ({'&': '&amp;', '<': '&lt;', '>': '&gt;'})[c] as string);
}

function stringify(value: unknown): string {
  return JSON.stringify(value, (_k, v) => (typeof v === 'bigint' ? `${v}n` : v instanceof Uint8Array ? Array.from(v) : v), 2);
}

function jsKey(key: string): string {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(key) ? key : JSON.stringify(key);
}

// jsValue serializes a value to a JS-source EXPRESSION (not JSON), so the input
// pane round-trips the full value space createMockDataFn produces - Map / Set / Date
// / RegExp / bigint / typed arrays - which JSON can't represent.
function jsValue(value: unknown, pad = ''): string {
  const inner = `${pad}  `;
  if (value === null) return 'null';
  switch (typeof value) {
    case 'undefined':
      return 'undefined';
    case 'string':
      return JSON.stringify(value);
    case 'number':
    case 'boolean':
      return String(value);
    case 'bigint':
      return `${value}n`;
    case 'function':
    case 'symbol':
      return 'undefined';
  }
  if (value instanceof Date) return `new Date(${JSON.stringify(value.toISOString())})`;
  if (value instanceof RegExp) return value.toString();
  if (ArrayBuffer.isView(value) && !(value instanceof DataView)) {
    return `new ${value.constructor.name}([${Array.from(value as unknown as ArrayLike<number>).join(', ')}])`;
  }
  if (value instanceof Map) {
    if (value.size === 0) return 'new Map()';
    const entries = Array.from(value, ([k, v]) => `${inner}[${jsValue(k, inner)}, ${jsValue(v, inner)}]`).join(',\n');
    return `new Map([\n${entries},\n${pad}])`;
  }
  if (value instanceof Set) {
    if (value.size === 0) return 'new Set()';
    const items = Array.from(value, (v) => `${inner}${jsValue(v, inner)}`).join(',\n');
    return `new Set([\n${items},\n${pad}])`;
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return '[]';
    return `[\n${value.map((v) => `${inner}${jsValue(v, inner)}`).join(',\n')},\n${pad}]`;
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj);
  if (keys.length === 0) return '{}';
  return `{\n${keys.map((k) => `${inner}${jsKey(k)}: ${jsValue(obj[k], inner)}`).join(',\n')},\n${pad}}`;
}

// parseJsInput evaluates the input pane as a JS expression, so Map / Set / Date /
// RegExp / bigint / typed-array literals are accepted (not only JSON).
//
// SECURITY - this uses `new Function`. It is safe ONLY because the evaluated code
// is the USER'S OWN, typed locally and run on an explicit Run click: self-XSS is
// not a vulnerability. The playground reads NO input from any untrusted source -
// the `input` / `type` / `operation` props come only from hard-coded docs content,
// never a URL / query / hash / postMessage. HARD INVARIANT: never source them from
// an attacker-controllable channel - that is the one change that turns this into a
// real XSS vector.
function parseJsInput(code: string): unknown {
  const trimmed = code.trim();
  if (!trimmed) return undefined;
  return new Function(`return (${trimmed});`)();
}

function formatJsonMaybe(value: unknown): string {
  if (typeof value !== 'string') return stringify(value);
  try {
    return JSON.stringify(JSON.parse(value), null, 2);
  } catch {
    return value;
  }
}

function renderDiagnostics(diagnostics: Diagnostic[]): string {
  if (!diagnostics || diagnostics.length === 0) return '';
  const items = diagnostics
    .map((d) => {
      const severity = String(d.severity ?? d.Severity ?? '').toLowerCase();
      const code = d.code ?? d.Code ?? '';
      const message = d.message ?? d.Message ?? '';
      return `<div class="rtpg-diag-item ${severity}">${escapeHtml(`${severity.toUpperCase()} ${code}: ${message}`)}</div>`;
    })
    .join('');
  return `<div class="rtpg-diag"><div class="rtpg-block-label">Diagnostics</div>${items}</div>`;
}

// ---- resolver wiring --------------------------------------------------------

function playgroundBase(): string {
  const base = config.app.baseURL || '/';
  return base.endsWith('/') ? base : `${base}/`;
}

function resolverOptions(): ResolverOptions {
  const base = playgroundBase();
  return {
    wasmUrl: `${base}playground-app/ts-runtypes.wasm.gz`,
    wasmExecUrl: `${base}playground-app/wasm_exec.js`,
    sidecarHookUrl: `${base}playground-app/sidecar-hook.js`,
  };
}

function ensureMonacoWorkers(): void {
  const scope = globalThis as unknown as {MonacoEnvironment?: unknown};
  if (scope.MonacoEnvironment) return;
  scope.MonacoEnvironment = {
    // Hand Monaco the language-service worker matching the requested label: the
    // TypeScript worker (also serves 'javascript') powers completions / hovers /
    // signature help; the base editor worker handles everything else. Anything
    // but a real worker here silently disables IntelliSense.
    getWorker(_workerId: string, label: string): Worker {
      if (label === 'typescript' || label === 'javascript') return new TsWorker();
      return new EditorWorker();
    },
  };
}

// loadRuntypesSources fetches the host-staged mion source overlay, injects it
// into the engine (the resolver type-checks user snippets against it), and RETURNS it
// so onMounted can feed the SAME real sources to Monaco's language service. Must run
// before the first scan.
async function loadRuntypesSources(): Promise<Record<string, string>> {
  const response = await fetch(`${playgroundBase()}playground-app/runtypes-sources.json`, {cache: 'no-cache'});
  if (!response.ok) {
    throw new Error(
      `Could not load the resolver source overlay (${response.status}). It is staged by ` +
        `container/website/scripts/build-playground.sh (needs the Go toolchain + bootstrapped submodule).`,
    );
  }
  const overlay = (await response.json()) as Record<string, string>;
  setRuntypesPackageSources(overlay);
  return overlay;
}

// registerRuntypesLibs feeds the real overlay to Monaco's TS language service ONCE
// (global state, shared by every editor + playground instance): each virtual file is
// added at its file:/// path so a snippet's `@mionjs/run-types[/…]` import resolves
// against the ACTUAL published types (the same sources the resolver uses)rather
// than a hand-maintained stub. Idempotent across instances via a global flag.
function registerRuntypesLibs(mon: Monaco, overlay: Record<string, string>): void {
  const flag = globalThis as unknown as {__rtCoreLibsRegistered?: boolean};
  if (flag.__rtCoreLibsRegistered) return;
  for (const [path, content] of Object.entries(overlay)) {
    mon.languages.typescript.typescriptDefaults.addExtraLib(content, `file:///${path}`);
  }
  flag.__rtCoreLibsRegistered = true;
}

// ---- Monaco helpers ---------------------------------------------------------

// colorize reuses Monaco's tokenizer/theme to syntax-highlight a snippet to HTML.
async function highlight(code: string, lang: string): Promise<string> {
  if (!monaco) return escapeHtml(code);
  try {
    return await monaco.editor.colorize(code, lang, {tabSize: 2});
  } catch {
    return escapeHtml(code);
  }
}

async function loadPrettier(): Promise<PrettierApi> {
  if (!prettier) {
    const [standalone, babel, estree] = await Promise.all([
      import('prettier/standalone'),
      import('prettier/plugins/babel'),
      import('prettier/plugins/estree'),
    ]);
    const plugin = (m: unknown): unknown => (m as {default?: unknown}).default ?? m;
    prettier = {format: standalone.format, plugins: [plugin(babel), plugin(estree)]};
  }
  return prettier;
}

async function beautifyModule(code: string): Promise<string> {
  try {
    const p = await loadPrettier();
    return (await p.format(code, {parser: 'babel', plugins: p.plugins, printWidth: 84, tabWidth: 2})).trimEnd();
  } catch {
    return code;
  }
}

// makeStripEditor creates a read-only one-liner editor (the import header / the call
// footer). It shares the body editor's gutter config so the line numbers align,
// sizes itself to its content, and is overlaid with a hatch + click-swallowing layer.
function makeStripEditor(el: HTMLElement, model: TextModel, base: EditorOptions): Editor {
  const editor = monaco!.editor.create(el, {
    ...base,
    model,
    readOnly: true,
    domReadOnly: true,
    renderLineHighlight: 'none',
    contextmenu: false,
    scrollbar: {vertical: 'hidden', horizontalScrollbarSize: 6, alwaysConsumeMouseWheel: false},
  });
  const fit = (): void => {
    const height = editor.getContentHeight();
    el.style.height = `${height}px`;
    editor.layout({width: el.clientWidth, height});
  };
  editor.onDidContentSizeChange(fit);
  fit();
  return editor;
}

// updateLineNumberOffsets keeps the three stacked editors numbered as one file: the
// header owns lines 1..H, the body continues from H+1, the footer is the line after.
function updateLineNumberOffsets(): void {
  const headerLines = headerEditor?.getModel()?.getLineCount() ?? 1;
  const bodyLines = typeEditor?.getModel()?.getLineCount() ?? 1;
  typeEditor?.updateOptions({lineNumbers: (n: number) => String(n + headerLines)});
  footerEditor?.updateOptions({lineNumbers: (n: number) => String(n + headerLines + bodyLines)});
}

// updateSurrounding refreshes the read-only header (import) and footer (call) for
// the selected function. The body between them is the user's type.
function updateSurrounding(): void {
  const op = currentOp.value;
  headerEditor?.setValue(factoryImport(op.factory));
  footerEditor?.setValue(factoryCall(op.factory, op.varName, CALL_FORM, undefined, op.options));
  updateLineNumberOffsets();
}

function typeSource(): string {
  return typeEditor?.getValue() ?? '';
}

// Programmatic writes to the type editor. Monaco fires onDidChangeModelContent
// synchronously from setValue, so the flag is enough to tell "the app replaced
// the snippet" (preset / mode switch, which carry their own input) apart from
// "the user is editing" (which must resync the input).
function setTypeSource(value: string): void {
  writingTypeSource = true;
  try {
    typeEditor?.setValue(value);
  } finally {
    writingTypeSource = false;
  }
}

// ---- presets + mode ---------------------------------------------------------

function currentPreset(): Preset {
  return PRESETS[presetIndex.value] ?? PRESETS[0];
}

function presetSource(preset: Preset, form: Mode): string {
  if (form === 'builder') return preset.builder;
  return preset.ts;
}

function loadPreset(index: number): void {
  presetIndex.value = index;
  const preset = currentPreset();
  setTypeSource(presetSource(preset, mode.value));
  inputEditor?.setValue(preset.input);
  // The preset ships a valid value for its own type, so that is the intent a
  // later type edit should reproduce.
  lastMockKind.value = 'valid';
  inputStale = false;
  updateLineNumberOffsets();
  scheduleCodegen(PICK_DEBOUNCE_MS);
  resetResult();
}

function setMode(next: Mode): void {
  if (next === mode.value) return;
  mode.value = next;
  // Re-show the current preset in the new form so switching always yields a valid
  // snippet (custom edits in the other form are replaced).
  const preset = currentPreset();
  setTypeSource(presetSource(preset, next));
  // Both forms model the same type, so the input on screen still fits, and both
  // are called the same way — the footer only needs the selected function's name.
  updateSurrounding();
  scheduleCodegen(PICK_DEBOUNCE_MS);
  resetResult();
}

function resetResult(): void {
  outputHtml.value = '<div class="rtpg-placeholder">Run to see the result</div>';
  timing.value = '';
}

// operationKey drives the picker (v-model); react to a change the way the element's
// change listener did.
watch(operationKey, () => {
  updateSurrounding();
  resetResult();
  scheduleCodegen(PICK_DEBOUNCE_MS);
  // Picking up a type edit that landed while the input pane was hidden.
  if (inputStale) scheduleInputResync(PICK_DEBOUNCE_MS);
});

// Track the color mode so Monaco's own theme flips with the site.
watch(monacoTheme, (theme) => monaco?.editor.setTheme(theme));

// ---- generate + run ---------------------------------------------------------

async function generateInto(generator: () => Promise<{value: unknown}>, busy: Ref<boolean>): Promise<void> {
  if (!ready.value) return;
  busy.value = true;
  try {
    const {value} = await generator();
    inputEditor?.setValue(jsValue(value));
    resetResult();
  } catch (err) {
    outputHtml.value = `<pre class="rtpg-code error">${escapeHtml((err as Error).message ?? String(err))}</pre>`;
  } finally {
    busy.value = false;
  }
}

function generateMock(): Promise<void> {
  lastMockKind.value = 'valid';
  inputStale = false;
  return generateInto(() => mock(typeSource(), resolverOptions(), CALL_FORM), genRandomBusy);
}

function generateInvalid(): Promise<void> {
  lastMockKind.value = 'invalid';
  inputStale = false;
  return generateInto(() => mockInvalid(typeSource(), resolverOptions(), CALL_FORM), genInvalidBusy);
}

// scheduleInputResync refreshes the sample value after a type edit settles, so a
// value left over from the PREVIOUS type can never be run against the new one,
// the "I changed MyType, hit Run, and validate says false" trap. Deferred when
// the selected function reads no input; the flag makes the next one that does
// pick the refresh up.
function scheduleInputResync(delay: number): void {
  if (!needsInput.value) {
    inputStale = true;
    return;
  }
  inputStale = false;
  if (mockTimer) clearTimeout(mockTimer);
  mockTimer = setTimeout(() => void resyncInput(), delay);
}

// Silent by design: mid-edit the snippet often does not resolve yet, and that is
// not a failure worth showing: the current value simply stays until the type
// compiles again, and the next keystroke reschedules.
async function resyncInput(): Promise<void> {
  if (!ready.value) return;
  const seq = ++mockSeq;
  const userCode = typeSource();
  const generate = lastMockKind.value === 'invalid' ? mockInvalid : mock;
  try {
    const {value} = await generate(userCode, resolverOptions(), CALL_FORM);
    if (seq !== mockSeq) return; // a newer edit owns the input now
    inputEditor?.setValue(jsValue(value));
    resetResult();
  } catch {
    /* type does not resolve yet: keep what is on screen */
  }
}

async function doRun(): Promise<void> {
  if (!ready.value) return;
  const op = currentOp.value;
  const userCode = typeSource();
  let input: unknown;
  if (op.needsInput) {
    try {
      input = parseJsInput(inputEditor?.getValue() ?? '');
    } catch (err) {
      outputHtml.value = `<pre class="rtpg-code error">${escapeHtml(`Invalid input:\n${(err as Error).message}`)}</pre>`;
      return;
    }
  }
  outputHtml.value = '<div class="rtpg-placeholder">running…</div>';
  const started = performance.now();
  try {
    const result = await run(op.key, userCode, input, resolverOptions(), CALL_FORM);
    timing.value = `${(performance.now() - started).toFixed(0)} ms`;
    outputHtml.value = await renderResult(result);
  } catch (err) {
    timing.value = '';
    outputHtml.value = `<pre class="rtpg-code error">${escapeHtml((err as Error).message ?? String(err))}</pre>`;
  }
}

// renderResult shows the run result. For the decode functions the intermediate
// Encoded value is shown at the TOP, above the Decoded value, so the round trip
// reads top-down.
async function renderResult(result: RunResult): Promise<string> {
  const diag = renderDiagnostics(result.diagnostics);
  const block = async (value: unknown): Promise<string> =>
    `<div class="rtpg-code">${await highlight(jsValue(value), 'javascript')}</div>`;
  const jsonBlock = async (value: unknown): Promise<string> =>
    `<pre class="rtpg-code">${await highlight(formatJsonMaybe(value), 'json')}</pre>`;
  const label = (text: string): string => `<div class="rtpg-block-label">${text}</div>`;
  switch (result.kind) {
    case 'predicate':
      return `<div class="rtpg-badge ${result.value ? 'ok' : 'bad'}">${result.value ? 'true ✓' : 'false ✗'}</div>${diag}`;
    case 'errors': {
      const ok = result.value.length === 0;
      const badge = `<div class="rtpg-badge ${ok ? 'ok' : 'bad'}">${ok ? 'valid, no errors' : `${result.value.length} error(s)`}</div>`;
      return `${badge}${ok ? '' : await block(result.value)}${diag}`;
    }
    case 'encode':
      return `${label('Encoded (JSON-safe)')}${await jsonBlock(result.value)}${diag}`;
    case 'jsonRoundtrip':
      return `${label('Encoded (input → encode)')}${await jsonBlock(result.encoded)}${label('Decoded')}${await block(result.decoded)}${diag}`;
    case 'binaryEncode':
      return `${label(`Binary (${result.byteLength} bytes)`)}<pre class="rtpg-code rtpg-hex">${escapeHtml(result.hex)}</pre>${diag}`;
    case 'binaryRoundtrip':
      return `${label(`Encoded (${result.byteLength} bytes)`)}<pre class="rtpg-code rtpg-hex">${escapeHtml(result.hex)}</pre>${label('Decoded')}${await block(result.decoded)}${diag}`;
    case 'graph':
      // The live graph, descending from the root: children are the actual child
      // nodes, so the output reads as the type's structure. Only a cycle shows
      // up as a reference (`circular: true`): nothing else to look up by id.
      return `<div class="rtpg-badge ok">RunType resolved (${result.runTypes.length} node(s))</div>${label('Resolved RunType')}<pre class="rtpg-code">${await highlight(stringify(result.tree), 'json')}</pre>${diag}`;
  }
}

// ---- codegen (the two code columns) -----------------------------------------

// scheduleCodegen marks the two code columns busy immediately, then regenerates
// after `delay` ms. The PREVIOUS output stays on screen (dimmed, with a small header
// spinner) until the new output is ready, so an edit reads as an in-place refresh.
function scheduleCodegen(delay: number): void {
  if (codeTimer) clearTimeout(codeTimer);
  codegenBusy.value = true;
  codeTimer = setTimeout(() => void updateSelectedCode(), delay);
}

async function updateSelectedCode(): Promise<void> {
  if (!ready.value) return;
  const seq = ++codeSeq;
  const op = currentOp.value;
  const userCode = typeSource();
  const opts = resolverOptions();
  codegenBusy.value = true;
  try {
    const cacheModules = await generatedCache(op.factory, userCode, opts, CALL_FORM, op.options);
    const html = cacheModules.length
      ? (
          await Promise.all(
            cacheModules.map(
              async (m) =>
                `<div class="rtpg-cache-file"><div class="rtpg-cache-file-head">${escapeHtml(m.name)}</div><pre class="rtpg-code">${await highlight(await beautifyModule(m.code), 'javascript')}</pre></div>`,
            ),
          )
        ).join('')
      : '<div class="rtpg-card-note">no cache generated for this type</div>';
    const transformed = await transformedSource(op.factory, op.varName, userCode, opts, CALL_FORM, op.options);
    const transformedHtml = `<pre class="rtpg-code">${await highlight(transformed, 'typescript')}</pre>`;
    // Drop the result if a newer regeneration started while we awaited - it owns the
    // busy state and will clear it when it finishes.
    if (seq !== codeSeq) return;
    codeHint.value = cacheModules.length ? `${cacheModules.length} module${cacheModules.length === 1 ? '' : 's'}` : '';
    codeviewHtml.value = html;
    transformviewHtml.value = transformedHtml;
    codegenBusy.value = false;
  } catch (err) {
    if (seq !== codeSeq) return;
    const message = `<pre class="rtpg-code error">${escapeHtml((err as Error).message ?? String(err))}</pre>`;
    codeviewHtml.value = message;
    transformviewHtml.value = message;
    codegenBusy.value = false;
  }
}

// ---- boot / teardown --------------------------------------------------------

onMounted(async () => {
  ensureMonacoWorkers();
  try {
    const [loadedMonaco, overlay] = await Promise.all([import('monaco-editor'), loadRuntypesSources()]);
    monaco = loadedMonaco;

    monaco.languages.typescript.typescriptDefaults.setCompilerOptions({
      target: monaco.languages.typescript.ScriptTarget.ESNext,
      module: monaco.languages.typescript.ModuleKind.ESNext,
      // Bundler resolution (TS enum value 100; Monaco's enum stops at NodeJs) matches
      // the overlay package.json exports that point straight at the `.ts` sources.
      moduleResolution: 100 as unknown as import('monaco-editor').languages.typescript.ModuleResolutionKind,
      allowImportingTsExtensions: true,
      allowNonTsExtensions: true,
      strict: true,
      noEmit: true,
      skipLibCheck: true,
    });
    // Feed Monaco the SAME real @mionjs/run-types sources the resolver uses, so any
    // import types exactly as the published package (no hand-maintained stub drift).
    registerRuntypesLibs(monaco, overlay);
    // The input pane is a JS value EXPRESSION, evaluated at Run, not type-checked -
    // turn off JS diagnostics so it never shows squiggles.
    monaco.languages.typescript.javascriptDefaults.setDiagnosticsOptions({
      noSemanticValidation: true,
      noSyntaxValidation: true,
    });

    const common = {
      theme: monacoTheme.value,
      minimap: {enabled: false},
      automaticLayout: true,
      fontSize: 13,
      scrollBeyondLastLine: false,
    } as const;
    const stackEditor = {
      ...common,
      folding: false,
      glyphMargin: false,
      lineNumbersMinChars: 3,
      lineDecorationsWidth: 6,
      overviewRulerLanes: 0,
      tabSize: 2,
    } as const;

    // Per-instance file:/// models so imports resolve against the virtual node_modules
    // overlay (an auto inmemory:// model can't reach it).
    const uid = globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2);
    const tsModel = (name: string, value: string): TextModel =>
      monaco!.editor.createModel(value, 'typescript', monaco!.Uri.parse(`file:///pg-${uid}/${name}`));
    headerModel = tsModel('_header.ts', factoryImport(OPERATIONS[0].factory));
    bodyModel = tsModel('MyType.ts', props.type ?? PRESETS[0].ts);
    footerModel = tsModel('_footer.ts', factoryCall(OPERATIONS[0].factory, OPERATIONS[0].varName, 'type'));

    headerEditor = makeStripEditor(headerEditorEl.value!, headerModel, stackEditor);
    typeEditor = monaco.editor.create(editorEl.value!, {
      ...stackEditor,
      model: bodyModel,
      lineNumbers: (n: number) => String(n + 1),
    });
    footerEditor = makeStripEditor(footerEditorEl.value!, footerModel, stackEditor);
    inputEditor = monaco.editor.create(inputEditorEl.value!, {
      ...common,
      value: props.input ?? PRESETS[0].input,
      language: 'javascript',
      lineNumbers: 'off',
    });

    const runKey = monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter;
    typeEditor.addCommand(runKey, () => void doRun());
    inputEditor.addCommand(runKey, () => void doRun());
    typeEditor.onDidChangeModelContent(() => {
      updateLineNumberOffsets();
      scheduleCodegen(TYPE_DEBOUNCE_MS);
      if (!writingTypeSource) scheduleInputResync(TYPE_DEBOUNCE_MS);
    });
    updateLineNumberOffsets();
    updateSurrounding();

    // Pre-warm the TS language service against the real overlay so the first
    // hover/completion isn't blocked on a cold program build, runs in the
    // background, overlapping the WASM load below (best-effort).
    void (async () => {
      try {
        const getWorker = await monaco!.languages.typescript.getTypeScriptWorker();
        const client = await getWorker(bodyModel!.uri);
        await client.getSemanticDiagnostics(bodyModel!.uri.toString());
      } catch {
        /* pre-warm is best-effort; the worker warms lazily on first use anyway */
      }
    })();

    // versions() resolves once Monaco + the resolver WASM are loaded.
    await versions(resolverOptions());
    ready.value = true;
    void updateSelectedCode();
  } catch (err) {
    overlayError.value = (err as Error).message ?? String(err);
  }
});

onBeforeUnmount(() => {
  if (codeTimer) clearTimeout(codeTimer);
  if (mockTimer) clearTimeout(mockTimer);
  headerEditor?.dispose();
  footerEditor?.dispose();
  typeEditor?.dispose();
  inputEditor?.dispose();
  headerEditor = footerEditor = typeEditor = inputEditor = null;
  // Editors don't own externally-created models: dispose the file:/// models here.
  headerModel?.dispose();
  bodyModel?.dispose();
  footerModel?.dispose();
  headerModel = bodyModel = footerModel = null;
});
</script>

<template>
  <div class="rt-playground" :style="{'--rt-pg-min-height': height, '--rtpg-editor-bg': editorBg}">
    <div class="rtpg-toolbar">
      <div class="rtpg-typegroup">
        <div class="rtpg-modeswitch" role="group" aria-label="type form">
          <button
            type="button"
            class="rtpg-mode"
            :class="{'is-active': mode === 'type'}"
            title="TypeScript type"
            @click="setMode('type')"
          >
            <svg viewBox="0 0 32 32" aria-hidden="true">
              <path
                fill="#007acc"
                d="M23.827 8.243a4.4 4.4 0 0 1 2.223 1.281a6 6 0 0 1 .852 1.143c.011.045-1.534 1.083-2.471 1.662c-.034.023-.169-.124-.322-.35a2.01 2.01 0 0 0-1.67-1c-1.077-.074-1.771.49-1.766 1.433a1.3 1.3 0 0 0 .153.666c.237.49.677.784 2.059 1.383c2.544 1.095 3.636 1.817 4.31 2.843a5.16 5.16 0 0 1 .416 4.333a4.76 4.76 0 0 1-3.932 2.815a11 11 0 0 1-2.708-.028a6.53 6.53 0 0 1-3.616-1.884a6.3 6.3 0 0 1-.926-1.371a3 3 0 0 1 .327-.208c.158-.09.756-.434 1.32-.761l1.024-.6l.214.312a4.8 4.8 0 0 0 1.35 1.292a3.3 3.3 0 0 0 3.458-.175a1.545 1.545 0 0 0 .2-1.974c-.276-.395-.84-.727-2.443-1.422a8.8 8.8 0 0 1-3.349-2.055a4.7 4.7 0 0 1-.976-1.777a7.1 7.1 0 0 1-.062-2.268a4.33 4.33 0 0 1 3.644-3.374a9 9 0 0 1 2.691.084m-8.343 1.483l.011 1.454h-4.63v13.148H7.6V11.183H2.97V9.755a14 14 0 0 1 .04-1.466c.017-.023 2.832-.034 6.245-.028l6.211.017Z"
              />
            </svg>
            <span>TS type</span>
          </button>
          <button
            type="button"
            class="rtpg-mode"
            :class="{'is-active': mode === 'builder'}"
            title="mion builder (run-type)"
            @click="setMode('builder')"
          >
            <svg viewBox="0 0 32 32" aria-hidden="true">
              <path
                fill="#f5de19"
                d="M18.774 19.7a3.73 3.73 0 0 0 3.376 2.078c1.418 0 2.324-.709 2.324-1.688c0-1.173-.931-1.589-2.491-2.272l-.856-.367c-2.469-1.052-4.11-2.37-4.11-5.156c0-2.567 1.956-4.52 5.012-4.52A5.06 5.06 0 0 1 26.9 10.52l-2.665 1.711a2.33 2.33 0 0 0-2.2-1.467a1.49 1.49 0 0 0-1.638 1.467c0 1.027.636 1.442 2.1 2.078l.856.366c2.908 1.247 4.549 2.518 4.549 5.376c0 3.081-2.42 4.769-5.671 4.769a6.58 6.58 0 0 1-6.236-3.5ZM6.686 20c.538.954 1.027 1.76 2.2 1.76c1.124 0 1.834-.44 1.834-2.15V7.975h3.422v11.683c0 3.543-2.078 5.156-5.11 5.156A5.31 5.31 0 0 1 3.9 21.688Z"
              />
            </svg>
            <span>Type Builder</span>
          </button>
        </div>
        <span class="rtpg-typegroup-sep" />
        <div class="rtpg-presets">
          <button
            v-for="(preset, i) in PRESETS"
            :key="preset.name"
            type="button"
            class="rtpg-preset"
            :class="{'is-active': i === presetIndex}"
            @click="loadPreset(i)"
          >
            {{ preset.name }}
          </button>
        </div>
      </div>
    </div>

    <div class="rtpg-layout">
      <section class="rtpg-pane rtpg-typepane">
        <div class="rtpg-head">
          <span class="rtpg-head-title">
            <h2>Source</h2>
            <button type="button" class="rtpg-step" :aria-label="`Step 1: ${STEP_TIPS.source}`">
              1<span class="rtpg-tip" role="tooltip">{{ STEP_TIPS.source }}</span>
            </button>
          </span>
          <span class="rtpg-hint" v-html="typeHintHtml" />
        </div>
        <div class="rtpg-typestack">
          <div class="rtpg-ro-wrap rtpg-ro-header">
            <div ref="headerEditorEl" class="rtpg-ro-editor" />
            <div class="rtpg-ro-hatch" aria-hidden="true" />
          </div>
          <div ref="editorEl" class="rtpg-editor" />
          <div class="rtpg-ro-wrap rtpg-ro-footer">
            <div ref="footerEditorEl" class="rtpg-ro-editor" />
            <div class="rtpg-ro-hatch" aria-hidden="true" />
          </div>
        </div>
        <div class="rtpg-subhead">
          <span class="rtpg-head-title">
            <h3>Transformed Src</h3>
            <button type="button" class="rtpg-step" :aria-label="`Step 2: ${STEP_TIPS.transformed}`">
              2<span class="rtpg-tip" role="tooltip">{{ STEP_TIPS.transformed }}</span>
            </button>
          </span>
          <span class="rtpg-head-status">
            <span v-show="codegenBusy" class="rtpg-busy-spinner" />
            <span class="rtpg-hint">the import + argument RunTypes injects</span>
          </span>
        </div>
        <div class="rtpg-transformview" :class="{'is-busy': codegenBusy}" v-html="transformviewHtml" />
      </section>

      <section class="rtpg-pane">
        <div class="rtpg-head">
          <span class="rtpg-head-title">
            <h2>Generated Cache</h2>
            <button type="button" class="rtpg-step" :aria-label="`Step 3: ${STEP_TIPS.cache}`">
              3<span class="rtpg-tip" role="tooltip">{{ STEP_TIPS.cache }}</span>
            </button>
          </span>
          <span class="rtpg-head-status">
            <span v-show="codegenBusy" class="rtpg-busy-spinner" />
            <span class="rtpg-hint">{{ codeHint }}</span>
          </span>
        </div>
        <div class="rtpg-codeview" :class="{'is-busy': codegenBusy}" v-html="codeviewHtml" />
      </section>

      <section class="rtpg-pane">
        <div class="rtpg-head">
          <span class="rtpg-head-title">
            <h2>Pick a Function</h2>
            <button type="button" class="rtpg-step" :aria-label="`Step 4: ${STEP_TIPS.function}`">
              4<span class="rtpg-tip rtpg-tip-left" role="tooltip">{{ STEP_TIPS.function }}</span>
            </button>
          </span>
          <select v-model="operationKey" class="rtpg-select" aria-label="Build function">
            <optgroup v-for="group in operationGroups" :key="group.label" :label="group.label">
              <option v-for="op in group.ops" :key="op.key" :value="op.key">{{ op.menuLabel }}</option>
            </optgroup>
          </select>
        </div>
        <div class="rtpg-controls">
          <div class="rtpg-info">
            <span class="rtpg-info-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path
                  fill="currentColor"
                  d="M12 2a10 10 0 1 0 0 20a10 10 0 0 0 0-20m0 5.25a1.25 1.25 0 1 1 0 2.5a1.25 1.25 0 0 1 0-2.5M13.25 17h-2.5v-6h2.5z"
                />
              </svg>
            </span>
            <div class="rtpg-info-text">
              <div class="rtpg-info-title">{{ currentOp.blurb }}</div>
              <div class="rtpg-info-detail">{{ currentOp.detail }}</div>
            </div>
          </div>
          <div v-show="needsInput" class="rtpg-field rtpg-input-field">
            <div class="rtpg-field-label-row">
              <span class="rtpg-field-label">Input (JS)</span>
              <span class="rtpg-btn-row">
                <button
                  type="button"
                  class="rtpg-ghost-btn"
                  :disabled="genRandomBusy"
                  title="Generate a valid random value with createMockDataFn"
                  @click="generateMock"
                >
                  {{ genRandomBusy ? 'generating…' : 'Random valid' }}
                </button>
                <button
                  type="button"
                  class="rtpg-ghost-btn rtpg-ghost-invalid"
                  :disabled="genInvalidBusy"
                  title="Generate a random value that fails validation"
                  @click="generateInvalid"
                >
                  {{ genInvalidBusy ? 'generating…' : 'Random invalid' }}
                </button>
              </span>
            </div>
            <div ref="inputEditorEl" class="rtpg-input-editor" />
            <div class="rtpg-mock-badge">
              Sample data generated by RunTypes <code>createMockDataFn&lt;{{ ROOT_TYPE }}&gt;()</code>
            </div>
          </div>
          <button type="button" class="rtpg-run-btn" :disabled="!ready" @click="doRun">{{ runLabel }}</button>
          <div class="rtpg-result-label">Result <span class="rtpg-hint">{{ timing }}</span></div>
          <div class="rtpg-result" v-html="outputHtml" />
        </div>
      </section>
    </div>

    <div v-show="!ready || overlayError" class="rtpg-overlay">
      <div v-if="overlayError" class="rtpg-overlay-box">
        <div class="rtpg-overlay-title">Could not load the playground</div>
        <div class="rtpg-overlay-sub rtpg-overlay-err">{{ overlayError }}</div>
      </div>
      <div v-else class="rtpg-overlay-box">
        <span class="rtpg-spinner rtpg-spinner-lg" />
        <div class="rtpg-overlay-title">Loading the playground</div>
        <div class="rtpg-overlay-sub">Fetching the editor and the resolver (a few MB). Everything runs in your browser.</div>
      </div>
    </div>
  </div>
</template>

<!--
  Non-scoped on purpose: the highlighted code / result / cache blocks are injected
  via v-html (Monaco's colorize returns HTML), and Vue's scoped-style data-attr is
  NOT applied to v-html content - so scoped rules would not reach them. Every
  selector is nested under `.rt-playground`, which keeps the styles contained (the
  same guarantee the old web component got by prefixing every rule). Colors are
  remapped onto the site's --ui-* design tokens so the playground follows light/dark.
-->
<style>
.rt-playground {
  --rtpg-bg: var(--ui-bg, #0e1116);
  --rtpg-panel: var(--ui-bg-muted, #161b22);
  --rtpg-panel-2: var(--ui-bg-elevated, #1c2230);
  --rtpg-border: var(--ui-border, #2b3340);
  --rtpg-text: var(--ui-text-highlighted, #d7dde6);
  --rtpg-muted: var(--ui-text-muted, #8b96a5);
  --rtpg-accent: var(--site-accent);
  --rtpg-accent-dim: color-mix(in srgb, var(--site-accent) 75%, black);
  --rtpg-ok: var(--site-accent);
  --rtpg-err: #e3534f;
  --rtpg-warn: #d9a441;
  --rtpg-on-accent: #0e1116;
  --rtpg-editor-bg: #1e1e1e;
  --rtpg-mono: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  --rtpg-sans: system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
  display: block;
  position: relative;
  background: var(--rtpg-bg);
  color: var(--rtpg-text);
  font-family: var(--rtpg-sans);
  font-size: 14px;
  border: 1px solid var(--rtpg-border);
  border-radius: 10px;
  overflow: hidden;
  min-height: var(--rt-pg-min-height, 460px);
}
.rt-playground * {
  box-sizing: border-box;
}
.rt-playground .rtpg-layout {
  display: grid;
  grid-template-columns: 1.1fr 1fr 0.9fr;
  gap: 1px;
  background: var(--rtpg-border);
  min-height: 460px;
}
@media (max-width: 1000px) {
  .rt-playground .rtpg-layout {
    grid-template-columns: 1fr;
  }
}
.rt-playground .rtpg-pane {
  background: var(--rtpg-bg);
  display: flex;
  flex-direction: column;
  min-height: 0;
  min-width: 0;
}
.rt-playground .rtpg-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 9px 13px;
  /* Sized for the tallest head content (the function picker), so all three
     pane heads stay on the same baseline whether or not they carry a control. */
  min-height: 46px;
  border-bottom: 1px solid var(--rtpg-border);
  background: var(--rtpg-panel);
}
.rt-playground .rtpg-head h2 {
  margin: 0;
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.6px;
  color: var(--rtpg-muted);
  /* Never wrap: the function-picker head shares its row with the select, and a
     two-line title there would break the three panes' shared baseline. */
  white-space: nowrap;
}
.rt-playground .rtpg-head-title {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  /* Hold full width: the title is short, and it shares the function pane's head
     with the picker, which shrinks instead (a shrinking title would be overrun
     by the select rather than clipped, since the h2 does not wrap). */
  flex: 0 0 auto;
}
.rt-playground .rtpg-hint {
  color: var(--rtpg-muted);
  font-size: 12px;
}
.rt-playground .rtpg-step {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  width: 16px;
  height: 16px;
  padding: 0;
  border: 1px solid var(--rtpg-accent-dim);
  border-radius: 50%;
  background: rgba(121, 175, 67, 0.14);
  color: var(--rtpg-accent);
  font-family: var(--rtpg-sans);
  font-size: 10px;
  font-weight: 700;
  line-height: 1;
  cursor: help;
}
.rt-playground .rtpg-step:hover,
.rt-playground .rtpg-step:focus-visible {
  background: var(--rtpg-accent);
  color: var(--rtpg-on-accent);
  outline: none;
}
.rt-playground .rtpg-tip {
  position: absolute;
  top: calc(100% + 7px);
  left: 0;
  z-index: 60;
  width: max-content;
  max-width: 240px;
  padding: 8px 10px;
  border: 1px solid var(--rtpg-border);
  border-radius: 8px;
  background: var(--rtpg-panel-2);
  color: var(--rtpg-text);
  font-family: var(--rtpg-sans);
  font-size: 11.5px;
  font-weight: 400;
  line-height: 1.45;
  letter-spacing: 0;
  text-transform: none;
  text-align: left;
  white-space: normal;
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.4);
  opacity: 0;
  visibility: hidden;
  transform: translateY(-2px);
  transition: opacity 0.12s, transform 0.12s;
  pointer-events: none;
}
.rt-playground .rtpg-tip-left {
  left: auto;
  right: 0;
}
@media (max-width: 1000px) {
  .rt-playground .rtpg-tip-left {
    left: 0;
    right: auto;
  }
}
.rt-playground .rtpg-step:hover .rtpg-tip,
.rt-playground .rtpg-step:focus .rtpg-tip,
.rt-playground .rtpg-step:focus-visible .rtpg-tip {
  opacity: 1;
  visibility: visible;
  transform: translateY(0);
}
.rt-playground .rtpg-hint code,
.rt-playground .rtpg-head code {
  font-family: var(--rtpg-mono);
  color: var(--rtpg-accent);
}
.rt-playground .rtpg-editor {
  flex: 1;
  min-height: 280px;
}
.rt-playground .rtpg-typepane {
  min-width: 0;
}
.rt-playground .rtpg-typestack {
  flex: 3 1 0;
  min-height: 210px;
  display: flex;
  flex-direction: column;
  background: var(--rtpg-editor-bg);
  overflow: hidden;
}
.rt-playground .rtpg-typestack .rtpg-editor {
  flex: 1 1 auto;
  min-height: 120px;
}
.rt-playground .rtpg-ro-wrap {
  position: relative;
  flex: 0 0 auto;
  overflow: hidden;
}
.rt-playground .rtpg-ro-editor {
  width: 100%;
}
.rt-playground .rtpg-ro-header {
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}
.rt-playground .rtpg-ro-footer {
  border-top: 1px solid rgba(255, 255, 255, 0.06);
}
.rt-playground .rtpg-ro-hatch {
  position: absolute;
  inset: 0;
  cursor: default;
  pointer-events: auto;
  background: repeating-linear-gradient(135deg, transparent 0 5px, rgba(121, 175, 67, 0.16) 5px 6px);
}
.rt-playground .rtpg-subhead {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 7px 13px;
  border-top: 1px solid var(--rtpg-border);
  border-bottom: 1px solid var(--rtpg-border);
  background: var(--rtpg-panel);
}
.rt-playground .rtpg-subhead h3 {
  margin: 0;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.6px;
  color: var(--rtpg-muted);
}
.rt-playground .rtpg-transformview {
  flex: 2 1 0;
  min-height: 120px;
  display: flex;
  flex-direction: column;
}
.rt-playground .rtpg-transformview > .rtpg-code {
  flex: 1;
  margin: 0;
  border: 0;
  border-radius: 0;
}
.rt-playground .rtpg-transformview > .rtpg-placeholder {
  padding: 13px;
}
.rt-playground .rtpg-transformview.is-busy,
.rt-playground .rtpg-codeview.is-busy {
  opacity: 0.5;
  transition: opacity 0.15s ease;
}
.rt-playground .rtpg-controls {
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 9px;
  overflow: auto;
  flex: 1;
  min-height: 0;
}
.rt-playground .rtpg-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.rt-playground .rtpg-field-label {
  font-size: 12px;
  color: var(--rtpg-muted);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}
.rt-playground .rtpg-field-label-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
/* The build-function picker, which sits in the "Pick a Function" pane head. A
   muted primary border marks it as the pane's one control without competing
   with the Run button; hover / focus take it to the full accent. */
.rt-playground .rtpg-select {
  appearance: none;
  flex: 0 1 auto;
  min-width: 0;
  max-width: 100%;
  /* The longest option ("json dec remove unknown keys (default)") would set the
     width; clip instead so a narrow pane shrinks the control rather than the
     title. The section prefix leads the label, so it survives the ellipsis. */
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  background: var(--rtpg-panel-2);
  color: var(--rtpg-text);
  border: 1px solid var(--rtpg-accent-dim);
  border-radius: 8px;
  padding: 4px 10px;
  font-family: var(--rtpg-mono);
  font-size: 12px;
  /* Pinned so the control stays inside the head's min-height and this pane's
     head matches the other two exactly. */
  line-height: 1.2;
  cursor: pointer;
}
.rt-playground .rtpg-select:hover,
.rt-playground .rtpg-select:focus {
  outline: none;
  border-color: var(--rtpg-accent);
}
.rt-playground .rtpg-info {
  display: flex;
  gap: 9px;
  margin: 0;
  padding: 10px 11px;
  border: 1px solid var(--rtpg-accent-dim);
  border-left-width: 3px;
  border-radius: 8px;
  background: rgba(121, 175, 67, 0.08);
}
.rt-playground .rtpg-info-icon {
  flex: 0 0 auto;
  margin-top: 1px;
  color: var(--rtpg-accent);
  font-size: 15px;
  line-height: 1;
}
.rt-playground .rtpg-info-icon svg {
  display: block;
  width: 1em;
  height: 1em;
}
.rt-playground .rtpg-info-text {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}
.rt-playground .rtpg-info-title {
  color: var(--rtpg-text);
  font-size: 12.5px;
  font-weight: 600;
  line-height: 1.35;
}
.rt-playground .rtpg-info-detail {
  color: var(--rtpg-muted);
  font-size: 12px;
  line-height: 1.5;
}
.rt-playground .rtpg-input-editor {
  height: 150px;
  border: 1px solid var(--rtpg-border);
  border-radius: 8px;
  overflow: hidden;
}
.rt-playground .rtpg-btn-row {
  display: flex;
  gap: 6px;
}
.rt-playground .rtpg-ghost-btn {
  background: transparent;
  border: 1px solid var(--rtpg-border);
  color: var(--rtpg-muted);
  border-radius: 6px;
  padding: 2px 8px;
  font-size: 11px;
  cursor: pointer;
  white-space: nowrap;
}
.rt-playground .rtpg-ghost-btn:hover {
  color: var(--rtpg-accent);
  border-color: var(--rtpg-accent-dim);
}
.rt-playground .rtpg-ghost-invalid:hover {
  color: var(--rtpg-err);
  border-color: var(--rtpg-err);
}
.rt-playground .rtpg-ghost-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.rt-playground .rtpg-run-btn {
  background: var(--rtpg-accent);
  color: var(--rtpg-on-accent);
  border: none;
  border-radius: 8px;
  padding: 11px 14px;
  font-weight: 700;
  font-size: 14px;
  cursor: pointer;
}
.rt-playground .rtpg-run-btn:hover {
  background: var(--rtpg-accent-dim);
}
.rt-playground .rtpg-run-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.rt-playground .rtpg-codeview {
  flex: 1;
  min-height: 0;
  overflow: auto;
}
.rt-playground .rtpg-cache-file-head {
  position: sticky;
  top: 0;
  z-index: 1;
  font-family: var(--rtpg-mono);
  font-size: 11.5px;
  color: var(--rtpg-accent);
  background: var(--rtpg-panel);
  padding: 6px 12px;
  border-top: 1px solid var(--rtpg-border);
  border-bottom: 1px solid var(--rtpg-border);
}
.rt-playground .rtpg-cache-file:first-child .rtpg-cache-file-head {
  border-top: 0;
}
.rt-playground .rtpg-cache-file > .rtpg-code {
  margin: 0;
  border: 0;
  border-radius: 0;
  overflow: visible;
}
.rt-playground .rtpg-codeview > .rtpg-code {
  margin: 0;
  border: 0;
  border-radius: 0;
}
.rt-playground .rtpg-codeview > .rtpg-card-note,
.rt-playground .rtpg-codeview > .rtpg-placeholder {
  padding: 13px;
}
.rt-playground .rtpg-result-label {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  font-size: 11px;
  color: var(--rtpg-muted);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}
.rt-playground .rtpg-result {
  flex: 1;
  min-height: 80px;
  overflow: auto;
}
.rt-playground .rtpg-result > .rtpg-block-label:first-child {
  margin-top: 0;
}
.rt-playground .rtpg-hex {
  word-break: break-all;
}
.rt-playground .rtpg-badge {
  display: inline-block;
  font-family: var(--rtpg-mono);
  font-weight: 700;
  padding: 6px 12px;
  border-radius: 8px;
  margin-bottom: 12px;
}
.rt-playground .rtpg-badge.ok {
  background: rgba(121, 175, 67, 0.15);
  color: var(--rtpg-ok);
  border: 1px solid var(--rtpg-accent-dim);
}
.rt-playground .rtpg-badge.bad {
  background: rgba(227, 83, 79, 0.15);
  color: var(--rtpg-err);
  border: 1px solid var(--rtpg-err);
}
.rt-playground .rtpg-block-label {
  font-size: 12px;
  color: var(--rtpg-muted);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin: 14px 0 6px;
}
.rt-playground .rtpg-code {
  margin: 0;
  font-family: var(--rtpg-mono);
  font-size: 12.5px;
  line-height: 1.5;
  background: var(--rtpg-panel);
  border: 1px solid var(--rtpg-border);
  border-radius: 8px;
  padding: 12px;
  overflow: auto;
  white-space: pre;
}
.rt-playground pre.rtpg-code {
  white-space: pre-wrap;
  word-break: break-word;
}
.rt-playground .rtpg-code.error {
  color: var(--rtpg-err);
  border-color: var(--rtpg-err);
  white-space: pre-wrap;
}
.rt-playground .rtpg-diag {
  margin-top: 14px;
}
.rt-playground .rtpg-diag-item {
  font-family: var(--rtpg-mono);
  font-size: 12px;
  padding: 6px 10px;
  border-radius: 6px;
  margin-bottom: 6px;
  border: 1px solid var(--rtpg-border);
  background: var(--rtpg-panel);
}
.rt-playground .rtpg-diag-item.error {
  color: var(--rtpg-err);
  border-color: var(--rtpg-err);
}
.rt-playground .rtpg-diag-item.warning {
  color: var(--rtpg-warn);
  border-color: var(--rtpg-warn);
}
.rt-playground .rtpg-placeholder {
  color: var(--rtpg-muted);
  font-size: 13px;
}
.rt-playground .rtpg-toolbar {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 12px;
  flex-wrap: wrap;
  padding: 0;
  border-bottom: 1px solid var(--rtpg-border);
  background: var(--rtpg-panel);
}
.rt-playground .rtpg-typegroup {
  display: flex;
  flex: 1;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  padding: 5px 7px;
  border-radius: 10px;
  background: var(--rtpg-bg);
}
.rt-playground .rtpg-typegroup-sep {
  width: 1px;
  align-self: stretch;
  background: var(--rtpg-border);
  margin: 1px 2px;
}
.rt-playground .rtpg-presets {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}
.rt-playground .rtpg-preset {
  background: var(--rtpg-panel-2);
  color: var(--rtpg-text);
  border: 1px solid var(--rtpg-border);
  border-radius: 999px;
  padding: 5px 12px;
  font-size: 12.5px;
  cursor: pointer;
}
.rt-playground .rtpg-preset:hover {
  border-color: var(--rtpg-accent-dim);
  color: var(--rtpg-accent);
}
.rt-playground .rtpg-preset.is-active {
  background: var(--rtpg-accent);
  color: var(--rtpg-on-accent);
  border-color: var(--rtpg-accent);
  font-weight: 600;
}
.rt-playground .rtpg-modeswitch {
  display: inline-flex;
  gap: 2px;
  padding: 2px;
  border: 1px solid var(--rtpg-border);
  border-radius: 8px;
  background: var(--rtpg-panel-2);
}
.rt-playground .rtpg-mode {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: transparent;
  color: var(--rtpg-muted);
  border: 0;
  border-radius: 6px;
  padding: 5px 11px;
  font-size: 12.5px;
  cursor: pointer;
  transition: background 0.12s, color 0.12s;
}
.rt-playground .rtpg-mode svg {
  width: 15px;
  height: 15px;
  display: block;
  opacity: 0.5;
  transition: opacity 0.12s;
}
.rt-playground .rtpg-mode:hover {
  color: var(--rtpg-text);
}
.rt-playground .rtpg-mode:hover svg {
  opacity: 1;
}
.rt-playground .rtpg-mode.is-active {
  background: var(--rtpg-bg);
  color: var(--rtpg-text);
  font-weight: 600;
  box-shadow: inset 0 0 0 1px var(--rtpg-border);
}
.rt-playground .rtpg-mode.is-active svg {
  opacity: 1;
}
.rt-playground .rtpg-mock-badge {
  margin-top: 6px;
  font-size: 11px;
  line-height: 1.4;
  color: var(--rtpg-muted);
  background: rgba(121, 175, 67, 0.08);
  border: 1px solid var(--rtpg-accent-dim);
  border-radius: 6px;
  padding: 5px 8px;
}
.rt-playground .rtpg-mock-badge code {
  font-family: var(--rtpg-mono);
  color: var(--rtpg-accent);
}
.rt-playground .rtpg-head-status {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  min-width: 0;
}
.rt-playground .rtpg-busy-spinner {
  flex: 0 0 auto;
  width: 12px;
  height: 12px;
  border: 2px solid var(--rtpg-border);
  border-top-color: var(--rtpg-accent);
  border-radius: 50%;
  animation: rtpg-spin 0.7s linear infinite;
}
.rt-playground .rtpg-spinner {
  width: 15px;
  height: 15px;
  border: 2px solid var(--rtpg-border);
  border-top-color: var(--rtpg-accent);
  border-radius: 50%;
  animation: rtpg-spin 0.7s linear infinite;
}
@keyframes rtpg-spin {
  to {
    transform: rotate(360deg);
  }
}
.rt-playground .rtpg-card-note {
  color: var(--rtpg-muted);
  font-size: 12.5px;
  font-style: italic;
}
.rt-playground .rtpg-overlay {
  position: absolute;
  inset: 0;
  z-index: 10;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--rtpg-bg);
}
.rt-playground .rtpg-overlay-box {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  text-align: center;
  max-width: 380px;
  padding: 24px;
}
.rt-playground .rtpg-spinner-lg {
  width: 28px;
  height: 28px;
  border-width: 3px;
}
.rt-playground .rtpg-overlay-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--rtpg-text);
}
.rt-playground .rtpg-overlay-sub {
  font-size: 12.5px;
  color: var(--rtpg-muted);
  line-height: 1.5;
}
.rt-playground .rtpg-overlay-err {
  color: var(--rtpg-err);
  font-family: var(--rtpg-mono);
  white-space: pre-wrap;
  text-align: left;
}
</style>
