// Shapes shared by session.ts (rule thread) and lint-worker.ts; dependency-free so both halves import one contract.

import type {MessagePort} from 'node:worker_threads';
import type {Diagnostic} from '../core/protocol.ts';

// WAKE_INDEX is the slot the worker stores the completed seq into and notifies; the rule thread Atomics.waits on it.
export const WAKE_INDEX = 0;

// LintSessionOptions carries the `settings.runtypes` knobs. No working directory among them: the session runs
// in process.cwd(), the directory the linter itself runs in, like any other linter.
export interface LintSessionOptions {
  // Per-file wait budget before the engine is reported unavailable; the 60s default covers the first file's
  // child spawn + Program build.
  timeoutMs?: number;
  // Project tsconfig (relative to process.cwd(), or absolute) the resolver reads for its resolution-affecting
  // options (customConditions / paths / baseUrl), so lint-time resolution matches the build. Unset, the Go
  // side searches upward from cwd exactly as tsc does.
  tsconfig?: string;
  // Resolver binary to run. Unset (the normal case) resolves through @mionjs/bin-compiler's getExePath(), which
  // honours MION_BIN, so precedence is this setting > MION_BIN > the installed platform package. A configured
  // path that is not there fails loudly rather than falling back: another binary keys caches on another version.
  binary?: string;
  // Which packages may declare the marker types, mirroring the tsconfig `markers` key. Here for ONE reason: the
  // text pre-filter matches import specifiers, so a project whose markers come from its own package would have
  // those files skipped before the resolver saw them. Set it to whatever the tsconfig `markers` block says.
  markers?: {packages?: string[]; checkPackage?: boolean};
}

// The keys a host may set under `settings.runtypes`; sessionOptions() (index.ts) drops anything else and warns
// once per process, so an unsupported key is never a silent no-op. `satisfies` keeps this exhaustive against
// LintSessionOptions, like PLUGIN_OPTION_KEYS in core/plugin-option-keys.ts does for the bundler options.
const LINT_SETTING_KEY_TABLE = {timeoutMs: true, tsconfig: true, binary: true, markers: true} satisfies Record<
  keyof LintSessionOptions,
  true
>;

export const LINT_SETTING_KEYS = Object.keys(LINT_SETTING_KEY_TABLE) as (keyof LintSessionOptions)[];

export interface LintWorkerData {
  port: MessagePort;
  signal: Int32Array;
}

export interface LintWorkerRequest {
  seq: number;
  file: string;
  text: string;
  // Project tsconfig for the worker's resolver connection. Read once, on the first request that opens the
  // long-lived connection; the connection is fixed for the run, so later requests' values are ignored.
  tsconfig?: string;
  // Resolver binary, same one-shot rule as tsconfig: the first request's value opens the connection.
  binary?: string;
}

// The exact field set roundTrip() posts; session.test.ts asserts the posted message against it.
// markers never rides here: marker packages are resolver spawn config read from the tsconfig.
const LINT_WORKER_REQUEST_KEY_TABLE = {seq: true, file: true, text: true, tsconfig: true, binary: true} satisfies Record<
  keyof LintWorkerRequest,
  true
>;

export const LINT_WORKER_REQUEST_KEYS = Object.keys(LINT_WORKER_REQUEST_KEY_TABLE) as (keyof LintWorkerRequest)[];

export interface LintWorkerResponse {
  seq: number;
  diagnostics?: Diagnostic[];
  error?: string;
  // fatal marks a CONNECTION-level failure (binary missing, child died), not a per-file op error: the session
  // goes sticky-dead on it so later files answer instantly instead of re-paying the failure.
  fatal?: boolean;
}
