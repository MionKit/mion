import {spawn, type ChildProcess} from 'node:child_process';
import {createInterface, type Interface} from 'node:readline';
import type {Readable, Writable} from 'node:stream';
import type {
  Diagnostic,
  EnrichFile,
  Metrics,
  BatchSite,
  PureFnSite,
  Replacement,
  Request,
  Response,
  RunType,
  Site,
  TransformResult,
} from './protocol.ts';

export interface ResolverClientOptions {
  // Spawns `serve --sources stdin` and writes this map as the first stdin line (JSON `{"sources": …}`) before any
  // request. Keys are paths relative to `cwd`, values TS source. No on-disk tsconfig is needed: the Go side builds
  // an inferred Program whose root files are exactly these keys.
  inlineSources?: Record<string, string>;
  // Spawns `serve --sources ops`: no startup Program, no handshake, so the client installs state via setSources
  // before scanFiles. The connection survives many setSources / reset cycles, so one child serves a whole vitest file.
  serverMode?: boolean;
  // INTERNAL cache override (tests + direct-binary power users), NOT a public plugin knob: the public RT disk cache
  // follows TypeScript's `incremental` / `composite` switch. Rides the child's MION_CACHE_DIR env var so parallel
  // spawns stay isolated. The binary fingerprints non-version build options into a subdir and folds its own version
  // into every typeID hash, so cache files never cross-contaminate between configurations or releases. Three states:
  //   - a path string → child env MION_CACHE_DIR=<path>: force caching on there.
  //   - an empty string → child env MION_CACHE_DIR="": force caching off, overriding the project's incremental setting.
  //   - undefined → MION_CACHE_DIR unset, so the binary follows the project's incremental setting (off in the
  //     inline / server test modes, which carry no tsconfig).
  cacheDir?: string;
  // Forwarded as --emit-mode: what each RT entry ships in its code/factory slots. 'code' (default) is the body
  // string alone, with the factory rebuilt via `new Function`; 'functions' the live factory alone; 'both' is both.
  emitMode?: 'code' | 'functions' | 'both';
  // Forwarded as --number-mode: the project-wide default for validate's `numberMode`, 'isFinite' (default) /
  // 'typeof' / 'notNaN'. A per-call-site numberMode overrides it.
  numberMode?: string;
  // Parallelism opt-outs: the binary scans markers and renders caches in parallel by default, and an explicit
  // `false` forwards --no-parallel-scan / --no-parallel-render for the serial paths (benchmark baselines, debugging).
  parallelScan?: boolean;
  parallelRender?: boolean;
  // Forwarded as --module-mode, how cache entries group into virtual modules: 'default' (runtype bundle + per-entry
  // fn modules), 'allSingle' (per-family bundles) or 'allModules' (per-node runtype modules too).
  moduleMode?: string;
  // Forwarded as --inline-mode, the child-inlining policy: 'default' (unnamed non-circular compounds inline into
  // their parents, named and circular types stay external) or 'allInternal' (all but circular, names ignored).
  inlineMode?: 'default' | 'allInternal';
  // Forwarded as --single-threaded / --no-single-threaded: one checker, serial scan/render. The lint session sets it
  // true, since per-file interactive scans gain little from the pool and a light child keeps an editor/CI host running
  // several lint runtimes under its process/memory limits. false lets a build override a tsconfig singleThreaded:true.
  singleThreaded?: boolean;
  // Forwarded as --hash-length: the short structural-hash id length in generated names (undefined = the binary
  // default, 7). The build lane forwards the bundler/tsconfig value; the lint lane never sets it.
  hashLength?: number;
  // Forwarded as --pattern-sample-count: mockSamples generated per sample-less format pattern (default 100, 0 disables).
  patternSampleCount?: number;
  // Forwarded as --pattern-sample-retries: the per-sample draw multiplier for pattern sample generation (default 10).
  patternSampleRetries?: number;
  // false forwards --json-max-bytes=false: no root row carries its compact-JSON maximum.
  jsonMaxBytes?: boolean;
  // Extra packages allowed to declare the marker types, forwarded as --marker-packages at spawn. Session config, not
  // a per-request field: the resolver folds it in once when the Program is built, so it must ride the replayed argv.
  markerPackages?: string[];
  // false forwards --no-marker-package-check, matching markers on type name alone; the package gate is on by default.
  markerPackageCheck?: boolean;
  // Forwarded as --js-runtime: the node/bun path the resolver runs format-pattern checks on. buildResolverArgs
  // defaults it to THIS process's own execPath, so every lane has an engine with zero configuration.
  jsRuntime?: string;
  // Pure-fn build report. `pureFnReportWire` forwards --pure-fn-report-wire (populate Response.pureFnSites for the
  // in-process callback); `pureFnReportFile` also forwards --pure-fn-report-file, writing the HARDCODED, not
  // configurable `<genDir>/types/pure-fns-report.json` on generate. Off by default so the pipeline pays nothing.
  // These are the low-level flags the plugin's `pureFnReport` tri-state resolves into, named after the CLI flags.
  pureFnReportWire?: boolean;
  pureFnReportFile?: boolean;
  // Forwarded as --gen-dir: the explicit output-root override (the plugin's genDir option, absolute). Session config,
  // since EVERY op needing the root resolves it the same way (flag > tsconfig genDir > inferred <srcDir>/.mion);
  // undefined lets the Go side resolve it and echo the result back on GenerateResult.outDir.
  genDir?: string;
  // Forwarded as --client-tsconfig: the tsconfig of a SEPARATE mion client project this (server) session generates
  // the batch transport from (`<outDir>/rpc/`); relative paths resolve against the resolver's cwd.
  // Undefined means the program itself is the batch source.
  clientTsconfig?: string;
  // Forwarded as --api-tsconfig: the tsconfig of the SEPARATE project declaring the API this (client) session calls,
  // where the bundleApi lane resolves the routes' types. Undefined means the API is in this program.
  apiTsconfig?: string;
  // Forwarded as --bundle-api: picks the client-side bundleApi lane; unset leaves the binary's default, 'bundled'.
  bundleApi?: 'bundled' | 'mixed' | 'off';
  // Forwarded as --transform-relative: rewrite the injected import block's `rtmod:` specifiers to paths relative to
  // the resolved output root (files mode). The bundler plugin always sets it; the virtual-module lanes (batchcompile
  // pass 1, the transform-wire bench, the inline test lane) leave it off. Session config: every consumer is homogeneous.
  transformRelative?: boolean;
  // Forwarded as --omit-sources-content: drop the embedded original source from each 'go'-mode transform source map,
  // the heaviest single wire item. A spawn flag because it mirrors the immutable plugin option `sourcesContent: false`.
  // A pure wire trim: no artifact changes, and transforms are never disk-cached, so it is not a fingerprint input.
  omitSourcesContent?: boolean;
  // Enrichment session config, forwarded as --enrich-friendly / --enrich-mock / --enrich-i18n / --enrich-locales /
  // --enrich-source-locale. The wire's enrich op carries only `files`, so these flags select the families OpEnrich
  // maintains and the per-locale mirror sync (locales / sourceLocale default from the tsconfig i18n block).
  enrichFriendly?: boolean;
  enrichMock?: boolean;
  enrichI18n?: boolean;
  enrichLocales?: string[];
  enrichSourceLocale?: string;
}

