// Lives here, like release-receipt.test.ts, because scripts/ has no vitest project.
import {describe, expect, it} from 'vitest';
// @ts-expect-error untyped .mjs
import {websiteDeployDispatchArgs} from '../../../scripts/lib/website-deploy.mjs';

const dispatchArgs = websiteDeployDispatchArgs as (version: string, options?: {reuseBenchmarks?: boolean}) => string[];

describe('website deploy dispatch args', () => {
  it('dispatches website-deploy.yml on prod with the version, re-running the benchmarks by default', () => {
    expect(dispatchArgs('1.2.3')).toEqual(['workflow', 'run', 'website-deploy.yml', '--ref', 'prod', '-f', 'version=1.2.3']);
    expect(dispatchArgs('1.2.3', {reuseBenchmarks: false})).not.toContain('reuse_benchmarks=true');
  });

  it('--reuse-benchmarks adds reuse_benchmarks=true', () => {
    expect(dispatchArgs('1.2.3', {reuseBenchmarks: true})).toEqual([
      'workflow',
      'run',
      'website-deploy.yml',
      '--ref',
      'prod',
      '-f',
      'version=1.2.3',
      '-f',
      'reuse_benchmarks=true',
    ]);
  });
});
