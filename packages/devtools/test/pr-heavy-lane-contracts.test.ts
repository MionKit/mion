// Contract tests for the label-gated PR lanes in .github/workflows/pr-heavy.yml.
//
// Each lane is opted into by a label, and the label list lives in two places
// inside the workflow: the header that tells a maintainer which label does what,
// and the `if:` of each job. A lane is easy to half-add: documented in the header
// and gated on a differently spelled label, or gated and never documented. These
// pin the two to each other, and pin the pre-publish e2e lane to the release
// gate's shape so the PR proves the same thing the release does.
import {describe, it, expect} from 'vitest';
import {globSync, readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const read = (rel: string): string => readFileSync(path.join(REPO_ROOT, rel), 'utf8');

describe('pr-heavy label lanes', () => {
  const workflow = read('.github/workflows/pr-heavy.yml');
  const gated = [...workflow.matchAll(/contains\(fromJSON\(needs\.lanes\.outputs\.labels\), '([a-z0-9-]+)'\)/g)].map(
    (match) => match[1]
  );
  const header = workflow.slice(0, workflow.indexOf('\non:'));
  const documented = [...header.matchAll(/^#\s{3}([a-z0-9-]+)\s{2,}\S/gm)].map((match) => match[1]);

  it('gates on the three labels', () => {
    expect([...new Set(gated)].sort()).toEqual(['bench', 'pre-publish-e2e', 'website']);
  });

  it('documents every label it gates on, and gates on every label it documents', () => {
    expect(documented.sort()).toEqual([...new Set(gated)].sort());
  });

  it('runs on the label being added, not only on a new commit', () => {
    expect(workflow).toMatch(/types: \[opened, synchronize, reopened, labeled\]/);
  });
});

describe('the pre-publish-e2e lane mirrors the release gate', () => {
  const workflow = read('.github/workflows/pr-heavy.yml');
  const gate = read('.github/workflows/release-gate.yml');
  const lane = workflow.slice(workflow.indexOf('  pre-publish-build:'));

  it('packs a host-only set and runs the same front door as the gate', () => {
    expect(lane).toContain('run: pnpm miondevx release binaries --host-only');
    expect(lane).toContain('run: pnpm miondevx release pack');
    expect(lane).toMatch(/run: >-\n\s+pnpm miondevx release e2e --backend container\n/);
    expect(gate).toContain('run: pnpm miondevx release e2e --backend ${{ matrix.backend }}');
  });

  it('hands the packed tarballs from the build job to the e2e job under one artifact name', () => {
    const uploaded = /upload-artifact@v\d+\n\s+with:\n\s+name: ([\w-]+)/.exec(lane)?.[1];
    const downloaded = /download-artifact@v\d+\n\s+with:\n\s+name: ([\w-]+)/.exec(lane)?.[1];
    expect(uploaded).toBe('pre-publish-e2e-tarballs');
    expect(downloaded).toBe(uploaded);
    // `lanes` gives the e2e job its marker hash; pre-publish-build carries the tarballs.
    expect(lane).toContain('needs: [lanes, e2e-wait, pre-publish-build]');
  });

  it('pulls the same prebuilt e2e image the gate pulls, with the job token, no PAT', () => {
    for (const source of [lane, gate]) {
      expect(source).toContain('remote: ghcr.io/mionkit/tsrt-e2e:latest');
      expect(source).toContain('local-tag: tsrt-e2e:dev');
      expect(source).not.toContain('GHCR_PAT');
    }
  });
});

// The image pull signs in with the job token, which reads a package only when the job grants packages:read.
describe('every job that pulls a prebuilt image', () => {
  it('grants its token packages:read', () => {
    let checked = 0;
    for (const file of globSync('.github/workflows/*.yml', {cwd: REPO_ROOT})) {
      for (const job of read(file).split(/\n  (?=[\w-]+:\n)/)) {
        if (!job.includes('uses: ./.github/actions/pull-shared-image')) continue;
        checked += 1;
        expect(job, `${file}: ${job.slice(0, job.indexOf(':'))}`).toMatch(
          /\n {4}permissions:\n(?: {6}.*\n)*? {6}packages: read\n/
        );
      }
    }
    // ci smoke, drizzle-e2e, post-publish e2e, bench report, pr-heavy website + bench + e2e,
    // release-gate e2e + benchmarks + website-build, website-deploy.
    expect(checked).toBe(11);
  });
});