// WireStats is a connection's cumulative stdio byte + request tally (UTF-8, both directions), read by the
// transform-mode benchmark to compare 'go' vs 'edits' wire cost. Always on: counting costs nothing beside the
// JSON encode/decode of the same lines.
export interface WireStats {
  bytesWritten: number;
  bytesRead: number;
  requests: number;
}

// Transport-injected error reasons for a lost connection. `send`'s respawn-retry matches on EXACTLY these
// (a Go-side {error} response must never look retryable), so keep the literals and the matcher together.
const RESOLVER_EXITED = 'resolver exited';
const SPAWN_FAILED_PREFIX = 'spawn failed';
function isTransportLoss(reason: string): boolean {
  return reason === RESOLVER_EXITED || reason.startsWith(SPAWN_FAILED_PREFIX);
}

// How long close() waits for in-flight requests before releasing the process anyway: a hung child must not wedge teardown.
const CLOSE_DRAIN_TIMEOUT_MS = 5000;

// Common JSON-per-line framing, owning the in-flight request queue. Agnostic to whether the streams come from
// a spawned child process or a Unix-socket connection.
class MessageTransport {
  private lines: Interface;
  private queue: Array<(r: Response) => void> = [];
  private closed = false;
  // Drain state: close() came with requests still in flight, so new ones are refused, pending ones get their
  // real responses, then the connection is released (bounded by CLOSE_DRAIN_TIMEOUT_MS).
  private closing = false;
  private drainTimer: NodeJS.Timeout | null = null;
  private bytesWritten = 0;
  private bytesRead = 0;
  private requestCount = 0;

