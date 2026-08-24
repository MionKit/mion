// Wrapping tests — every scenario lives in its own runTest with a
// self-contained inline source. Each direct-marker scenario has paired
// _static (getRunTypeId<T>()) and _reflect (getRunTypeId(v)) tests per
// the marker test coverage rule (CLAUDE.md). User-defined wrappers and
// passthrough scenarios are also covered for both wrapper-arity shapes.
//
// Coverage matrix:
//   17a–17d  direct calls + user-defined wrappers (positive — site emitted)
//   17e–17f  free-T body / wrong-module collision (negative — skipped)
//   passthrough  wrappers that forward `id` to inner calls — outer site
//                only; inner free-T calls stay untouched
//   explicit-id  caller already filled the trailing slot — scanner must
//                NOT emit a site (no override of caller-supplied ids)

import {describe, expect} from 'vitest';
import {rewrite, runTest, withInlineSources} from './helpers/inline.ts';

describe('@ts-runtypes/devtools / wrapping', () => {
  // ---- 17a: direct call -------------------------------------------------

  runTest(
    '17a static: getRunTypeId<T>() — explicit type, no value',
    {
      '17a_static.ts': `import {getRunTypeId} from '@ts-runtypes/core';
const a = getRunTypeId<{id: number; name: string}>();
`,
    },
    async (sources) => {
      await withInlineSources(
        sources,
        async ({client}) => {
          const {code: out, sites} = await rewrite('17a_static.ts', sources['17a_static.ts'], client);
          expect(sites.length).toBe(1);
          expect(sites[0].id).toMatch(/^[A-Za-z][A-Za-z0-9]+$/);
          // Value slot stays empty, so the injected id is padded into slot 1.
          expect(out).toMatch(/getRunTypeId<\{id: number; name: string\}>\(undefined, __rt_[A-Za-z0-9]+\);/);
        },
        {reset: true}
      );
    }
  );

  runTest(
    '17a reflect: getRunTypeId(v) — T inferred from value',
    {
      '17a_reflect.ts': `import {getRunTypeId} from '@ts-runtypes/core';
const u = {id: 1, name: 'm'} as {id: number; name: string};
const a = getRunTypeId(u);
`,
    },
    async (sources) => {
      await withInlineSources(
        sources,
        async ({client}) => {
          const {code: out, sites} = await rewrite('17a_reflect.ts', sources['17a_reflect.ts'], client);
          expect(sites.length).toBe(1);
          expect(sites[0].id).toMatch(/^[A-Za-z][A-Za-z0-9]+$/);
          expect(out).toContain(`getRunTypeId(u, __rt_${sites[0].id});`);
        },
        {reset: true}
      );
    }
  );

  // ---- 17b: primitive ---------------------------------------------------

  runTest(
    '17b static: getRunTypeId<string>() — primitive type argument',
    {
      '17b_static.ts': `import {getRunTypeId} from '@ts-runtypes/core';
const b = getRunTypeId<string>();
`,
    },
    async (sources) => {
      await withInlineSources(
        sources,
        async ({client}) => {
          const {code: out, sites} = await rewrite('17b_static.ts', sources['17b_static.ts'], client);
          expect(sites.length).toBe(1);
          expect(out).toMatch(/getRunTypeId<string>\(undefined, __rt_[A-Za-z0-9]+\)/);
        },
        {reset: true}
      );
    }
  );

  runTest(
    '17b reflect: getRunTypeId(s) — primitive value',
    {
      '17b_reflect.ts': `import {getRunTypeId} from '@ts-runtypes/core';
const s: string = 'hello';
const b = getRunTypeId(s);
`,
    },
    async (sources) => {
      await withInlineSources(
        sources,
        async ({client}) => {
          const {code: out, sites} = await rewrite('17b_reflect.ts', sources['17b_reflect.ts'], client);
          expect(sites.length).toBe(1);
          expect(out).toMatch(/getRunTypeId\(s, __rt_[A-Za-z0-9]+\)/);
        },
        {reset: true}
      );
    }
  );

  // ---- 17c–17d: user-defined wrappers -----------------------------------
  //
  // User wrappers carry their own trailing InjectRunTypeId<T> slot. The two
  // arities below — value-arg wrapper (validate) and value-as-T wrapper
  // (nameOf) — are the natural mirrors of the static and reflect helpers
  // and are kept under separate runTest()s.

  runTest(
    '17c: user-defined wrapper with explicit type argument',
    {
      '17c.ts': `import {type InjectRunTypeId} from '@ts-runtypes/core';
function validate<T>(_v: unknown, id?: InjectRunTypeId<T>): InjectRunTypeId<T> {
  if (!id) throw new Error('transformer not active');
  return id;
}
const c = validate<{flag: boolean}>(true);
`,
    },
    async (sources) => {
      await withInlineSources(
        sources,
        async ({client}) => {
          const {code: out, sites} = await rewrite('17c.ts', sources['17c.ts'], client);
          expect(sites.length).toBe(1);
          expect(out).toMatch(/validate<\{flag: boolean\}>\(true, __rt_[A-Za-z0-9]+\)/);
        },
        {reset: true}
      );
    }
  );

  runTest(
    '17d: user-defined wrapper with T inferred from argument',
    {
      '17d.ts': `import {type InjectRunTypeId} from '@ts-runtypes/core';
function nameOf<T>(_val: T, id?: InjectRunTypeId<T>): InjectRunTypeId<T> {
  if (!id) throw new Error('transformer not active');
  return id;
}
const d = nameOf({kind: 'node', value: 42});
`,
    },
    async (sources) => {
      await withInlineSources(
        sources,
        async ({client}) => {
          const {code: out, sites} = await rewrite('17d.ts', sources['17d.ts'], client);
          expect(sites.length).toBe(1);
          expect(out).toMatch(/nameOf\(\{kind: 'node', value: 42\}, __rt_[A-Za-z0-9]+\)/);
        },
        {reset: true}
      );
    }
  );

  // ---- 17e–17f: negative cases — paired for both forms -------------------

  runTest(
    '17e static: getRunTypeId<T>() inside generic body with free T — no site',
    {
      '17e_static.ts': `import {getRunTypeId, type InjectRunTypeId} from '@ts-runtypes/core';
function inner<T>(_val: T): InjectRunTypeId<T> {
  return getRunTypeId<T>();
}
export {inner};
`,
    },
    async (sources) => {
      await withInlineSources(
        sources,
        async ({client}) => {
          const {code: out, sites} = await rewrite('17e_static.ts', sources['17e_static.ts'], client);
          expect(sites.length).toBe(0);
          expect(out).toContain(`return getRunTypeId<T>();`);
        },
        {reset: true}
      );
    }
  );

  runTest(
    '17e reflect: getRunTypeId<T>(val) inside generic body with free T — no site',
    {
      '17e_reflect.ts': `import {getRunTypeId, type InjectRunTypeId} from '@ts-runtypes/core';
function inner<T>(val: T): InjectRunTypeId<T> {
  return getRunTypeId<T>(val);
}
export {inner};
`,
    },
    async (sources) => {
      await withInlineSources(
        sources,
        async ({client}) => {
          const {code: out, sites} = await rewrite('17e_reflect.ts', sources['17e_reflect.ts'], client);
          expect(sites.length).toBe(0);
          expect(out).toContain(`return getRunTypeId<T>(val);`);
        },
        {reset: true}
      );
    }
  );

  runTest(
    '17f: same-name InjectRunTypeId from a non-marker module is ignored',
    {
      '17f.ts': `type RunTypeId_Local<T> = {readonly localBrand?: T};
function maskedWrapper<T>(_v: T, _id?: RunTypeId_Local<T>): void {}
maskedWrapper('noop');
`,
    },
    async (sources) => {
      await withInlineSources(
        sources,
        async ({client}) => {
          const {code: out, sites} = await rewrite('17f.ts', sources['17f.ts'], client);
          expect(sites.length).toBe(0);
          expect(out).toContain(`maskedWrapper('noop');`);
        },
        {reset: true}
      );
    }
  );

  // ---- 17g: nested-builder skip (value-first object/field pattern) -------
  //
  // A marker call nested inside another marker call's argument (the value-first
  // `object({field: leaf()})` shape) is reflected by the enclosing marker, so
  // the nested call's own id is redundant. The scanner skips it — only the
  // outer marker emits a site. The walk is transparent through the object
  // literal between them.

  runTest(
    '17g: field markers nested inside an enclosing model marker are skipped — outer site only',
    {
      '17g.ts': `import {type InjectRunTypeId} from '@ts-runtypes/core';
function model<T>(v: T, id?: InjectRunTypeId<T>): T { void id; return v; }
function field<T>(v: T, id?: InjectRunTypeId<T>): T { void id; return v; }
const m = model({name: field('x' as string), age: field(0 as number)});
export {m};
`,
    },
    async (sources) => {
      await withInlineSources(
        sources,
        async ({client}) => {
          const {sites} = await rewrite('17g.ts', sources['17g.ts'], client);
          // model(...) is the only top-level marker; the two nested field(...)
          // calls are enclosed by it and skipped.
          expect(sites.length).toBe(1);
        },
        {reset: true}
      );
    }
  );

  runTest(
    '17g control: the same field markers each emit a site when NOT nested',
    {
      '17g_control.ts': `import {type InjectRunTypeId} from '@ts-runtypes/core';
function field<T>(v: T, id?: InjectRunTypeId<T>): T { void id; return v; }
const a = field('x' as string);
const b = field(0 as number);
export {a, b};
`,
    },
    async (sources) => {
      await withInlineSources(
        sources,
        async ({client}) => {
          const {sites} = await rewrite('17g_control.ts', sources['17g_control.ts'], client);
          // Standalone field(...) calls are real markers — each gets a site.
          expect(sites.length).toBe(2);
        },
        {reset: true}
      );
    }
  );

  // ---- Pass-through wrappers — paired for both helpers --------------------

  runTest(
    'passthrough A static: wrapper forwards id to getRunTypeId — outer site only',
    {
      'pt_a_static.ts': `import {getRunTypeId, type InjectRunTypeId} from '@ts-runtypes/core';
function getTypeIdWrapper<T>(id?: InjectRunTypeId<T>): InjectRunTypeId<T> {
  return getRunTypeId<T>(undefined, id);
}
const x = getTypeIdWrapper<{a: number}>();
`,
    },
    async (sources) => {
      await withInlineSources(
        sources,
        async ({client}) => {
          const {code: out, sites} = await rewrite('pt_a_static.ts', sources['pt_a_static.ts'], client);
          // Outer call (getTypeIdWrapper<{a: number}>()) is concrete-T → 1 site.
          // Inner call (getRunTypeId<T>(undefined, id)) has free T → skipped.
          expect(sites.length).toBe(1);
          expect(out).toMatch(/getTypeIdWrapper<\{a: number\}>\(__rt_[A-Za-z0-9]+\)/);
          expect(out).toContain(`return getRunTypeId<T>(undefined, id);`);
        },
        {reset: true}
      );
    }
  );

  runTest(
    'passthrough A reflect: wrapper forwards id to getRunTypeId — outer site only',
    {
      'pt_a_reflect.ts': `import {getRunTypeId, type InjectRunTypeId} from '@ts-runtypes/core';
function reflectWrapper<T>(value: T, id?: InjectRunTypeId<T>): InjectRunTypeId<T> {
  return getRunTypeId<T>(value, id);
}
const x = reflectWrapper({a: 1});
`,
    },
    async (sources) => {
      await withInlineSources(
        sources,
        async ({client}) => {
          const {code: out, sites} = await rewrite('pt_a_reflect.ts', sources['pt_a_reflect.ts'], client);
          // Outer call (reflectWrapper({a: 1})) is concrete-T → 1 site.
          // Inner call (getRunTypeId<T>(value, id)) has free T AND id slot
          // is already filled by the parameter — either reason skips it.
          expect(sites.length).toBe(1);
          expect(out).toMatch(/reflectWrapper\(\{a: 1\}, __rt_[A-Za-z0-9]+\)/);
          expect(out).toContain(`return getRunTypeId<T>(value, id);`);
        },
        {reset: true}
      );
    }
  );

  runTest(
    'passthrough B: wrapper-of-wrapper forwarding id — only outermost site emitted',
    {
      'pt_b.ts': `import {type InjectRunTypeId} from '@ts-runtypes/core';
function inner<T>(_v: T, id?: InjectRunTypeId<T>): InjectRunTypeId<T> {
  if (!id) throw new Error('transformer not active');
  return id;
}
function outer<T>(v: T, id?: InjectRunTypeId<T>): InjectRunTypeId<T> {
  return inner(v, id);
}
const y = outer({k: 'v'});
`,
    },
    async (sources) => {
      await withInlineSources(
        sources,
        async ({client}) => {
          const {code: out, sites} = await rewrite('pt_b.ts', sources['pt_b.ts'], client);
          expect(sites.length).toBe(1);
          expect(out).toMatch(/outer\(\{k: 'v'\}, __rt_[A-Za-z0-9]+\)/);
          expect(out).toContain(`return inner(v, id);`);
        },
        {reset: true}
      );
    }
  );

  runTest(
    'passthrough C: wrapper-of-wrapper, intermediate drops id — outer-only site',
    {
      'pt_c.ts': `import {type InjectRunTypeId} from '@ts-runtypes/core';
function inner<T>(_v: T, id?: InjectRunTypeId<T>): InjectRunTypeId<T> {
  if (!id) throw new Error('transformer not active');
  return id;
}
function outer<T>(v: T, _id?: InjectRunTypeId<T>): InjectRunTypeId<T> {
  return inner(v);
}
const z = outer({n: 7});
`,
    },
    async (sources) => {
      await withInlineSources(
        sources,
        async ({client}) => {
          const {code: out, sites} = await rewrite('pt_c.ts', sources['pt_c.ts'], client);
          // Outer call: concrete T → 1 site.
          // inner(v) inside outer's body: T is outer's free type parameter → skipped.
          expect(sites.length).toBe(1);
          expect(out).toMatch(/outer\(\{n: 7\}, __rt_[A-Za-z0-9]+\)/);
          expect(out).toContain(`return inner(v);`);
        },
        {reset: true}
      );
    }
  );

  // ---- Caller-supplied explicit id — paired ------------------------------

  runTest(
    'explicit D static: caller passes literal id to getRunTypeId — no rewrite',
    {
      'ex_d_static.ts': `import {getRunTypeId} from '@ts-runtypes/core';
const a = getRunTypeId<{id: number; name: string}>(undefined, 'manualHash');
`,
    },
    async (sources) => {
      await withInlineSources(
        sources,
        async ({client}) => {
          const {code: out, sites} = await rewrite('ex_d_static.ts', sources['ex_d_static.ts'], client);
          expect(sites.length).toBe(0);
          expect(out).toContain(`getRunTypeId<{id: number; name: string}>(undefined, 'manualHash');`);
        },
        {reset: true}
      );
    }
  );

  runTest(
    'explicit D reflect: caller passes literal id to getRunTypeId — no rewrite',
    {
      'ex_d_reflect.ts': `import {getRunTypeId} from '@ts-runtypes/core';
const u = {id: 1, name: 'm'} as {id: number; name: string};
const a = getRunTypeId(u, 'manualHash');
`,
    },
    async (sources) => {
      await withInlineSources(
        sources,
        async ({client}) => {
          const {code: out, sites} = await rewrite('ex_d_reflect.ts', sources['ex_d_reflect.ts'], client);
          expect(sites.length).toBe(0);
          expect(out).toContain(`getRunTypeId(u, 'manualHash');`);
        },
        {reset: true}
      );
    }
  );

  runTest(
    'explicit E: caller passes literal id to a user-defined wrapper — no rewrite',
    {
      'ex_e.ts': `import {type InjectRunTypeId} from '@ts-runtypes/core';
function validate<T>(_v: unknown, id?: InjectRunTypeId<T>): InjectRunTypeId<T> {
  if (!id) throw new Error('transformer not active');
  return id;
}
const c = validate<{flag: boolean}>(true, 'manualHash');
`,
    },
    async (sources) => {
      await withInlineSources(
        sources,
        async ({client}) => {
          const {code: out, sites} = await rewrite('ex_e.ts', sources['ex_e.ts'], client);
          expect(sites.length).toBe(0);
          expect(out).toContain(`validate<{flag: boolean}>(true, 'manualHash');`);
        },
        {reset: true}
      );
    }
  );
});
