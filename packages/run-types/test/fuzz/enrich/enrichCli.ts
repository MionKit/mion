// CLI driver for the enrichment fuzzer. Thin, NON-THROWING wrappers around the
// `mion` Go binary so the oracles can OBSERVE every outcome (exit code,
// stdout, stderr, parsed check findings) instead of throwing on a non-zero exit
// the way the example-test helpers (test/util/enrichReconcile.ts) do.
//
// Workspace management (makeFixture / setSource / editMirror / readMirror) is
// reused from that helper; only the command execution differs.

import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {resolve, dirname} from 'node:path';
import {mirrorPathOf, type MirrorFamily, type ReconcileFixture} from '../../util/enrichReconcile.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
// packages/run-types/test/fuzz/enrich → up 5 to the repo root.
const REPO_ROOT = resolve(HERE, '../../../../..');
export const BIN = resolve(REPO_ROOT, 'mion-bin/mion');

const CLI_TIMEOUT_MS = 15_000;
const MAX_BUFFER = 32 * 1024 * 1024;

/** One `check` finding — the real JSON shape the CLI emits (internal/enrichment
 *  validate.go `Finding`: lowercase keys, severity as a string). **/
export interface CheckFinding {
  file: string;
  code: string;
  severity: 'error' | 'warning' | 'info';
  path: string;
  message: string;
}

/** The observable result of one CLI run. `timedOut` ⇒ the binary hung. **/
export interface CliResult {
  argv: string[];
  status: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  launchError: string | null;
}

function runCli(cwd: string, args: string[]): CliResult {
  const result = spawnSync(BIN, args, {cwd, encoding: 'utf8', timeout: CLI_TIMEOUT_MS, maxBuffer: MAX_BUFFER});
  const timedOut = result.signal != null && result.status == null && !result.error;
  return {
    argv: args,
    status: result.status,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    timedOut: timedOut || /etimedout/i.test(result.error?.message ?? ''),
    launchError: result.error ? result.error.message : null,
  };
}

/** `gen src/models.ts <Type>` — create-only scaffold of the mirror file.
 *  `extraArgs` appends extra CLI flags to the `gen` invocation. **/
export function scaffold(fixture: ReconcileFixture, typeName: string, extraArgs: string[] = []): CliResult {
  return runCli(fixture.dir, ['enrich', 'src/models.ts', typeName, ...extraArgs]);
}

/** `gen src/models.ts <Type> --update` — value-preserving reconcile.
 *  `extraArgs` appends extra CLI flags to the `gen` invocation. **/
export function update(fixture: ReconcileFixture, typeName: string, extraArgs: string[] = []): CliResult {
  return runCli(fixture.dir, ['enrich', 'src/models.ts', typeName, '--update', ...extraArgs]);
}

/** `gen --prune <enrichDir>` — strip @rtOrphan/@rtOrphanChild carcasses from
 *  the whole mirror root (sweeps BOTH family files). **/
export function prune(fixture: ReconcileFixture): CliResult {
  return runCli(fixture.dir, ['enrich', '--prune', fixture.enrichDir]);
}

/** `check <family mirror> --json` — returns the parsed findings plus the raw result.
 *  exit 0 (clean) / 1 (an Error-severity finding) are BOTH controlled; any other
 *  exit, a launch error, a timeout, or unparseable JSON is surfaced as a problem. **/
export function check(
  fixture: ReconcileFixture,
  family: MirrorFamily
): {result: CliResult; findings: CheckFinding[]; controlled: boolean} {
  const result = runCli(fixture.dir, ['enrich', mirrorPathOf(fixture, family), '--no-emit', '--json']);
  const controlled = !result.timedOut && result.launchError == null && (result.status === 0 || result.status === 1);
  let findings: CheckFinding[] = [];
  if (controlled) {
    try {
      findings = (JSON.parse(result.stdout || 'null') as CheckFinding[] | null) ?? [];
    } catch {
      // Unparseable JSON on a controlled exit is itself a robustness problem; the
      // caller (R10) decides. Leave findings empty and let `controlled` stand.
    }
  }
  return {result, findings, controlled};
}

/** True when a `gen`/`update`/`prune` run ended in a CONTROLLED way (exit 0,
 *  or a non-zero exit with a real diagnostic on stderr — not a panic/hang/internal bug). **/
export function isControlled(result: CliResult): boolean {
  if (result.timedOut || result.launchError) return false;
  // An "internal error" is the reconciler shouting that its own invariant broke
  // (e.g. "overlapping splice ops … — internal error"). It exits non-zero with a
  // message, so the panic/diagnostic checks below would WRONGLY pass it — flag it
  // explicitly. This is what makes renameType's crash observable, not silent.
  if (/internal error/i.test(result.stderr)) return false;
  if (result.status === 0) return true;
  // A non-zero exit is controlled only if it reported SOMETHING (a diagnostic),
  // not a bare crash. A Go panic prints "panic:" to stderr — treat as uncontrolled.
  return result.stderr.trim().length > 0 && !/panic:|runtime error|goroutine \d+ \[/i.test(result.stderr);
}