  constructor(
    private readonly stdin: Writable,
    stdout: Readable,
    private readonly onClose: () => void
  ) {
    this.lines = createInterface({input: stdout});
    this.lines.on('line', (line) => {
      // + 1 for the newline framing readline stripped.
      this.bytesRead += Buffer.byteLength(line, 'utf8') + 1;
      const done = this.queue.shift();
      if (!done) return;
      try {
        done(JSON.parse(line));
      } catch (e) {
        done({error: `parse: ${String(e)}`});
      }
      // Last in-flight response landed after a draining close — finish it.
      if (this.closing && this.queue.length === 0) this.finishClose();
    });
  }

  wireStats(): WireStats {
    return {bytesWritten: this.bytesWritten, bytesRead: this.bytesRead, requests: this.requestCount};
  }

  // markClosed drains pending requests with an error; called by external close hooks (child 'exit', socket 'close').
  markClosed(reason: string): void {
    this.closed = true;
    this.clearDrainTimer();
    while (this.queue.length) this.queue.shift()!({error: reason});
  }

  // writeUnframed skips the queue: the inline-sources handshake, which the Go side reads before its request loop.
  writeUnframed(payload: string): void {
    this.stdin.write(payload);
  }

  async request(req: Request): Promise<Response> {
    if (this.closed || this.closing) throw new Error('resolver is closed');
    return new Promise<Response>((resolve) => {
      this.queue.push(resolve);
      const payload = JSON.stringify(req) + '\n';
      this.bytesWritten += Buffer.byteLength(payload, 'utf8');
      this.requestCount += 1;
      this.stdin.write(payload);
    });
  }

  // close drains before it kills: requests already on the wire get their real responses (bounded), only then is
  // the process released. Closing eagerly here used to reject every in-flight request with "generate: resolver
  // exited" whenever one plugin container tore down while another still had work on the shared child (the buildEnd race).
  close(): void {
    if (this.closed || this.closing) return;
    if (this.queue.length === 0) {
      this.closed = true;
      this.onClose();
      return;
    }
    this.closing = true;
    this.drainTimer = setTimeout(() => this.finishClose(), CLOSE_DRAIN_TIMEOUT_MS);
    // Never hold the host process open just for a drain window.
    this.drainTimer.unref?.();
  }

  private finishClose(): void {
    if (this.closed) return;
    this.closed = true;
    this.clearDrainTimer();
    this.onClose();
  }

  private clearDrainTimer(): void {
    if (!this.drainTimer) return;
    clearTimeout(this.drainTimer);
    this.drainTimer = null;
  }
}

// ScanFilesOptions opts scanFiles into returning runTypes / the per-entry virtual modules, projected over the
// request's files. All off by default, so the rewrite pipeline (which needs only site offsets) pays nothing extra.
export interface ScanFilesOptions {
  includeRunTypes?: boolean;
  includeEntryModules?: boolean;
  // The per-op `metrics` block (checker counters, per-phase wall times, Go memory deltas). Bench-harness use.
  includeMetrics?: boolean;
  // The enrichment-health pass (tag hygiene, FriendlyText/MockData content, breadcrumb drift) as Family.Enrich
  // diagnostics. Lint-plugin use.
  checkEnrich?: boolean;
  // The mion route rules over the request's files, as Family.MionRoute diagnostics. Lint-plugin use.
  checkRouterRules?: boolean;
  // The RunType-family render diagnostics (VL010, PJ001, …) without the entry-module payload. Lint-plugin use.
  includeRtDiagnostics?: boolean;
}

