import {spawn, type ChildProcess} from 'node:child_process';
import {createInterface, type Interface} from 'node:readline';
import type {Readable, Writable} from 'node:stream';
import type {
  Diagnostic,
  EnrichFile,
  Metrics,
  PureFnSite,
  Replacement,
  Request,
  Response,
  RunType,
  Site,
  TransformResult,
} from './protocol.ts';

export interface ResolverClientOptions {
  // When set, the resolver is spawned with `serve --sources stdin` and the
  // map is written as the first stdin line (JSON `{"sources": …}`) before
  // any request. Keys are paths relative to `cwd`; values are TS source.
  // No on-disk tsconfig is needed in this mode — the Go side builds an
  // inferred Program whose root files are exactly the overlay keys.
  inlineSources?: Record<string, string>;
  // When true, spawns with `serve --sources ops`: no startup Program, no
  // handshake. The client is expected to install state via setSources
  // before calling scanFiles. The same connection persists across many
  // setSources / reset cycles, so a single child process can serve every
  // test in a vitest file.
  serverMode?: boolean;
  // INTERNAL cache override (tests + direct-binary power users; NOT a public
  // plugin knob). The public RT disk cache follows TypeScript's `incremental` /
  // `composite` switch; this forces it via the child's MION_CACHE_DIR env var so
  // parallel spawns stay isolated (each child gets its own value). The Go binary
  // fingerprints non-version build options into a subdir and folds binary
  // version into every typeID hash, so cache files never cross-contaminate
  // between configurations or releases. Three states:
  //   - a path string → child env MION_CACHE_DIR=<path>: force caching on there.
  //   - an empty string → child env MION_CACHE_DIR="": force caching off,
  //     overriding the project's incremental setting.
  //   - undefined → MION_CACHE_DIR not set, so the binary follows the project's
  //     incremental setting (on for an incremental tsconfig, off otherwise; off
  //     in the inline / server test modes, which carry no tsconfig).
  cacheDir?: string;
  // Forwarded as --emit-mode. Selects what each RT entry ships in its
  // code/factory slots: 'code' (default — body string only, factory rebuilt
  // via `new Function`), 'functions' (live factory only, code derived lazily),
  // or 'both' (code string + live factory). Defaults to 'code' when omitted.
  emitMode?: 'code' | 'functions' | 'both';
  // Forwarded as --binary-sizing-bias / --binary-sizing-items /
  // --binary-sizing-string-bytes / --binary-sizing-max-bytes (field names mirror
  // the flags, for greppability). Tune the binary `dynamic` cold-start buffer
  // estimate; omitted values fall through to the binary defaults
  // (0.8 / 100 / 32 / 65536).
  binarySizingBias?: number;
  binarySizingItems?: number;
  binarySizingStringBytes?: number;
  binarySizingMaxBytes?: number;
  // Forwarded as --number-mode. Project-wide default for the validate
  // `numberMode` option: 'isFinite' (default) / 'typeof' / 'notNaN'. A
  // per-call-site numberMode overrides it.
  numberMode?: string;
  // Forwarded as --parse-strategy. Project-wide default for createParseFn's
  // `strategy` option: 'preserve' (default) / 'strip' / 'fail'. A per-call-site
  // strategy overrides it.
  parseStrategy?: string;
  // Parallelism opt-outs. The Go binary runs its parallel marker scan
  // and parallel cache renders by default; an explicit `false` forwards
  // --no-parallel-scan / --no-parallel-render to force the serial paths
  // (benchmark baselines, debugging). Undefined or true leave the
  // defaults on.
  parallelScan?: boolean;
  parallelRender?: boolean;
  // Forwarded as --module-mode: how cache entries group into virtual
  // modules — 'default' (runtype bundle + per-entry fn modules),
  // 'allSingle' (per-family bundle modules), or 'allModules' (per-node
  // runtype modules too). Undefined leaves the binary default.
  moduleMode?: string;
  // Forwarded as --inline-mode: the child-inlining policy — 'default'
  // (unnamed non-circular compounds inline into their parents; named and
  // circular types stay external) or 'allInternal' (everything except
  // circular inlines, names ignored). Undefined leaves the binary default.
  inlineMode?: 'default' | 'allInternal';
  // Forwarded as --single-threaded (true) / --no-single-threaded (false): one
  // checker, serial scan/render. The lint session sets it true — per-file
  // interactive scans gain little from the pool, and a light child keeps
  // editor/CI hosts (which may run several lint runtimes side by side) well
  // under process/memory limits. false lets a build force multi-threaded over a
  // tsconfig singleThreaded:true.
  singleThreaded?: boolean;
  // Forwarded as --hash-length: the short structural-hash id length in generated
  // names (undefined = the binary default, 7). The build lane forwards the
  // bundler/tsconfig value; the lint lane never sets it.
  hashLength?: number;
  // Forwarded as --pattern-sample-count: generated mockSamples per
  // sample-less format pattern (undefined = the binary default, 100;
  // 0 disables generation).
  patternSampleCount?: number;
  // Forwarded as --pattern-sample-retries: the per-sample draw multiplier
  // for pattern sample generation (undefined = the binary default, 10).
  patternSampleRetries?: number;
  // Extra packages allowed to declare the marker types, forwarded as
  // --marker-packages at spawn. Session config, not a per-request field: the
  // resolver folds it into its marker options once when the Program is built,
  // so it must ride the argv the client replays on respawn.
  markerPackages?: string[];
  // false forwards --no-marker-package-check, matching markers on type name
  // alone. Undefined/true leaves the package gate on (the default).
  markerPackageCheck?: boolean;
  // Forwarded as --js-runtime: the node/bun path the resolver runs
  // format-pattern checks on. buildResolverArgs defaults it to THIS
  // process's own execPath (the plugin/linter already runs inside a JS
  // runtime), so every lane has an engine with zero configuration.
  jsRuntime?: string;
  // Pure-fn build report. `pureFnReportWire` forwards --pure-fn-report-wire
  // (populate Response.pureFnSites on generate/scan for the in-process callback);
  // `pureFnReportFile` additionally forwards --pure-fn-report-file (write the
  // JSON file to the HARDCODED `<genDir>/types/pure-fns-report.json` on
  // generate). The location is not configurable. Off by default so the pipeline
  // pays nothing. These are the low-level flags the plugin's `pureFnReport`
  // tri-state resolves into (same name as the CLI flag, for greppability).
  pureFnReportWire?: boolean;
  pureFnReportFile?: boolean;
  // Forwarded as --gen-dir: the explicit RunTypes output-root override (the
  // plugin's own genDir option, absolute). Session config — EVERY op that needs
  // the root (generate, transform, enrich) resolves it the same way
  // (flag > tsconfig genDir > inferred <srcDir>/.mion); undefined lets the
  // Go side resolve from tsconfig / inference and echo the result back on
  // GenerateResult.outDir.
  genDir?: string;
  // Forwarded as --transform-relative: transform rewrites the injected import
  // block's `rtmod:` specifiers to paths relative to the resolved output root
  // (files mode). The bundler plugin always sets it; the virtual-module lanes
  // (batchcompile pass 1, the transform-wire bench, the inline test lane) leave
  // it off. Session config because every consumer is session-homogeneous.
  transformRelative?: boolean;
  // Forwarded as --omit-sources-content: drop the embedded original source from
  // each 'go'-mode transform source map (the heaviest single wire item). Mirrors
  // the immutable plugin option `sourcesContent: false`, which is why it is a
  // spawn flag rather than a per-call argument. A pure wire trim — no artifact
  // changes, and transforms are never disk-cached, so it is not a fingerprint
  // input.
  omitSourcesContent?: boolean;
  // Enrichment session config, forwarded as --enrich-friendly / --enrich-mock /
  // --enrich-i18n / --enrich-locales / --enrich-source-locale. The wire's enrich
  // op carries only `files`; these spawn flags select the families OpEnrich
  // maintains and configure the per-locale translation-mirror sync (locales /
  // sourceLocale default from the tsconfig i18n block when omitted).
  enrichFriendly?: boolean;
  enrichMock?: boolean;
  enrichI18n?: boolean;
  enrichLocales?: string[];
  enrichSourceLocale?: string;
}

