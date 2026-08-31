import {beforeAll, describe, expect, it} from 'vitest';
import {mock, run, setResolver} from '../../../../container/website/app/playground/index.ts';
import {assetsBuilt, loadNodeResolver} from './nodeResolver.ts';

// Type-format support: a user-written `import ... from '@mionjs/run-types/formats'`
// must resolve AND drive format-aware validate / mock. Each case defines MyType
// with one format-typed field and checks (a) the resolver lifts a
// FormatAnnotation onto the graph, (b) validate is format-aware (rejects a
// non-conforming value), and (c) the mock generates a conforming value. Needs the
// built WASM assets (skips without them), like engine.test.ts.

const ready = assetsBuilt();
const describeIf = ready ? describe : describe.skip;

// The graph is a flat node list (children/child are id refs, kind -1). Each test
// type carries exactly one format-typed field, so the format node is the single
// node with a formatAnnotation; return its name.
async function annotationName(userCode: string, mode: 'type' | 'builder' = 'type'): Promise<unknown> {
  const res = await run('graph', userCode, undefined, undefined, mode);
  if (res.kind !== 'graph') throw new Error('expected graph');
  const node = (res.runTypes as Array<Record<string, unknown>>).find((n) => n.formatAnnotation);
  return (node?.formatAnnotation as {name?: unknown} | undefined)?.name;
}

describeIf('playground type formats (WASM, live execution)', () => {
  beforeAll(async () => {
    setResolver(await loadNodeResolver());
  });

  it('email: resolves the import, lifts a format annotation, validate + mock are format-aware', async () => {
    const code = `import type { Email } from '@mionjs/run-types/formats';\ntype MyType = { email: Email };`;
    expect(await annotationName(code)).toBe('email');

    const bad = await run('validate', code, {email: 'not-an-email'});
    const good = await run('validate', code, {email: 'john@example.com'});
    if (bad.kind !== 'predicate' || good.kind !== 'predicate') throw new Error('expected predicate');
    expect(bad.value).toBe(false);
    expect(good.value).toBe(true);

    const m = await mock(code);
    expect(String((m.value as {email: string}).email)).toMatch(/^[^\s@]+@[^\s@]+\.[^\s@]+$/);
  });

  it('namespace import (TF.Email type) resolves the same as a named import — the preset form', async () => {
    const code = `import * as TF from '@mionjs/run-types/formats';\ntype MyType = { email: TF.Email };`;
    expect(await annotationName(code)).toBe('email');

    const bad = await run('validate', code, {email: 'not-an-email'});
    const good = await run('validate', code, {email: 'john@example.com'});
    if (bad.kind !== 'predicate' || good.kind !== 'predicate') throw new Error('expected predicate');
    expect(bad.value).toBe(false);
    expect(good.value).toBe(true);

    const m = await mock(code);
    expect(String((m.value as {email: string}).email)).toMatch(/^[^\s@]+@[^\s@]+\.[^\s@]+$/);
  });

  it('uuidv4: format annotation + format-aware validate/mock', async () => {
    const code = `import type { UUIDv4 } from '@mionjs/run-types/formats';\ntype MyType = { id: UUIDv4 };`;
    expect(await annotationName(code)).toBe('uuid');

    const bad = await run('validate', code, {id: 'not-a-uuid'});
    if (bad.kind !== 'predicate') throw new Error('expected predicate');
    expect(bad.value).toBe(false);

    const m = await mock(code);
    expect(String((m.value as {id: string}).id)).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-/i);
  });

  it('positive number format: format annotation + format-aware validate/mock', async () => {
    const code = `import type { Positive } from '@mionjs/run-types/formats';\ntype MyType = { amount: Positive };`;
    expect(await annotationName(code)).toBe('numberFormat');

    const bad = await run('validate', code, {amount: -5});
    const good = await run('validate', code, {amount: 5});
    if (bad.kind !== 'predicate' || good.kind !== 'predicate') throw new Error('expected predicate');
    expect(bad.value).toBe(false);
    expect(good.value).toBe(true);

    const m = await mock(code);
    expect((m.value as {amount: number}).amount).toBeGreaterThanOrEqual(0);
  });

  it('runs a format in the value-first schema form (TF.email)', async () => {
    const schema = `import * as RT from '@mionjs/run-types/builders';\nimport * as TF from '@mionjs/run-types/formats';\nconst MyType = RT.object({ email: TF.email() });`;
    expect(await annotationName(schema, 'builder')).toBe('email');
    const bad = await run('validate', schema, {email: 'nope'}, undefined, 'builder');
    if (bad.kind !== 'predicate') throw new Error('expected predicate');
    expect(bad.value).toBe(false);
  });
});