// ScanFilesResult is what scanFiles returns. Sites are flat, every site across the request's files, each tagged
// with .file so callers can filter or group. Replacements are byte-range rewrites of the user's source (pure-fn
// factory arg to binding) that the Go transform applies alongside Site insertions.
export interface ScanFilesResult {
  sites: Site[];
  replacements?: Replacement[];
  runTypes?: RunType[];
  entryModules?: Record<string, string>;
  diagnostics?: import('./protocol.ts').Diagnostic[];
  // Regenerate signals; see Response.addedRunTypes in protocol.ts.
  addedRunTypes?: boolean;
  addedPureFns?: boolean;
  // Pure-fn build report DELTA for the rescanned files, present only when the resolver's report is enabled;
  // the plugin's update-lane callback source.
  pureFnSites?: PureFnSite[];
  // Request-batch build report DELTA for the rescanned files, same gating as pureFnSites; the update-lane
  // source for `onBatchReport`.
  batchSites?: BatchSite[];
  // Present only when the request set includeMetrics.
  metrics?: Metrics;
}

// TransformFilesResult is what transform() returns: one TransformResult per requested file, keyed by file path.
// The compiler-driven path, where Go applies the rewrite and generates the map, so the plugin just plumbs
// {code, map} to Vite. Sites/replacements ride along for the no-op short-circuit and the tests.
export interface TransformFilesResult {
  transformed: Record<string, TransformResult>;
  sites: Site[];
  replacements?: Replacement[];
  diagnostics?: Diagnostic[];
  addedRunTypes?: boolean;
  addedPureFns?: boolean;
}

// GenerateResult is what generate() returns: the live manifest of module basenames under <outDir>/types, the
// output root actually written to (the resolver-inferred <srcDir>/.mion when none was passed), the source files
// carrying marker sites (the plugin's transform gate), and the full-program render's diagnostics (a pure-fn
// extraction error is halt-worthy).
export interface GenerateResult {
  modules: string[];
  outDir: string;
  siteFiles: string[];
  // The batch transport echo, see Response.batchesModule / batchSourceFiles / routerInitFiles.
  // `batchesModule` is '' when no table was written.
  batchesModule: string;
  batchSourceFiles: string[];
  batchSourceRoots: string[];
  routerInitFiles: string[];
  diagnostics?: Diagnostic[];
  // Whole-program pure-fn build report, present only when the resolver's report is enabled: the plugin's
  // build-lane callback source, the same records written to `<genDir>/types/pure-fns-report.json`.
  pureFnSites?: PureFnSite[];
  // Whole-program request-batch build report, same gating as pureFnSites; also written to
  // `<genDir>/types/batches-report.json`.
  batchSites?: BatchSite[];
  // Echo of the tsconfig plugin's downgradeErrors, absent when the tsconfig sets none.
  // The plugin adopts it as its downgrade set: options.downgradeErrors ?? this ?? nothing.
  downgradeErrors?: string[];
  /** The package's `mion-pure-fns/` directory, path to content; empty when it registers no pure fn. */
  pureFnArtifact: Record<string, string>;
}

// EnrichResult is what enrich() returns: the computed mirror files, which the caller writes under its own
// HMR-suppression window (the daemon never does), plus the hygiene diagnostics. Which families and locales are
// synced, and where the mirror tree roots, is SESSION config (the enrich* / genDir spawn flags), never per call.
export interface EnrichResult {
  files: EnrichFile[];
  diagnostics?: Diagnostic[];
}

// Common operation surface: spawn-based and socket-based clients both implement it, so a consumer can be typed
// against the connection without caring which transport is in use.
export interface ResolverConnection {
  scanFiles(files: string[], opts?: ScanFilesOptions): Promise<ScanFilesResult>;
  transform(files: string[], opts?: TransformOptions): Promise<TransformFilesResult>;
  generate(): Promise<GenerateResult>;
  enrich(files: string[]): Promise<EnrichResult>;
  dump(): Promise<Response>;
  setSources(sources: Record<string, string>): Promise<void>;
  reset(): Promise<void>;
  tsCompile(): Promise<number>;
  wireStats(): WireStats;
  close(): void;
}

