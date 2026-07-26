// The e2e receipt (scripts/release/receipt.mjs) is what turns "e2e passed" from a
// convention into a precondition: publish-tarballs.mjs refuses bytes no e2e signed
// off. Its whole value is in the REJECTIONS, so each way the tarballs can drift
// away from the receipt gets a case — a verifier that only ever says yes would
// pass a smoke test and gate nothing.
//
// Lives in this package because scripts/ has no vitest project of its own; the
// same reason repo-contracts.test.ts guards the rtx CLI and the env registry.
import {createHash} from 'node:crypto';
import {mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {afterEach, describe, expect, it} from 'vitest';
// @ts-expect-error — plain .mjs release script, no types
import {digestTarballs, RECEIPT_NAME, receiptOptOut, verifyReceipt, writeReceipt} from '../../../scripts/release/receipt.mjs';

const VERSION = '9.9.9';
const dirs: string[] = [];

function makeTarballs(
  files: Record<string, string> = {'ts-runtypes-core-9.9.9.tgz': 'core-bytes', 'ts-runtypes-bin-9.9.9.tgz': 'bin-bytes'}
): string {
  const dir = mkdtempSync(join(tmpdir(), 'rt-receipt-'));
  dirs.push(dir);
  for (const [name, body] of Object.entries(files)) writeFileSync(join(dir, name), body);
  return dir;
}

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, {recursive: true, force: true});
});

describe('e2e receipt — writing', () => {
  it('records the version, what ran, and a digest per tarball', () => {
    const dir = makeTarballs();
    const receipt = writeReceipt(dir, {
      version: VERSION,
      backend: 'container',
      covered: {matrix: true, hostSmoke: true},
      at: '2026-07-26T00:00:00.000Z',
    });
    expect(receipt.version).toBe(VERSION);
    expect(receipt.backend).toBe('container');
    expect(receipt.covered).toEqual({matrix: true, hostSmoke: true});
    expect(Object.keys(receipt.tarballs).sort()).toEqual(['ts-runtypes-bin-9.9.9.tgz', 'ts-runtypes-core-9.9.9.tgz']);
    expect(receipt.tarballs['ts-runtypes-core-9.9.9.tgz']).toBe(createHash('sha256').update('core-bytes').digest('hex'));
  });

  it("writes a dotfile, so the publishing verbs' *.tgz scans never see it as a package", () => {
    const dir = makeTarballs();
    writeReceipt(dir, {version: VERSION, backend: 'container', covered: {}});
    expect(RECEIPT_NAME.startsWith('.')).toBe(true);
    expect(Object.keys(digestTarballs(dir))).not.toContain(RECEIPT_NAME);
  });
});

describe('e2e receipt — verifying', () => {
  const sign = (dir: string, version = VERSION): void =>
    void writeReceipt(dir, {version, backend: 'container', covered: {matrix: true, hostSmoke: true}});

  it('accepts the bytes it signed', () => {
    const dir = makeTarballs();
    sign(dir);
    expect(verifyReceipt(dir, VERSION).ok).toBe(true);
  });

  it('rejects when no e2e has run', () => {
    const verdict = verifyReceipt(makeTarballs(), VERSION);
    expect(verdict.ok).toBe(false);
    expect(verdict.reason).toContain('has not run');
  });

  it('rejects a receipt from another version', () => {
    const dir = makeTarballs();
    sign(dir, '1.2.3');
    const verdict = verifyReceipt(dir, VERSION);
    expect(verdict.ok).toBe(false);
    expect(verdict.reason).toContain('covers version 1.2.3');
  });

  // The reason digests exist at all: passing the gate and then repacking is the
  // exact footgun a version-only receipt would wave through.
  it('rejects a repack after the run', () => {
    const dir = makeTarballs();
    sign(dir);
    writeFileSync(join(dir, 'ts-runtypes-core-9.9.9.tgz'), 'core-bytes-REBUILT');
    const verdict = verifyReceipt(dir, VERSION);
    expect(verdict.ok).toBe(false);
    expect(verdict.reason).toContain('repacked');
  });

  it('rejects a tarball added after the run', () => {
    const dir = makeTarballs();
    sign(dir);
    writeFileSync(join(dir, 'ts-runtypes-devtools-9.9.9.tgz'), 'late-arrival');
    const verdict = verifyReceipt(dir, VERSION);
    expect(verdict.ok).toBe(false);
    expect(verdict.reason).toContain('not covered');
  });

  it('rejects a tarball missing since the run', () => {
    const dir = makeTarballs();
    sign(dir);
    unlinkSync(join(dir, 'ts-runtypes-bin-9.9.9.tgz'));
    const verdict = verifyReceipt(dir, VERSION);
    expect(verdict.ok).toBe(false);
    expect(verdict.reason).toContain('gone since the run');
  });

  it('rejects an unreadable receipt instead of treating it as absent', () => {
    const dir = makeTarballs();
    sign(dir);
    writeFileSync(join(dir, RECEIPT_NAME), '{not json');
    const verdict = verifyReceipt(dir, VERSION);
    expect(verdict.ok).toBe(false);
    expect(verdict.reason).toContain('not readable JSON');
  });

  it('rejects an empty tarballs dir even with a receipt', () => {
    const dir = makeTarballs({});
    sign(dir);
    expect(verifyReceipt(dir, VERSION).ok).toBe(false);
  });
});

describe('e2e receipt — the escape hatch', () => {
  it('opens on the flag or the env var, and is closed by default', () => {
    expect(receiptOptOut([])).toBe(false);
    expect(receiptOptOut(['--no-receipt'])).toBe(true);
    const previous = process.env['RT_ALLOW_UNVERIFIED_PUBLISH'];
    process.env['RT_ALLOW_UNVERIFIED_PUBLISH'] = '1';
    try {
      expect(receiptOptOut([])).toBe(true);
    } finally {
      if (previous === undefined) delete process.env['RT_ALLOW_UNVERIFIED_PUBLISH'];
      else process.env['RT_ALLOW_UNVERIFIED_PUBLISH'] = previous;
    }
  });
});

// The gate is only real if the publishing script actually consults it. Read the
// source rather than run it: publish-tarballs.mjs talks to npm.
describe('publish-tarballs wires the gate in', () => {
  const source = readFileSync(new URL('../../../scripts/release/publish-tarballs.mjs', import.meta.url), 'utf8');

  it('verifies before publishing, and only for the public registry', () => {
    expect(source).toContain('verifyReceipt');
    expect(source).toContain('!registry && !receiptOptOut(args)');
  });

  it('exits non-zero rather than warning past a failed check', () => {
    const block = source.slice(source.indexOf('if (!registry && !receiptOptOut(args))'));
    expect(block.slice(0, block.indexOf('\n}'))).toContain('process.exit(1)');
  });
});