// WireStats is the cumulative byte + request tally of a connection's stdio
// traffic (UTF-8 wire bytes, both directions). The transform-mode benchmark
// reads it to compare 'go' vs 'edits' wire cost; always-on because the cost of
// counting is negligible beside the JSON encode/decode of the same lines.
export interface WireStats {
  bytesWritten: number;
  bytesRead: number;
  requests: number;
}

// Transport-injected error reasons for a lost connection. `send`'s
// respawn-retry matches on EXACTLY these (a Go-side {error} response must
// never look retryable), so keep the literals and the matcher together.
const RESOLVER_EXITED = 'resolver exited';
const SPAWN_FAILED_PREFIX = 'spawn failed';
function isTransportLoss(reason: string): boolean {
  return reason === RESOLVER_EXITED || reason.startsWith(SPAWN_FAILED_PREFIX);
}

// How long close() waits for in-flight requests to settle before releasing
// the underlying process anyway (a hung child must not wedge teardown).
const CLOSE_DRAIN_TIMEOUT_MS = 5000;

// Common JSON-per-line request/response framing. Owns the in-flight request
// queue. The transport is agnostic to whether the streams come from a
// spawned child process or a Unix-socket connection.
class MessageTransport {
  private lines: Interface;
  private queue: Array<(r: Response) => void> = [];
  private closed = false;
  // Drain state: close() was called with requests still in flight — new
  // requests are refused, pending ones get their real responses, then the
  // connection is released (bounded by CLOSE_DRAIN_TIMEOUT_MS).
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
      // + 1 for the newline framing readline stripped — counts the whole line.
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