// TransformOptions selects the transform wire mode, the one genuinely per-request transform knob: `emitEdits:
// true` is 'edits' mode, omitted or false is 'go' mode. It stays on the wire because a session can degrade from
// edits to go mid-flight (source-hash drift, applier throw). Everything else is spawn config.
export interface TransformOptions {
  emitEdits?: boolean;
}

// Ops implementation shared between the two clients: `this.transport` is looked up at call time, so
// field-initializer ordering is not a concern, and it is deliberately NOT readonly because ResolverClient
// re-assigns it when it respawns a dead child.
abstract class ResolverClientBase implements ResolverConnection {
  protected abstract transport: MessageTransport;

  // Single request path for every op: ResolverClient overrides it with the respawn-retry lane, the stream
  // and socket clients keep the plain transport.
  protected send(req: Request): Promise<Response> {
    return this.transport.request(req);
  }

  async scanFiles(files: string[], opts: ScanFilesOptions = {}): Promise<ScanFilesResult> {
    if (files.length === 0) throw new Error('scanFiles: files must be non-empty');
    const req: Request = {op: 'scanFiles', files};
    if (opts.includeRunTypes) req.includeRunTypes = true;
    if (opts.includeEntryModules) req.includeEntryModules = true;
    if (opts.includeMetrics) req.includeMetrics = true;
    if (opts.checkEnrich) req.checkEnrich = true;
    if (opts.checkRouterRules) req.checkRouterRules = true;
    if (opts.includeRtDiagnostics) req.includeRtDiagnostics = true;
    const resp = await this.send(req);
    if (resp.error) throw new Error(`scanFiles [${files.join(', ')}]: ${resp.error}`);
    return {
      sites: resp.sites ?? [],
      replacements: resp.replacements,
      runTypes: resp.runTypes,
      entryModules: resp.entryModules,
      diagnostics: resp.diagnostics,
      addedRunTypes: resp.addedRunTypes,
      addedPureFns: resp.addedPureFns,
      pureFnSites: resp.pureFnSites,
      batchSites: resp.batchSites,
      metrics: resp.metrics,
    };
  }

  // transform runs the compiler-driven per-file transform (OpTransform): 'go' mode (default) returns finished
  // code + map per file, 'edits' mode (opts.emitEdits) the raw edit list for the FE applier, a lighter wire.
  // Either way the plugin drives HMR off the same added* signals.
  async transform(files: string[], opts: TransformOptions = {}): Promise<TransformFilesResult> {
    if (files.length === 0) throw new Error('transform: files must be non-empty');
    const req: Request = {op: 'transform', files};
    if (opts.emitEdits) req.emitEdits = true;
    const resp = await this.send(req);
    if (resp.error) throw new Error(`transform [${files.join(', ')}]: ${resp.error}`);
    return {
      transformed: resp.transformed ?? {},
      sites: resp.sites ?? [],
      replacements: resp.replacements,
      diagnostics: resp.diagnostics,
      addedRunTypes: resp.addedRunTypes,
      addedPureFns: resp.addedPureFns,
    };
  }

  // generate runs OpGenerate: the resolver renders the full entry-module set and WRITES it under <outDir>/types/
  // (write-only-on-change, relativized inter-module imports, stale-file GC). The files-mode replacement for the
  // virtual-module load path. The root is SESSION config (`genDir` spawn option, else tsconfig genDir, else the
  // <srcDir>/.mion inference) and always comes back absolute in `outDir`, so a dependency-free host can adopt it.
  async generate(): Promise<GenerateResult> {
    const resp = await this.send({op: 'generate'});
    if (resp.error) throw new Error(`generate: ${resp.error}`);
    return {
      modules: resp.generated ?? [],
      outDir: resp.outDir ?? '',
      siteFiles: resp.siteFiles ?? [],
      batchesModule: resp.batchesModule ?? '',
      batchSourceFiles: resp.batchSourceFiles ?? [],
      batchSourceRoots: resp.batchSourceRoots ?? [],
      routerInitFiles: resp.routerInitFiles ?? [],
      diagnostics: resp.diagnostics,
      pureFnSites: resp.pureFnSites,
      batchSites: resp.batchSites,
      downgradeErrors: resp.downgradeErrors,
      pureFnArtifact: resp.pureFnArtifact ?? {},
    };
  }

