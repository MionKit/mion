// Pins the apiids lane's TS-validity gate and the soak draw that needed it (release gate run 39249346902).
import {describe, expect, it} from 'vitest';
import {withSeededRandom, mixSeed} from '../core/seededRng.ts';
import {genType, renderGenerated, type GeneratedType} from '../core/typeGen.ts';
import {API_IDS_GEN_OPTIONS, recordIterationFailure, type ApiIdsFuzzReport} from './apiIdsFuzz.ts';

function optionalUnderStringIndex(index: GeneratedType['root']): GeneratedType {
  return {
    decls: [],
    root: {
      kind: 'object',
      props: [{name: 'p0', optional: true, readonly: false, method: false, shape: {kind: 'literal', value: false}}],
      index,
      indexKey: ['string'],
    },
  };
}

const emptyReport = (): ApiIdsFuzzReport => ({iterations: 1, failures: [], skippedInvalidTypes: 0});

describe('apiids TS-validity gate', () => {
  it('counts a failure on invalid generated TypeScript instead of reporting it', () => {
    const report = emptyReport();
    recordIterationFailure(report, 0, 1, optionalUnderStringIndex({kind: 'literal', value: false}), new Error('TS2411'));
    expect(report).toEqual({iterations: 1, failures: [], skippedInvalidTypes: 1});
  });

  it('reports a failure on valid generated TypeScript', () => {
    const report = emptyReport();
    const index: GeneratedType['root'] = {kind: 'union', members: [{kind: 'literal', value: false}, {kind: 'undefined'}]};
    recordIterationFailure(report, 3, 7, optionalUnderStringIndex(index), new Error('server compile exited 1'));
    expect(report.skippedInvalidTypes).toBe(0);
    expect(report.failures).toHaveLength(1);
    expect(report.failures[0]).toMatch(/^iteration 3 \(seed 7, .*\): server compile exited 1$/);
  });

  it('replays the soak draw without the optional member', () => {
    const gen = withSeededRandom(mixSeed(594641238, 'apiids', 16), () => genType(API_IDS_GEN_OPTIONS));
    expect(renderGenerated(gen).rootExpr).toBe('{readonly p0: false; p1: false; p2: false; [k: string | symbol]: false}');
  });
});