  // markClosed is called by external close hooks (child 'exit', socket
  // 'close') to drain pending requests with an error.
  markClosed(reason: string): void {
    this.closed = true;
    this.clearDrainTimer();
    while (this.queue.length) this.queue.shift()!({error: reason});
  }

  // writeUnframed writes raw bytes without queuing — used for the
  // inline-sources handshake which the Go side reads before entering the
  // request loop.
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

  // close drains before it kills: requests already on the wire get their real
  // responses (bounded), only then is the underlying process released. Closing
  // eagerly here used to reject every in-flight request with
  // "generate: resolver exited" whenever one plugin container tore down while
  // another still had work on the shared child (the buildEnd race).
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

// ScanFilesOptions opts the scanFiles call into returning runTypes / the
// per-entry virtual modules projected over the request's files. Both
// fields are off by default so the rewrite pipeline (which only needs
// site offsets) pays nothing extra.
export interface ScanFilesOptions {
  includeRunTypes?: boolean;
  includeEntryModules?: boolean;
  // Opts the result into the per-op `metrics` block (checker counters,
  // per-phase wall times, Go memory deltas). Bench-harness use; the
  // rewrite pipeline never sets it.
  includeMetrics?: boolean;
  // Opts the response into the enrichment-health pass over the request's
  // files (tag hygiene + FriendlyText/MockData content + breadcrumb drift),
  // returned as Family.Enrich diagnostics. Lint-plugin use; the rewrite
  // pipeline never sets it.
  checkEnrich?: boolean;
  // Opts the response into the RunType-family render diagnostics (VL010,
  // PJ001, …) without the entry-module payload. Lint-plugin use.
  includeRtDiagnostics?: boolean;
}

// ScanFilesResult is the shape returned by scanFiles. Sites are flat —
// every site detected across the request's files, each tagged with .file
// so callers can filter or group. Replacements are byte-range rewrites
// for the user's source (pure-fn factory-arg-to-binding); the Go
// transform applies them (OpTransform) alongside Site insertions. runTypes /
// entryModules are populated only when opted into.
export interface ScanFilesResult {
  sites: Site[];
  replacements?: Replacement[];
  runTypes?: RunType[];
  entryModules?: Record<string, string>;
  diagnostics?: import('./protocol.ts').Diagnostic[];
  // Per-cache HMR signals; see Response.addedRunTypes etc in protocol.ts.
  addedRunTypes?: boolean;
  addedValidate?: boolean;
  addedValidationErrors?: boolean;
  addedPrepareForJson?: boolean;
  addedRestoreFromJson?: boolean;
  addedStringifyJson?: boolean;
  addedPrepareForJsonSafe?: boolean;
  addedHasUnknownKeys?: boolean;
  addedCloneExactShape?: boolean;
  addedUnknownKeyErrors?: boolean;
  addedUnknownKeysToUndefinedWire?: boolean;
  addedToBinary?: boolean;
  addedFromBinary?: boolean;
  addedFormatTransform?: boolean;
  addedPureFns?: boolean;
  // Pure-fn build report DELTA for the rescanned files — present only when the
  // resolver's pure-fn report is enabled. The plugin's update-lane callback
  // source (the changed sites).
  pureFnSites?: PureFnSite[];
  // Present only when the request set includeMetrics.
  metrics?: Metrics;
}

// TransformFilesResult is the shape returned by transform(): one
// TransformResult (rewritten code + source map) per requested file, keyed by
// file path, plus the flat file-tagged sites/replacements and the HMR added*
// signals. The compiler-driven path — Go applies the rewrite + generates the
// map and hands back finished code, so the plugin just plumbs {code, map} to
// Vite. Sites/replacements ride along for the no-op short-circuit + tests.
export interface TransformFilesResult {
  transformed: Record<string, TransformResult>;
  sites: Site[];
  replacements?: Replacement[];
  diagnostics?: Diagnostic[];
  addedRunTypes?: boolean;
  addedPureFns?: boolean;
}

// GenerateResult is the shape returned by generate(): the live manifest of
// module basenames written under <outDir>/types, the output root actually
// written to (the resolver-inferred <srcDir>/.mion when none was passed),
// the source files carrying marker sites (the plugin's transform gate), plus
// any diagnostics the full-program render produced (pure-fn extraction errors
// are halt-worthy).
export interface GenerateResult {
  modules: string[];
  outDir: string;
  siteFiles: string[];
  diagnostics?: Diagnostic[];
  // Whole-program pure-fn build report — present only when the resolver's
  // pure-fn report is enabled. The plugin's build-lane callback source; the
  // same records the resolver also writes to `<genDir>/types/pure-fns-report.json`.
  pureFnSites?: PureFnSite[];
  // Echo of the tsconfig plugin's failOnError (absent when the tsconfig sets
  // none). The plugin adopts it as the halt default: options.failOnError ?? this
  // ?? true.
  failOnError?: boolean;
}

// EnrichResult is the shape returned by enrich(): the computed mirror files (the
// caller writes them under its own HMR-suppression window; the daemon never does)
// plus any diagnostics (the freshly-scaffolded hygiene worklist). Which families
// and locales are synced, and where the mirror tree roots, is SESSION config —
// the ResolverClientOptions enrich* / genDir spawn flags — never per-call input.
export interface EnrichResult {
  files: EnrichFile[];
  diagnostics?: Diagnostic[];
}

// Common operation surface. Spawn-based and socket-based clients both
// implement this interface so consumers can be typed against the connection
// without caring which transport is in use.
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

// TransformOptions selects the transform wire mode, the one genuinely
// per-request transform knob: `emitEdits: true` is 'edits' mode — each
// TransformResult carries importBlock + edits + sourceHash for the FE to apply
// itself; omitted (or false) is 'go' mode (full code + map). A session can
// degrade from edits to go mid-flight (source-hash drift, applier throw), which
// is why this stays on the wire. The output root, files-mode relativization and
// the source-map trim are all spawn config (ResolverClientOptions).
export interface TransformOptions {
  emitEdits?: boolean;
}

// Mixed-in ops implementation shared between the two clients. Inheritance
// keeps the method definitions in one place and `this.transport` lookup
// happens at call time, so field-initializer ordering isn't a concern.
// (`transport` is deliberately NOT readonly: ResolverClient re-assigns it
// when it respawns a dead child.)
abstract class ResolverClientBase implements ResolverConnection {
  protected abstract transport: MessageTransport;

