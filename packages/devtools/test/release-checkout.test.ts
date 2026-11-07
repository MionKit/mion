// stage-approve compares this checkout's version.json with origin prod's
// (scripts/lib/release-checkout.mjs). Run from a checkout that missed the bump,
// it used to look for the old version and blame the npm login instead.
//
// Lives in this package for the same reason as release-receipt.test.ts: scripts/
// has no vitest project of its own.
import {execFileSync} from 'node:child_process';
import {mkdtempSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {afterEach, describe, expect, it} from 'vitest';
// @ts-expect-error — plain .mjs release helper, no types
import * as releaseCheckout from '../../../scripts/lib/release-checkout.mjs';

const {checkoutGuard, remoteProdVersion, staleCheckoutMessage} = releaseCheckout;

const FIX = 'Check out what prod released: git fetch origin prod && git checkout --detach FETCH_HEAD';

const dirs: string[] = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, {recursive: true, force: true});
});

function git(cwd: string, ...args: string[]) {
  execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', '-c', 'commit.gpgsign=false', ...args], {cwd, stdio: 'pipe'});
}

function release(repo: string, version: string) {
  writeFileSync(join(repo, 'version.json'), JSON.stringify({version}));
  git(repo, 'add', 'version.json');
  git(repo, 'commit', '--quiet', '-m', `release ${version}`);
}

/** A remote whose prod branch released `version`, and a clone of it. */
function cloneWithProdAt(version: string): {remote: string; clone: string} {
  const remote = mkdtempSync(join(tmpdir(), 'release-remote-'));
  const clone = mkdtempSync(join(tmpdir(), 'release-clone-'));
  dirs.push(remote, clone);
  git(remote, 'init', '--quiet', '--initial-branch=prod');
  release(remote, version);
  git(clone, 'init', '--quiet');
  git(clone, 'remote', 'add', 'origin', remote);
  return {remote, clone};
}

function unreachable(clone: string): string {
  git(clone, 'remote', 'set-url', 'origin', join(clone, 'missing'));
  return clone;
}

describe('remoteProdVersion', () => {
  it('reads version.json from the remote prod branch', () => {
    expect(remoteProdVersion(cloneWithProdAt('0.13.2').clone)).toEqual({version: '0.13.2'});
  });

  // A single-branch clone fetches prod into FETCH_HEAD but leaves origin/prod where it was.
  it('reads the fetched prod, not an old origin/prod, in a clone that only tracks main', () => {
    const {remote, clone} = cloneWithProdAt('0.13.0');
    git(clone, 'fetch', '--quiet', 'origin', 'prod:refs/remotes/origin/prod');
    git(clone, 'config', 'remote.origin.fetch', '+refs/heads/main:refs/remotes/origin/main');
    release(remote, '0.13.2');
    expect(remoteProdVersion(clone)).toEqual({version: '0.13.2'});
  });

  it('reports an error when the remote cannot be fetched', () => {
    expect(remoteProdVersion(unreachable(cloneWithProdAt('0.13.2').clone)).error).toMatch(/git fetch origin prod failed/);
  });
});

describe('staleCheckoutMessage', () => {
  it('passes a checkout at the released version', () => {
    expect(staleCheckoutMessage('0.13.2', '0.13.2')).toBeNull();
  });

  it('names both versions and the fix for a checkout at another version', () => {
    expect(staleCheckoutMessage('0.13.0', '0.13.2')).toBe(`this checkout is at 0.13.0 but prod released 0.13.2. ${FIX}`);
  });
});

describe('checkoutGuard', () => {
  it('lets a checkout at prod go on', () => {
    expect(checkoutGuard('0.13.2', cloneWithProdAt('0.13.2').clone)).toBeNull();
  });

  it('stops a checkout that missed the bump', () => {
    expect(checkoutGuard('0.13.0', cloneWithProdAt('0.13.2').clone)).toEqual({
      die: `this checkout is at 0.13.0 but prod released 0.13.2. ${FIX}`,
    });
  });

  it('only warns when prod cannot be read, so an offline approval still runs', () => {
    expect(checkoutGuard('0.13.0', unreachable(cloneWithProdAt('0.13.2').clone)).warn).toMatch(
      /^could not check this checkout against prod \(git fetch origin prod failed/
    );
  });
});
