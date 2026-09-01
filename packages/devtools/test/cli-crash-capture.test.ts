// Pins the contract that makes a spawned-resolver panic diagnosable from ONE
// CI run: the SHORT assertion message leads with the crash header (the line
// naming what failed and the frame that raised it), and the full output is
// persisted where CI keeps it. A real crash went a month undiagnosed because
// only the stack's TAIL survived truncation, which names goroutine plumbing
// and nothing about the defect.
import {describe, expect, it} from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {crashHeader, writeCrashDump, CRASH_DIR} from './helpers/cliCrash.ts';

// The exact shape a Go fatal crash takes: header first, then the raising
// frame, then goroutine plumbing that says nothing about the cause.
const GO_CRASH = `fatal error: concurrent map writes

goroutine 724 [running]:
internal/runtime/maps.fatal({0xe0e1e9?, 0xc50c60?})
\t/usr/local/go/src/runtime/panic.go:1181 +0x18
github.com/mionkit/mion/ts-go-runtypes/internal/compiler/batchcompile.Run.func1(...)
\t/repo/ts-go-runtypes/internal/compiler/batchcompile/compile.go:158 +0x36
sync.(*WaitGroup).Go.func1()
\t/usr/local/go/src/sync/waitgroup.go:258 +0x4a
created by sync.(*WaitGroup).Go in goroutine 1
\t/usr/local/go/src/sync/waitgroup.go:238 +0x73
`;

describe('spawned-CLI crash capture', () => {
  it('keeps the crash header and the raising frame, not the goroutine tail', () => {
    const header = crashHeader(GO_CRASH);
    // What failed, and where — the two things truncation used to eat.
    expect(header).toContain('fatal error: concurrent map writes');
    expect(header).toContain('batchcompile.Run.func1');
    expect(header).toContain('compile.go:158');
    // Short enough to survive a log pipeline.
    expect(header.split('\n').length).toBeLessThanOrEqual(12);
  });

  it('starts at the crash marker even when the child logged before dying', () => {
    const noisy = 'compiling 42 files\nwrote dist/api.js\n' + GO_CRASH;
    const header = crashHeader(noisy);
    expect(header.startsWith('fatal error:')).toBe(true);
    expect(header).not.toContain('compiling 42 files');
  });

  it('falls back to the whole output when nothing looks like a crash', () => {
    expect(crashHeader('error: unknown --to target "nonsense"')).toContain('unknown --to target');
  });

  it('persists the full output to a file under logs/', () => {
    const file = writeCrashDump('crash-capture-selftest', ['compile', '--cwd', '/tmp/x'], {
      status: 2,
      stdout: 'partial stdout',
      stderr: GO_CRASH,
    });
    try {
      expect(file.startsWith(CRASH_DIR)).toBe(true);
      const dumped = fs.readFileSync(file, 'utf8');
      // Everything the short message drops still lives here.
      expect(dumped).toContain('exit status: 2');
      expect(dumped).toContain('compile --cwd /tmp/x');
      expect(dumped).toContain('created by sync.(*WaitGroup).Go in goroutine 1');
      expect(dumped).toContain('partial stdout');
    } finally {
      fs.rmSync(file, {force: true});
    }
  });

  it('keeps the dump path out of the assertion message length', () => {
    const file = writeCrashDump('crash-capture-relpath', ['compile'], {status: 2, stdout: '', stderr: GO_CRASH});
    try {
      expect(path.isAbsolute(file)).toBe(true);
      expect(file).toContain(`${path.sep}logs${path.sep}cli-crashes${path.sep}`);
    } finally {
      fs.rmSync(file, {force: true});
    }
  });
});