  // Single request path for every op — ResolverClient overrides it with the
  // respawn-retry lane; the stream/socket clients keep the plain transport.
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
      addedValidate: resp.addedValidate,
      addedValidationErrors: resp.addedValidationErrors,
      addedPrepareForJson: resp.addedPrepareForJson,
      addedRestoreFromJson: resp.addedRestoreFromJson,
      addedStringifyJson: resp.addedStringifyJson,
      addedPrepareForJsonSafe: resp.addedPrepareForJsonSafe,
      addedHasUnknownKeys: resp.addedHasUnknownKeys,
      addedCloneExactShape: resp.addedCloneExactShape,
      addedUnknownKeyErrors: resp.addedUnknownKeyErrors,
      addedUnknownKeysToUndefinedWire: resp.addedUnknownKeysToUndefinedWire,
      addedToBinary: resp.addedToBinary,
      addedFromBinary: resp.addedFromBinary,
      addedFormatTransform: resp.addedFormatTransform,
      addedPureFns: resp.addedPureFns,
      pureFnSites: resp.pureFnSites,
      metrics: resp.metrics,
    };
  }

  // transform runs the compiler-driven per-file transform (OpTransform). In
  // 'go' mode (default) the Go binary scans, rewrites, injects the dedup import
  // block + bindings, and generates the source map, returning finished code +
  // map per file. In 'edits' mode (opts.emitEdits) it instead returns the raw
  // edit list (importBlock + edits + sourceHash) for the FE applier — a lighter
  // wire. Either way the plugin drives HMR off the same added* signals.
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

  // generate runs OpGenerate: the resolver renders the full entry-module set
  // and WRITES it under <outDir>/types/ (write-only-on-change, relativized
  // inter-module imports, stale-file GC), returning the live manifest of
  // module basenames plus the output root it wrote to. The files-mode
  // replacement for the virtual-module load path. The root is SESSION config
  // (the `genDir` spawn option, else the tsconfig genDir, else the resolver's
  // <srcDir>/.mion inference); the resolved absolute path always comes
  // back in `outDir` so a dependency-free host can adopt an inference it
  // cannot compute for itself.
  async generate(): Promise<GenerateResult> {
    const resp = await this.send({op: 'generate'});
    if (resp.error) throw new Error(`generate: ${resp.error}`);
    return {
      modules: resp.generated ?? [],
      outDir: resp.outDir ?? '',
      siteFiles: resp.siteFiles ?? [],
      diagnostics: resp.diagnostics,
      pureFnSites: resp.pureFnSites,
      failOnError: resp.failOnError,
    };
  }

  // enrich scaffolds / reconciles the FriendlyText / MockData mirrors for a named
  // type over the warm connection — the daemon face of the CLI `enrich` verb. It
  // NEVER writes: it returns the computed mirror content (files) for the caller to
  // write under its own HMR-suppression window (the plugin-driven sync path). With
  // `noEmit`, only diagnostics come back (no files).
  // enrich syncs the enrichment mirrors for `files` (empty = whole program) and
  // returns the computed content — the wire carries only the event; the
  // families / locales / output root are the session's spawn-time config.
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

  // reset wipes ALL resolver state (cache, sites, Program, overlay) — see
  // internal/compiler/resolver/resolver.go:Reset for the contract. The caller must
  // call setSources before the next scanFiles.
  async reset(): Promise<void> {
    const resp = await this.send({op: 'reset'});
    if (resp.error) throw new Error(`reset: ${resp.error}`);
  }

  // tsCompile runs the embedded tsgo through bind + typecheck + Emit() on
  // the current source overlay and returns the wall-time in milliseconds.
  // Does NOT walk markers and does NOT render any mion cache
  // modules — purely the TypeScript baseline. Caller must have called
  // setSources first.
  async tsCompile(): Promise<number> {
    const resp = await this.send({op: 'tsCompile'});
    if (resp.error) throw new Error(`tsCompile: ${resp.error}`);
    return resp.tsCompileMs ?? 0;
  }

  // wireStats exposes the connection's cumulative stdio byte + request tally
  // (both directions, UTF-8). The transform-mode benchmark reads it to compare
  // 'go' vs 'edits' wire cost.
  wireStats(): WireStats {
    return this.transport.wireStats();
  }

  close(): void {
    this.transport.close();
  }
}