  // enrich syncs the FriendlyText / MockData mirrors for `files` (empty = whole program) and returns the computed
  // content; it NEVER writes, the caller writes under its own HMR-suppression window.
  // The wire carries only the event: the families / locales / output root are the session's spawn-time config.
  async enrich(files: string[]): Promise<EnrichResult> {
    const resp = await this.send({op: 'enrich', files});
    if (resp.error) throw new Error(`enrich: ${resp.error}`);
    return {files: resp.enrichFiles ?? [], diagnostics: resp.diagnostics};
  }

  async dump(): Promise<Response> {
    return this.send({op: 'dump'});
  }

  async setSources(sources: Record<string, string>): Promise<void> {
    const resp = await this.send({op: 'setSources', sources});
    if (resp.error) throw new Error(`setSources: ${resp.error}`);
  }

  // reset wipes ALL resolver state (cache, sites, Program, overlay); the contract is Session.Reset in
  // internal/compiler/resolver/resolver.go. The caller must call setSources before the next scanFiles.
  async reset(): Promise<void> {
    const resp = await this.send({op: 'reset'});
    if (resp.error) throw new Error(`reset: ${resp.error}`);
  }

  // tsCompile runs the embedded tsgo through bind + typecheck + Emit() on the current overlay and returns the
  // wall-time in ms: purely the TypeScript baseline, it walks no markers and renders no cache modules.
  // The caller must have called setSources first.
  async tsCompile(): Promise<number> {
    const resp = await this.send({op: 'tsCompile'});
    if (resp.error) throw new Error(`tsCompile: ${resp.error}`);
    return resp.tsCompileMs ?? 0;
  }

  // wireStats exposes the connection's cumulative stdio byte + request tally, read by the transform-mode
  // benchmark to compare 'go' vs 'edits' wire cost.
  wireStats(): WireStats {
    return this.transport.wireStats();
  }

  close(): void {
    this.transport.close();
  }
}

// buildResolverArgs assembles the resolver child's argv from client options. Shared by ResolverClient (which
// spawns the child itself) and the lint session's spawn-shim path, which hands the argv to a pre-spawned
// launcher (see lint/spawn-shim.ts).
export function buildResolverArgs(cwd: string, tsconfigPath: string, opts: ResolverClientOptions = {}): string[] {
  // The resolver protocol is the `serve` subcommand; --sources selects where its startup Program comes from
  // (project | stdin | ops). serverMode wins over inlineSources when both are set, matching the Go dispatch order.
  const args = ['serve', '--cwd', cwd];
  // Forward ONLY an explicitly configured tsconfig: unset, the Go side resolves it exactly as tsc does, searching
  // upward from cwd, so the JS side carries no config logic of its own.
  if (tsconfigPath) {
    args.push('--tsconfig', tsconfigPath);
  }
  if (opts.serverMode) args.push('--sources', 'ops');
  else if (opts.inlineSources) args.push('--sources', 'stdin');
  // cacheDir is NOT a CLI arg: it rides the child's MION_CACHE_DIR env var, set by ResolverClient's spawn.
  if (opts.emitMode) args.push('--emit-mode', opts.emitMode);
  if (opts.numberMode) args.push('--number-mode', opts.numberMode);
  if (opts.parallelScan === false) args.push('--no-parallel-scan');
  if (opts.parallelRender === false) args.push('--no-parallel-render');
  if (opts.moduleMode) args.push('--module-mode', opts.moduleMode);
  if (opts.inlineMode) args.push('--inline-mode', opts.inlineMode);
  if (opts.singleThreaded === true) args.push('--single-threaded');
  else if (opts.singleThreaded === false) args.push('--no-single-threaded');
  if (opts.hashLength !== undefined) args.push('--hash-length', String(opts.hashLength));
  if (opts.patternSampleCount !== undefined) args.push('--pattern-sample-count', String(opts.patternSampleCount));
  if (opts.patternSampleRetries !== undefined) args.push('--pattern-sample-retries', String(opts.patternSampleRetries));
  if (opts.jsonMaxBytes === false) args.push('--json-max-bytes=false');
  if (opts.markerPackages?.length) args.push('--marker-packages', opts.markerPackages.join(','));
  if (opts.markerPackageCheck === false) args.push('--no-marker-package-check');
  // Always passed: the format-pattern checks need a real JS engine and THIS process is one, so its execPath is
  // the zero-config default for every lane. An explicit option pins another.
  args.push('--js-runtime', opts.jsRuntime ?? process.execPath);
  if (opts.pureFnReportWire) args.push('--pure-fn-report-wire');
  if (opts.pureFnReportFile) args.push('--pure-fn-report-file');
  // Session config the wire deliberately does not carry: the output-root override and the OpEnrich family / i18n selection.
  if (opts.genDir) args.push('--gen-dir', opts.genDir);
  if (opts.clientTsconfig) args.push('--client-tsconfig', opts.clientTsconfig);
  if (opts.apiTsconfig) args.push('--api-tsconfig', opts.apiTsconfig);
  if (opts.bundleApi) args.push('--bundle-api', opts.bundleApi);
  if (opts.transformRelative) args.push('--transform-relative');
  if (opts.omitSourcesContent) args.push('--omit-sources-content');
  if (opts.enrichFriendly) args.push('--enrich-friendly');
  if (opts.enrichMock) args.push('--enrich-mock');
  if (opts.enrichI18n) args.push('--enrich-i18n');
  if (opts.enrichLocales && opts.enrichLocales.length > 0) args.push('--enrich-locales', opts.enrichLocales.join(','));
  if (opts.enrichSourceLocale) args.push('--enrich-source-locale', opts.enrichSourceLocale);
  return args;
}

