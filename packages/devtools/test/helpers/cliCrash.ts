// One spawn path for every test that runs the `mion` binary, so a crash
// in the child is diagnosable from ONE CI run.
//
// The problem it solves: a panicking resolver exits non-zero and its whole Go
// stack arrives as the assertion message. Log pipelines truncate that, and the
// part they drop is the part that matters — the `panic:` / `fatal error:` line
// and the frame that raised it. A real crash (an intermittent `convert-cli`
// panic) went a month undiagnosed for exactly this reason: only the stack's
// tail survived, which names goroutine plumbing and nothing else.
//
// So the output is split. The assertion message stays SHORT and leads with the
// crash header, and the full stdout+stderr goes to a file under logs/ that CI
// keeps as an artifact. GOTRACEBACK=all is set on the child so a crash dumps
// every goroutine, not just the offending one — a deadlock names all parties.
import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {BIN} from './inline.ts';

const ROOT = path.resolve(__dirname, '../../../..');
export const CRASH_DIR = path.resolve(ROOT, 'logs/cli-crashes');

export interface CliResult {
  status: number;
  stdout: string;
  stderr: string;
  // Short, truncation-resistant failure summary: the crash header plus the
  // path to the full dump. Pass it as the assertion message.
  report: string;
}

// A Go crash announces itself on one line and then unwinds. Everything needed
// to place the defect is in that line plus the first frames under it, so that
// is what the short message carries.
const CRASH_MARKER = /^(panic:|fatal error:|runtime error:|SIGSEGV|signal )/m;

export function crashHeader(stderr: string, lines = 12): string {
  const match = CRASH_MARKER.exec(stderr);
  const from = match ? stderr.slice(match.index) : stderr;
  return from.split('\n').slice(0, lines).join('\n').trimEnd();
}

function dumpPath(label: string): string {
  // Deterministic per (label, pid) so a rerun in the same process overwrites
  // rather than littering, and parallel vitest workers never collide.
  const safe = label.replace(/[^A-Za-z0-9._-]+/g, '-').slice(0, 60);
  return path.join(CRASH_DIR, `${safe}-${process.pid}.log`);
}

export function writeCrashDump(
  label: string,
  argv: readonly string[],
  result: {status: number; stdout: string; stderr: string}
): string {
  fs.mkdirSync(CRASH_DIR, {recursive: true});
  const file = dumpPath(label);
  const body = [
    `# mion ${argv.join(' ')}`,
    `# exit status: ${result.status}`,
    '',
    '## stderr',
    result.stderr || '(empty)',
    '',
    '## stdout',
    result.stdout || '(empty)',
    '',
  ].join('\n');
  fs.writeFileSync(file, body);
  return file;
}

// Builds the short report. A crash gets its header; an ordinary non-zero exit
// (a CLI usage error, say) gets the stderr tail, which is where CLIs put the
// reason. Either way the dump file holds everything.
function buildReport(stderr: string, file: string): string {
  const header = CRASH_MARKER.test(stderr) ? crashHeader(stderr) : stderr.split('\n').slice(-12).join('\n').trimEnd();
  return `${header}\n\n[full output: ${path.relative(ROOT, file)}]`;
}

export interface RunCliOptions {
  cwd?: string;
  // Names the dump file; defaults to the subcommand.
  label?: string;
}

/** Spawn the resolver binary and capture a crash in full. **/
export function runCli(args: readonly string[], options: RunCliOptions = {}): CliResult {
  const spawned = spawnSync(BIN, [...args], {
    encoding: 'utf8',
    cwd: options.cwd,
    maxBuffer: 32 * 1024 * 1024,
    // Dump every goroutine on a crash, not just the raising one.
    env: {...process.env, GOTRACEBACK: 'all'},
  });
  const status = spawned.status ?? -1;
  const stdout = spawned.stdout ?? '';
  const stderr = spawned.stderr ?? '';
  if (status === 0) return {status, stdout, stderr, report: ''};

  const file = writeCrashDump(options.label ?? args[0] ?? 'cli', args, {status, stdout, stderr});
  return {status, stdout, stderr, report: buildReport(stderr, file)};
}
