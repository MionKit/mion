// Regression for the reported playground bug: value-first schema `getRunType`
// reflected the mion `RunType` wrapper interface (RunType / FormatAnnotation
// / Record + ~40 property signatures) instead of the type the schema models,
// because getRunType lacked the `(schema: RunType<T>)` overload every createX /
// createMockDataFn carries. With the overload, the schema form reflects the modeled
// type and converges with the type-first form.
import {beforeAll, describe, expect, it} from 'vitest';
import {run, setResolver} from '../../../../container/website/app/playground/index.ts';
import {assetsBuilt, loadNodeResolver} from './nodeResolver.ts';

const TYPE_FORM = `type MyType = { id: number; name: string; children: MyType[] };`;
const BUILDER_FORM = `import * as RT from '@mionjs/run-types/builders';
import * as TF from '@mionjs/run-types/formats';
const MyType = RT.circular(RT.object({ id: TF.number(), name: TF.string(), children: RT.array(RT.self()) }));`;

describe('playground / getRunType schema↔type convergence (regression)', () => {
  beforeAll(async () => {
    if (assetsBuilt()) setResolver(await loadNodeResolver());
  });

  it('schema getRunType reflects the modeled type, not the RunType wrapper', async () => {
    if (!assetsBuilt()) return;
    const t = await run('graph', TYPE_FORM);
    const s = await run('graph', BUILDER_FORM, undefined, undefined, 'builder');
    if (t.kind !== 'graph' || s.kind !== 'graph') throw new Error('expected graph result');

    const named = (rts: typeof s.runTypes) =>
      rts
        .map((rt) => rt.typeName)
        .filter(Boolean)
        .sort();
    // Type-first reflects just MyType. Schema must NOT drag in the RunType /
    // FormatAnnotation / Record library interfaces.
    for (const bad of ['RunType', 'FormatAnnotation', 'Record']) {
      expect(named(s.runTypes), `schema graph must not reflect ${bad}`).not.toContain(bad);
    }
    // Same node count as the type-first form (converged).
    expect(s.runTypes.length, 'schema and type-first reflect the same graph').toBe(t.runTypes.length);
  });
});