// buildResolverArgs assembles the resolver child's argv from client options.
// Shared by ResolverClient (which spawns the child itself) and the lint
// session's spawn-shim path (which hands the argv to a pre-spawned launcher
// — see eslint/spawn-shim.ts).
export function buildResolverArgs(cwd: string, tsconfigPath: string, opts: ResolverClientOptions = {}): string[] {
  // The resolver protocol is the `serve` subcommand (args[0]); --sources selects
  // where its startup Program comes from (project | stdin | ops). serverMode wins
  // over inlineSources when both are set, matching the Go dispatch order.
  const args = ['serve', '--cwd', cwd];
  // Forward ONLY an explicitly configured tsconfig. When unset ('' here), the
  // Go side resolves the config exactly as tsc does — searching upward from
  // cwd — so the JS side carries no config logic of its own.
  if (tsconfigPath) {
    args.push('--tsconfig', tsconfigPath);
  }
  if (opts.serverMode) args.push('--sources', 'ops');
  else if (opts.inlineSources) args.push('--sources', 'stdin');
  // cacheDir is NOT a CLI arg — it rides the child's MION_CACHE_DIR env var
  // (set by ResolverClient's spawn) so parallel spawns stay isolated.
  if (opts.emitMode) args.push('--emit-mode', opts.emitMode);
  if (opts.binarySizingBias !== undefined) args.push('--binary-sizing-bias', String(opts.binarySizingBias));
  if (opts.binarySizingItems !== undefined) args.push('--binary-sizing-items', String(opts.binarySizingItems));
  if (opts.binarySizingStringBytes !== undefined) args.push('--binary-sizing-string-bytes', String(opts.binarySizingStringBytes));
  if (opts.binarySizingMaxBytes !== undefined) args.push('--binary-sizing-max-bytes', String(opts.binarySizingMaxBytes));
  if (opts.numberMode) args.push('--number-mode', opts.numberMode);
  if (opts.parseStrategy) args.push('--parse-strategy', opts.parseStrategy);
  if (opts.parallelScan === false) args.push('--no-parallel-scan');
  if (opts.parallelRender === false) args.push('--no-parallel-render');
  if (opts.moduleMode) args.push('--module-mode', opts.moduleMode);
  if (opts.inlineMode) args.push('--inline-mode', opts.inlineMode);
  if (opts.singleThreaded === true) args.push('--single-threaded');
  else if (opts.singleThreaded === false) args.push('--no-single-threaded');
  if (opts.hashLength !== undefined) args.push('--hash-length', String(opts.hashLength));
  if (opts.patternSampleCount !== undefined) args.push('--pattern-sample-count', String(opts.patternSampleCount));
  if (opts.patternSampleRetries !== undefined) args.push('--pattern-sample-retries', String(opts.patternSampleRetries));
  if (opts.markerPackages?.length) args.push('--marker-packages', opts.markerPackages.join(','));
  if (opts.markerPackageCheck === false) args.push('--no-marker-package-check');
  // Always passed: the resolver's format-pattern checks run on a real JS
  // engine, and THIS process is one — its own execPath is the zero-config
  // default for every lane (build + lint). An explicit option pins another.
  args.push('--js-runtime', opts.jsRuntime ?? process.execPath);
  if (opts.pureFnReportWire) args.push('--pure-fn-report-wire');
  if (opts.pureFnReportFile) args.push('--pure-fn-report-file');
  // Session config the wire deliberately does not carry: the output-root
  // override and the OpEnrich family / i18n selection.
  if (opts.genDir) args.push('--gen-dir', opts.genDir);
  if (opts.transformRelative) args.push('--transform-relative');
  if (opts.omitSourcesContent) args.push('--omit-sources-content');
  if (opts.enrichFriendly) args.push('--enrich-friendly');
  if (opts.enrichMock) args.push('--enrich-mock');
  if (opts.enrichI18n) args.push('--enrich-i18n');
  if (opts.enrichLocales && opts.enrichLocales.length > 0) args.push('--enrich-locales', opts.enrichLocales.join(','));
  if (opts.enrichSourceLocale) args.push('--enrich-source-locale', opts.enrichSourceLocale);
  return args;
}