// ResolverClient spawns the mion binary and drives it over its JSON-per-line stdio protocol, keeping the child
// alive until `close()` so the Program + checker pool are amortised across queries. Three modes, all the `serve`
// subcommand, differing only in --sources:
//   - default: `serve` (--sources project) against an on-disk tsconfig.
//   - opts.inlineSources: `serve --sources stdin`, source map written as the handshake line before any request.
//   - opts.serverMode: `serve --sources ops`, no startup Program; the caller drives the ops over stdin.
export class ResolverClient extends ResolverClientBase {
  private child!: ChildProcess;
  protected transport!: MessageTransport;
  // True once the OWNER closed this client: an exit after that is expected and must never trigger a respawn.
  private intentionalClose = false;
  // Lifetime respawn budget: enough for the rare transient child loss (host lifecycle races, external kills)
  // without churning forever on a host where every spawn dies.
  private respawnsLeft = 3;

  constructor(
    private readonly binary: string,
    private readonly cwd: string,
    private readonly tsconfigPath: string,
    private readonly opts: ResolverClientOptions = {}
  ) {
    super();
    this.spawnChild();
  }

  // The child's OS pid (fresh after a respawn). Diagnostics + tests.
  get pid(): number | undefined {
    return this.child.pid;
  }

  // Releases the host process from the resolver child: it stops counting toward the event loop's keep-alive set,
  // so the host can exit when ITS OWN work is done while the resolver stays usable until then. The child is not
  // orphaned, losing the parent closes its stdin and the Go `serve` loop breaks on EOF.
  // WRONG for a BUNDLER host: a pending resolver response can be the build's only live handle, so an unref'd
  // child would let the process exit mid-build. This exists for Bun's RUNTIME loader, which keeps one resolver
  // for the whole process and never gets a buildEnd to close it (the `detachResolver` option, runtypes/bun).
  unref(): void {
    this.child?.unref();
    // The stdio pipes are libuv handles of their own and keep the loop alive, so the child handle is not enough.
    unrefHandle(this.child?.stdin);
    unrefHandle(this.child?.stdout);
  }

  override close(): void {
    this.intentionalClose = true;
    super.close();
  }

