import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {beforeAll, describe, expect, it} from 'vitest';
import {run, setResolver, transformedSource} from '../../../../container/website/app/playground/index.ts';
import {buildRuntypesOverlay} from '../../../../scripts/website/playground-overlay.mjs';
import {assetsBuilt, loadNodeResolver} from './nodeResolver.ts';

// The JSON Schema authoring form in the playground: the overlay's exports-map
// contract check plus the live WASM lane. The dedicated preset was removed
// pending the selector-mode rework (docs/todos/playground-json-schema-selector-mode.md);
// the ENGINE capability stays and is what these tests pin.

const REPO = new URL('../../../../', import.meta.url);
const RUNTYPES_PKG = fileURLToPath(new URL('packages/ts-runtypes/package.json', REPO));
const RUNTYPES_SRC = fileURLToPath(new URL('packages/ts-runtypes/src/', REPO));

describe('playground source overlay — subpath exports', () => {
  // The overlay's virtual package.json is a HAND-WRITTEN literal while the file
  // contents are auto-walked, so a new subpath ships its sources but stays
  // unresolvable until the map is updated (exports maps are exhaustive). That
  // asymmetry silently broke the json-schema subpath; this pins it.
  it('mirrors every subpath the real package exports', () => {
    const real = JSON.parse(readFileSync(RUNTYPES_PKG, 'utf8')) as {exports: Record<string, unknown>};
    const overlay = buildRuntypesOverlay(RUNTYPES_SRC) as Record<string, string>;
    const virtualPkg = JSON.parse(overlay['node_modules/@ts-runtypes/core/package.json']!) as {
      exports: Record<string, string>;
    };
    expect(Object.keys(virtualPkg.exports).sort()).toEqual(Object.keys(real.exports).sort());
  });

  it('ships the json-schema sources the map points at', () => {
    const overlay = buildRuntypesOverlay(RUNTYPES_SRC) as Record<string, string>;
    expect(overlay['node_modules/@ts-runtypes/core/src/json-schema/index.ts']).toContain('export {runTypeFromJsonSchema}');
  });
});

const ready = assetsBuilt();
if (!ready) {
  // eslint-disable-next-line no-console
  console.warn(
    '[playground] WASM assets not built - skipping json-schema engine tests. Run: node container/website/scripts/build-playground.mjs'
  );
}
const describeIf = ready ? describe : describe.skip;

// A plain-shape schema and its hand-written twin: no constraint keywords, so the
// recovered type is the bare shape and the two forms MUST land on one cache entry.
const PLAIN_TYPE = `type MyType = {
  id: number;
  name: string;
  tags: string[];
};`;

const PLAIN_SCHEMA = `import { runTypeFromJsonSchema } from '@ts-runtypes/core/json-schema';

const MyType = runTypeFromJsonSchema({
  type: 'object',
  properties: {
    id: { type: 'number' },
    name: { type: 'string' },
    tags: { type: 'array', items: { type: 'string' } },
  },
  required: ['id', 'name', 'tags'],
});`;

const VALID = {id: 1, name: 'ada', tags: ['math']};
const INVALID = {id: 'not-a-number', name: 'ada', tags: []};

describeIf('playground engine — JSON Schema form (WASM, live execution)', () => {
  beforeAll(async () => {
    setResolver(await loadNodeResolver());
  });

  it('validates through the runTypeFromJsonSchema builder in schema mode', async () => {
    const ok = await run('validate', PLAIN_SCHEMA, VALID, undefined, 'schema');
    if (ok.kind !== 'predicate') throw new Error('expected predicate result');
    expect(ok.value).toBe(true);
    const bad = await run('validate', PLAIN_SCHEMA, INVALID, undefined, 'schema');
    if (bad.kind !== 'predicate') throw new Error('expected predicate result');
    expect(bad.value).toBe(false);
  });

  it('injects the id as a trailing argument on the builder call', async () => {
    const code = await transformedSource('createValidateFn', 'validate', PLAIN_SCHEMA, undefined, 'schema');
    expect(code).toMatch(/^import \{__rt_[A-Za-z0-9_]+} from 'rtmod:\/.+';/m);
    expect(code).toMatch(/const validate = createValidateFn\(MyType, __rt_[A-Za-z0-9_]+\);/);
  });

  it('converges with the type-first form on the same generated entry', async () => {
    const bindingOf = (code: string): string => {
      const match = code.match(/createValidateFn(?:<MyType>)?\((?:MyType, )?(__rt_[A-Za-z0-9_]+)\)/);
      if (!match) throw new Error(`no injected binding found in:\n${code}`);
      return match[1]!;
    };
    const fromType = bindingOf(await transformedSource('createValidateFn', 'validate', PLAIN_TYPE));
    const fromSchema = bindingOf(await transformedSource('createValidateFn', 'validate', PLAIN_SCHEMA, undefined, 'schema'));
    // The binding encodes the structural type id, so equality IS convergence.
    expect(fromSchema).toBe(fromType);
  });

  it('runs a constraint-bearing schema document end to end', async () => {
    // The document the removed preset carried — kept inline so the engine
    // lane still covers format/bound keywords, not just the plain shape.
    const source = `import { runTypeFromJsonSchema } from '@ts-runtypes/core/json-schema';

const MyType = runTypeFromJsonSchema({
  type: 'object',
  properties: {
    id: { type: 'string', format: 'uuid' },
    name: { type: 'string', minLength: 2, maxLength: 50 },
    email: { type: 'string', format: 'email' },
    age: { type: 'integer', minimum: 0, maximum: 130 },
    tags: { type: 'array', items: { type: 'string' } },
  },
  required: ['id', 'name', 'email', 'age', 'tags'],
} as const);`;
    const value = {
      id: '3f2504e0-4f89-41d3-9a0c-0305e82c3301',
      name: 'Ada Lovelace',
      email: 'ada@example.com',
      age: 36,
      tags: ['math', 'code'],
    };
    const ok = await run('validate', source, value, undefined, 'schema');
    if (ok.kind !== 'predicate') throw new Error('expected predicate result');
    expect(ok.value).toBe(true);
    const bad = await run('validate', source, {...value, email: 'not-an-email'}, undefined, 'schema');
    if (bad.kind !== 'predicate') throw new Error('expected predicate result');
    expect(bad.value).toBe(false);
  });
});