// ResolverClient spawns the mion binary and drives it over its
// JSON-per-line stdio protocol. The child process is kept alive until
// `close()` so the Program + checker pool are amortised across queries.
//
// Three modes (all the `serve` subcommand, differing only in --sources):
//   - default: `serve` (--sources project) against an on-disk tsconfig.
//   - opts.inlineSources: `serve --sources stdin`, source map written as the
//     handshake line before any request.
//   - opts.serverMode: `serve --sources ops`, no startup Program; the caller
//     drives setSources / reset / scanFiles / dump over stdin for the lifetime
//     of the process.
export class ResolverClient extends ResolverClientBase {
  private child!: ChildProcess;
  protected transport!: MessageTransport;
  // True once the OWNER closed this client — an exit after that is expected
  // and must never trigger a respawn.
  private intentionalClose = false;
  // Lifetime respawn budget: enough to absorb the rare transient child loss
  // (host lifecycle races, external kills) without ever churning forever on a
  // host where every spawn dies.
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

  // Releases the host process from the resolver child: the child and its stdio
  // pipes stop counting toward the event loop's keep-alive set, so the host can
  // exit whenever ITS OWN work is done, while the resolver stays fully usable
  // until then. The child is not orphaned — losing the parent closes its stdin,
  // and the Go `serve` loop breaks on EOF and exits.
  //
  // For a BUNDLER host this would be wrong: the pending read of a resolver
  // response can be the build's only live handle, so an unref'd child would let
  // the process exit mid-build. It exists for Bun's RUNTIME loader, which keeps
  // one resolver for the whole process and never gets a buildEnd to close it —
  // see the `detachResolver` plugin option and @mionjs/devtools/runtypes/bun.
  unref(): void {
    this.child?.unref();
    // The stdio pipes are their own libuv handles and keep the loop alive on
    // their own, so the child handle alone is not enough. They are Sockets at
    // runtime; the stream types don't declare unref, hence the cast.
    unrefHandle(this.child?.stdin);
    unrefHandle(this.child?.stdout);
  }

