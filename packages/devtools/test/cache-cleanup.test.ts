// scripts/ci/cache-cleanup.mjs deletes Actions caches no run can restore any more. These
// pin what it may delete, and above all what it must keep.
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {describe, expect, it} from 'vitest';
// @ts-expect-error plain ESM dev script, no types
import {KEEP_ON_MAIN, main, planDeletions} from '../../../scripts/ci/cache-cleanup.mjs';

const REPO_ROOT = join(__dirname, '../../..');
const MAIN = 'refs/heads/main';
const PR = 'refs/pull/42/merge';
const cache = (key: string, ref: string, day = 1) => ({
  id: `${key}@${ref}`,
  key,
  ref,
  lastAccessedAt: `2026-09-${String(day).padStart(2, '0')}T00:00:00Z`,
});
const keys = (list: {key: string}[]) => list.map((entry) => entry.key).sort();

describe('cache cleanup — a closed pull request', () => {
  const caches = [
    cache('Linux-X64-gocache-v2-go1.26.8-abc', PR),
    cache('mion-go-bins-linux-x64-111', PR),
    cache('mion-lane-green-js-abc', PR),
    cache('mion-lane-green-drizzle.pg-abc', PR),
    cache('mion-go-bins-linux-x64-222', MAIN),
    cache('mion-go-bins-linux-x64-333', 'refs/pull/7/merge'),
  ];

  it('deletes every cache of that pull request, and nothing of main or another pull request', () => {
    expect(keys(planDeletions(caches, {closedRef: PR}))).toEqual([
      'Linux-X64-gocache-v2-go1.26.8-abc',
      'mion-go-bins-linux-x64-111',
    ]);
  });

  // Markers are read by listing from any ref: a merged pull request's markers let main skip lanes.
  it('keeps its lane green markers, item markers included', () => {
    const kept = planDeletions(caches, {closedRef: PR}).map((entry: {key: string}) => entry.key);
    expect(kept.some((key: string) => key.startsWith('mion-lane-green-'))).toBe(false);
  });
});

describe('cache cleanup — the weekly trim of main', () => {
  it('keeps the newest entries of each family by last use, and deletes the rest', () => {
    const bins = Array.from({length: KEEP_ON_MAIN['mion-go-bins-'] + 3}, (_, day) =>
      cache(`mion-go-bins-linux-x64-${day}`, MAIN, day + 1)
    );
    const doomed = planDeletions(bins);
    expect(keys(doomed)).toEqual(['mion-go-bins-linux-x64-0', 'mion-go-bins-linux-x64-1', 'mion-go-bins-linux-x64-2']);
  });

  it('never trims markers, pull request refs, or a family under its limit', () => {
    const caches = [
      ...Array.from({length: 30}, (_, day) => cache(`mion-lane-green-js-${day}`, MAIN, day + 1)),
      ...Array.from({length: 30}, (_, day) => cache(`mion-go-bins-linux-x64-${day}`, PR, day + 1)),
    ];
    expect(planDeletions(caches)).toEqual([]);
  });

  it('runs dry by default when started by hand', () => {
    const workflow = readFileSync(join(REPO_ROOT, '.github/workflows/cache-cleanup.yml'), 'utf8');
    expect(workflow).toMatch(/dry-run:\n\s+description: [^\n]+\n\s+type: boolean\n\s+default: true/);
    expect(workflow).toContain('actions: write');
  });
});

describe('cache cleanup — the command', () => {
  const listed = [cache('Linux-X64-gocache-v2-a', PR), cache('mion-go-bins-linux-x64-1', PR), cache('mion-lane-green-js-a', PR)];
  const fakeGh = (deleteResult: {status: number; stderr: string}) => {
    const calls: string[][] = [];
    const gh = (args: string[]) => {
      calls.push(args);
      if (args[1] === 'list') return {status: 0, stdout: JSON.stringify(listed), stderr: ''};
      return {...deleteResult, stdout: ''};
    };
    return {gh, calls, deletes: () => calls.filter((args) => args[1] === 'delete').map((args) => args[2])};
  };

  it('deletes each doomed cache by id, and never a marker', () => {
    const fake = fakeGh({status: 0, stderr: ''});
    main(['--closed-ref', PR], {gh: fake.gh});
    expect(fake.calls[0]).toEqual(expect.arrayContaining(['cache', 'list', '--ref', PR]));
    expect(fake.deletes()).toEqual([`Linux-X64-gocache-v2-a@${PR}`, `mion-go-bins-linux-x64-1@${PR}`]);
  });

  it('deletes nothing on a dry run', () => {
    const fake = fakeGh({status: 0, stderr: ''});
    main(['--closed-ref', PR, '--dry-run'], {gh: fake.gh});
    expect(fake.deletes()).toEqual([]);
  });

  it('treats a cache another run already deleted as done', () => {
    expect(() => main(['--closed-ref', PR], {gh: fakeGh({status: 1, stderr: 'HTTP 404: Not Found'}).gh})).not.toThrow();
  });

  // A read-only token deletes nothing; the job must not go green anyway.
  it('fails when a delete is refused', () => {
    const fake = fakeGh({status: 1, stderr: 'HTTP 403: Resource not accessible by integration'});
    expect(() => main(['--closed-ref', PR], {gh: fake.gh})).toThrow(/2 cache\(s\) not deleted/);
  });

  it.each([[[]], [['--closed-ref']], [['--closed-ref', '--dry-run']]])('refuses %j', (argv) => {
    expect(() => main(argv, {gh: fakeGh({status: 0, stderr: ''}).gh})).toThrow(/cache-cleanup:/);
  });
});
