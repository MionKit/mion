// Shared shapes of the session ↔ worker sync bridge. Kept in a dependency-
// free module so both halves (session.ts on the rule thread, lint-worker.ts
// in the worker) import the same contract.

import type {MessagePort} from 'node:worker_threads';
import type {Diagnostic} from '../protocol.ts';

// WAKE_INDEX is the Int32Array slot the worker stores the completed request's
// seq into (then Atomics.notify) — the rule thread Atomics.waits on it.
export const WAKE_INDEX = 0;

// LintSessionOptions carries the plugin's knobs, read from lint
// `settings.runtypes`. The working directory is NOT among them: it is
// process.cwd(), the directory the linter itself runs in, exactly like any other
// linter. The tsconfig, like on the bundler plugins, IS configurable so a
// source-resolved monorepo lints against its real resolution options
// (customConditions / paths), and so is the binary.
export interface LintSessionOptions {
  // Per-file wait budget in milliseconds before the session reports the
  // engine unavailable. Defaults to 60s — the first file pays the child
  // spawn + Program build.
  timeoutMs?: number;
  // Project tsconfig (relative to process.cwd(), or absolute) the resolver reads
  // for its resolution-affecting options — customConditions / paths / baseUrl —
  // so lint-time resolution matches the build. Defaults to 'tsconfig.json' at
  // the point of use (see lint-worker.ts), mirroring the bundler plugins.
  tsconfig?: string;
  // Resolver binary to run. Unset (the normal case) resolves the host-platform
  // binary through ts-runtypes-bin's getExePath(), which itself honours MION_BIN —
  // so precedence is this setting > MION_BIN > the installed platform package,
  // matching the bundler lane where an explicit `binary` option beats the
  // launcher. A configured path that is not there fails loudly rather than
  // falling back, since a different binary would key caches on another version.
  binary?: string;
  // Which packages may declare the marker types, mirroring the tsconfig
  // `markers` key. The resolver reads the tsconfig itself, so this exists for
  // ONE reason: the cheap text pre-filter that decides whether a file is worth
  // a resolver round trip matches on import specifiers, and a project whose
  // markers come from its own package would otherwise have those files skipped
  // before the resolver ever sees them. Set it to whatever the tsconfig
  // `markers` block says.
  markers?: {packages?: string[]; checkPackage?: boolean};
}

// The keys a host may set under `settings.runtypes`. Anything else there is
// dropped by sessionOptions() (eslint/index.ts), which warns once per process so
// an unsupported key is not a silent no-op — this list is what a lint config can
// actually expect to take effect. The `satisfies` guard keeps it exhaustive
// against LintSessionOptions the same way PLUGIN_OPTION_KEYS does for the
// bundler options (see src/plugin-option-keys.ts).
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
  // Project tsconfig path forwarded to the worker's resolver connection. Read
  // once, when the long-lived connection is opened on the first request (the
  // connection is fixed for the run, so later requests' values are ignored).
  tsconfig?: string;
  // Resolver binary, same one-shot rule as tsconfig: the first request's value
  // opens the connection and every later one rides it.
  binary?: string;
  // Which packages may declare the marker types, mirroring the tsconfig
  // `markers` key. The resolver reads the tsconfig itself, so this exists for
  // ONE reason: the cheap text pre-filter that decides whether a file is worth
  // a resolver round trip matches on import specifiers, and a project whose
  // markers come from its own package would otherwise have those files skipped
  // before the resolver ever sees them. Set it to whatever the tsconfig
  // `markers` block says.
  markers?: {packages?: string[]; checkPackage?: boolean};
}

export interface LintWorkerResponse {
  seq: number;
  diagnostics?: Diagnostic[];
  error?: string;
  // fatal marks a CONNECTION-level failure (binary missing, child died) as
  // opposed to a per-file op error — the session goes sticky-dead on fatal
  // so later files answer instantly instead of re-paying the failure.
  fatal?: boolean;
}