  override close(): void {
    this.intentionalClose = true;
    super.close();
  }

  // spawnChild (re)creates the child process + transport. Runs from the
  // constructor and again on respawn after an unexpected child death; both
  // one-shot lanes rebuild their Program from the same tsconfig / replayed
  // inline-sources handshake, so a fresh child serves requests identically.
  private spawnChild(): void {
    const args = buildResolverArgs(this.cwd, this.tsconfigPath, this.opts);
    // cacheDir (internal override) rides the child's MION_CACHE_DIR env, not a
    // CLI arg, so concurrent spawns with different cache dirs don't collide.
    // A path forces the cache on there, '' forces it off; undefined leaves the
    // env untouched so the binary follows the project's incremental setting.
    const env = this.opts.cacheDir !== undefined ? {...process.env, MION_CACHE_DIR: this.opts.cacheDir} : process.env;
    const child = spawn(this.binary, args, {stdio: ['pipe', 'pipe', 'inherit'], env});
    if (!child.stdin || !child.stdout) {
      throw new Error('failed to spawn mion (no stdio pipes)');
    }
    this.child = child;
    const stdin = child.stdin;
    const stdout = child.stdout;
    // A write into the pipe of a child that just died (exit event not yet
    // delivered) raises a stream error; swallow it — the exit handler below
    // owns the failure semantics and `send` retries the interrupted request.
    stdin.on('error', () => {});
    const transport = new MessageTransport(stdin, stdout, () => {
      stdin.end();
      child.kill();
    });
    this.transport = transport;
    // A spawn failure (missing binary, host limits) surfaces as an 'error'
    // event with NO 'exit' — drain in-flight requests instead of hanging
    // callers until their timeout.
    child.on('error', (error) => transport.markClosed(`${SPAWN_FAILED_PREFIX}: ${error.message}`));
    if (this.opts.inlineSources) {
      // Handshake: write the source map as a single JSON line before any
      // requests can be queued. The Go side blocks on this before building
      // its Program, so request() calls made by the caller right after the
      // constructor naturally land after the handshake on the wire.
      transport.writeUnframed(JSON.stringify({sources: this.opts.inlineSources}) + '\n');
    }
    child.on('exit', () => transport.markClosed(RESOLVER_EXITED));
  }