  // spawnChild (re)creates the child process + transport, from the constructor and again on respawn: both
  // one-shot lanes rebuild their Program from the same tsconfig or replayed inline-sources handshake, so a
  // fresh child serves requests identically.
  private spawnChild(): void {
    const args = buildResolverArgs(this.cwd, this.tsconfigPath, this.opts);
    // cacheDir rides the child's MION_CACHE_DIR env, not a CLI arg, so concurrent spawns with different cache
    // dirs don't collide. A path forces the cache on there, '' forces it off, undefined leaves the env untouched.
    const env = this.opts.cacheDir !== undefined ? {...process.env, MION_CACHE_DIR: this.opts.cacheDir} : process.env;
    const child = spawn(this.binary, args, {stdio: ['pipe', 'pipe', 'inherit'], env});
    if (!child.stdin || !child.stdout) {
      throw new Error('failed to spawn mion (no stdio pipes)');
    }
    this.child = child;
    const stdin = child.stdin;
    const stdout = child.stdout;
    // A write into the pipe of a child that just died (exit event not yet delivered) raises a stream error;
    // swallow it, since the exit handler below owns the failure semantics and `send` retries the request.
    stdin.on('error', () => {});
    const transport = new MessageTransport(stdin, stdout, () => {
      stdin.end();
      child.kill();
    });
    this.transport = transport;
    // A spawn failure (missing binary, host limits) raises 'error' with NO 'exit', so drain in-flight requests
    // instead of hanging callers until their timeout.
    child.on('error', (error) => transport.markClosed(`${SPAWN_FAILED_PREFIX}: ${error.message}`));
    if (this.opts.inlineSources) {
      // Handshake: the Go side blocks on this line before building its Program, so a request() issued right
      // after the constructor naturally lands after it on the wire.
      transport.writeUnframed(JSON.stringify({sources: this.opts.inlineSources}) + '\n');
    }
    child.on('exit', () => transport.markClosed(RESOLVER_EXITED));
  }

  // An UNEXPECTED child death is retryable: the one-shot lanes are stateless across spawns, so one respawn plus
  // replay turns a transient loss (host teardown race, external kill) into a stderr warning, not a failed build.
  // serverMode is excluded: its accumulated setSources/reset state lives in the child and cannot be replayed here.
  protected override async send(req: Request): Promise<Response> {
    const attempt = this.transport;
    let resp: Response;
    try {
      resp = await attempt.request(req);
    } catch (error) {
      // 'resolver is closed': the transport was already down before this request was written, e.g. the death
      // happened between two requests.
      if (!this.canRespawn()) throw error;
      this.respawnFor(attempt);
      return this.transport.request(req);
    }
    if (typeof resp.error === 'string' && isTransportLoss(resp.error) && this.canRespawn()) {
      this.respawnFor(attempt);
      return this.transport.request(req);
    }
    return resp;
  }

  private canRespawn(): boolean {
    return !this.intentionalClose && !this.opts.serverMode && this.respawnsLeft > 0;
  }

  // respawnFor replaces the dead child exactly once per loss: concurrent requests that died together all funnel
  // here, and the transport identity check makes every caller after the first reuse the fresh child.
  // Synchronous on purpose: no await between the check and the spawn, so no window for a duplicate respawn.
  private respawnFor(dead: MessageTransport): void {
    if (this.transport !== dead) return;
    this.respawnsLeft -= 1;
    console.error('[@mionjs/devtools] resolver process died unexpectedly — respawned it and retrying the interrupted request.');
    try {
      this.child.kill();
    } catch {
      // The child is already gone in the common path.
    }
    this.spawnChild();
  }
}

// ResolverStreamClient drives the same protocol over caller-supplied streams, for the lint session's spawn-shim
// path: the stdio pipes belong to the pre-spawned launcher, not to a ChildProcess this module owns, so the
// caller wires close/exit itself.
export class ResolverStreamClient extends ResolverClientBase {
  protected transport: MessageTransport;

  constructor(stdin: Writable, stdout: Readable, onClose: () => void) {
    super();
    this.transport = new MessageTransport(stdin, stdout, onClose);
  }

  // markClosed drains in-flight requests with an error once the process went away; the caller observes that
  // exit, not this class.
  markClosed(reason: string): void {
    this.transport.markClosed(reason);
  }
}

// unrefHandle releases one stdio pipe from the event loop's keep-alive set. Node backs a piped stdio stream with
// a Socket, which has unref, but the declared Readable/Writable types do not and a future runtime might not
// either, so this probes for the method instead of assuming it.
function unrefHandle(stream: Readable | Writable | null | undefined): void {
  (stream as {unref?: () => void} | null | undefined)?.unref?.();
}