  // An UNEXPECTED child death (never an intentional close) is retryable: the
  // one-shot lanes are stateless across spawns, so a single respawn + replay
  // turns transient child loss — a host teardown race, an external kill —
  // into a stderr warning instead of a failed build. serverMode is excluded:
  // its accumulated setSources/reset state lives in the child and cannot be
  // replayed from here.
  protected override async send(req: Request): Promise<Response> {
    const attempt = this.transport;
    let resp: Response;
    try {
      resp = await attempt.request(req);
    } catch (error) {
      // 'resolver is closed' — the transport was already down before this
      // request was written (e.g. the death happened between two requests).
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

  // respawnFor replaces the dead child exactly once per loss: concurrent
  // requests that died together all funnel here, and the transport identity
  // check makes every caller after the first reuse the fresh child instead of
  // spawning its own. Synchronous on purpose — no await between the check and
  // the spawn, so there is no window for a duplicate respawn.
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

// ResolverStreamClient drives the same JSON-per-line protocol over caller-
// supplied streams. The lint session's spawn-shim path uses it: the resolver
// child's stdio pipes belong to the pre-spawned launcher process rather than
// a ChildProcess this module owns, so the caller wires close/exit itself.
export class ResolverStreamClient extends ResolverClientBase {
  protected transport: MessageTransport;

  constructor(stdin: Writable, stdout: Readable, onClose: () => void) {
    super();
    this.transport = new MessageTransport(stdin, stdout, onClose);
  }

  // markClosed drains in-flight requests with an error when the underlying
  // process went away (the caller observes the exit, not this class).
  markClosed(reason: string): void {
    this.transport.markClosed(reason);
  }
}

// unrefHandle releases one stdio pipe from the event loop's keep-alive set.
// Node backs a piped stdio stream with a Socket (which has unref); the declared
// Readable/Writable types don't, and a future runtime might not either — so
// this probes for the method instead of assuming it.
function unrefHandle(stream: Readable | Writable | null | undefined): void {
  (stream as {unref?: () => void} | null | undefined)?.unref?.();
}
