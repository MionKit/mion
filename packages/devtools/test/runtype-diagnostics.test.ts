// End-to-end acceptance test for the runtype RT-compiler diagnostics
// added in Phase 2 / Phase 3 of the centralised diag catalog. Drives the
// Go binary over inline sources and verifies:
//
//   1. Root-position throw sites (Never, NonSerializable, function at
//      root, array element non-serializable) surface per-family
//      prefixed codes (PJ001, SJ001, TB001, …) — not generic codes —
//      so users can grep their build log by family.
//   2. Each diagnostic carries the marker call site (file:line:col),
//      not just the type-declaration site, so the warning is
//      actionable for the user.
//   3. Child-position silent-skip diagnostics (function-typed
//      properties, methods, static fields) surface with the per-family
//      prefix and the member name in the message.
//   4. Multiple marker calls referencing the same RT ID get one
//      diagnostic each (per user direction: dedup is one-per-call-site,
//      not one-per-typeid).
//   5. The diagnostic wire format flows through to formatTscDiagnostic
//      in the canonical $tsc problem-matcher line shape.

import {describe, expect, it} from 'vitest';
import {formatTscDiagnostic} from '../src/index.ts';
import {Family, Severity, type Diagnostic} from '../src/core/protocol.ts';
import {hasBinary, withInlineSources} from './helpers/inline.ts';

function runtypeDiagsOf(response: {diagnostics?: Diagnostic[]}): Diagnostic[] {
  return (response.diagnostics ?? []).filter((d) => d.family === Family.RunType);
}

describe('@mionjs/devtools / runtype diagnostics', () => {
  const register = hasBinary() ? it : it.skip;

  register('emits PJ001 for Never at root under prepareForJson', async () => {
    // pj is demand-driven now, so seed it via createJsonEncoderFn(mutate) → [pj].
    const sources = {
      'never.ts': `import {createJsonEncoderFn} from '@mionjs/run-types';
export const _ = createJsonEncoderFn<never>(undefined, {strategy: 'mutate'});
`,
    };
    await withInlineSources(sources, async ({client}) => {
      const response = await client.scanFiles(Object.keys(sources), {
        includeEntryModules: true,
      });
      const diags = runtypeDiagsOf(response);
      const pjNever = diags.find((d) => d.code === 'PJ001');
      expect(pjNever, JSON.stringify(diags, null, 2)).toBeDefined();
      expect(pjNever!.severity).toBe(Severity.Error);
      expect(pjNever!.site.filePath).toContain('never.ts');
      expect(pjNever!.site.startLine).toBeGreaterThan(0);
      // Args carry the kind label; the catalog template substitutes it.
      expect(pjNever!.args).toEqual(['Never']);
    });
  });

  register('emits per-family codes — SJ001 / TB001 / PJ001 — for same root throw', async () => {
    // All three families are demand-driven: seed pj via createJsonEncoderFn(mutate),
    // sj via createJsonEncoderFn(direct), and tb via createBinaryEncoderFn.
    const sources = {
      'never-multi.ts': `import {createJsonEncoderFn, createBinaryEncoderFn} from '@mionjs/run-types';
export const _ = createJsonEncoderFn<never>(undefined, {strategy: 'mutate'});
export const _s = createJsonEncoderFn<never>(undefined, {strategy: 'direct'});
export const _b = createBinaryEncoderFn<never>();
`,
    };
    await withInlineSources(sources, async ({client}) => {
      const response = await client.scanFiles(Object.keys(sources), {
        includeEntryModules: true,
      });
      const codes = new Set(runtypeDiagsOf(response).map((d) => d.code));
      expect(codes, [...codes].join(',')).toContain('PJ001');
      expect(codes).toContain('SJ001');
      expect(codes).toContain('TB001');
    });
  });

  register('emits per-call-site fan-out — three marker calls = three diagnostics', async () => {
    // pj is demand-driven; three createJsonEncoderFn(mutate) sites share one `never`
    // id, so the single rendered pj entry fans the PJ001 diag out to all three.
    const sources = {
      'fan-out.ts': `import {createJsonEncoderFn} from '@mionjs/run-types';
export const a = createJsonEncoderFn<never>(undefined, {strategy: 'mutate'});
export const b = createJsonEncoderFn<never>(undefined, {strategy: 'mutate'});
export const c = createJsonEncoderFn<never>(undefined, {strategy: 'mutate'});
`,
    };
    await withInlineSources(sources, async ({client}) => {
      const response = await client.scanFiles(Object.keys(sources), {
        includeEntryModules: true,
      });
      const neverDiags = runtypeDiagsOf(response).filter((d) => d.code === 'PJ001');
      expect(neverDiags).toHaveLength(3);
      const lines = new Set(neverDiags.map((d) => d.site.startLine));
      expect(lines.size).toBe(3);
    });
  });

  register('emits child-position warning for function-typed property under validate', async () => {
    // `it` is demand-driven, so seed it via createValidateFn (a reflection-only
    // getRunTypeId would emit no val_ entry and thus no validate diagnostic).
    const sources = {
      'fn-prop.ts': `import {createValidateFn} from '@mionjs/run-types';
interface User { name: string; onClick: () => void; }
export const _ = createValidateFn<User>();
`,
    };
    await withInlineSources(sources, async ({client}) => {
      const response = await client.scanFiles(Object.keys(sources), {
        includeEntryModules: true,
      });
      const diags = runtypeDiagsOf(response);
      const dropped = diags.find((d) => (d.code === 'VL010' || d.code === 'VL011') && d.args?.[0] === 'onClick');
      expect(dropped, JSON.stringify(diags, null, 2)).toBeDefined();
      expect(dropped!.severity).toBe(Severity.Warning);
    });
  });

  register('emits union-member-drop warning (VL014) for Date | symbol under validate', async () => {
    // `Date | symbol` projects to `Date` (DataOnly drops the symbol arm). The
    // drop is silent at runtime, so the build surfaces a VL014 Warning naming
    // the dropped member — mirroring the function-prop drop (VL010) above.
    const sources = {
      'union-drop.ts': `import {createValidateFn} from '@mionjs/run-types';
export const _ = createValidateFn<Date | symbol>();
`,
    };
    await withInlineSources(sources, async ({client}) => {
      const response = await client.scanFiles(Object.keys(sources), {
        includeEntryModules: true,
      });
      const diags = runtypeDiagsOf(response);
      const dropped = diags.find((d) => d.code === 'VL014');
      expect(dropped, JSON.stringify(diags, null, 2)).toBeDefined();
      expect(dropped!.severity).toBe(Severity.Warning);
      // args[0] names the dropped member so the message can point at it.
      expect(dropped!.args?.[0]).toContain('symbol');
      expect(dropped!.site.filePath).toContain('union-drop.ts');
    });
  });

  register('emits per-family union-drop warnings (PJS014 / SJ014 / RJ014) under JSON encode/decode', async () => {
    // Each demand-driven family walks the union and emits its own per-family
    // …014 prefix so users can grep the drop by family, like the root-throw
    // codes. Seed pjs via the default clone encode, sj via the direct strategy,
    // and rj via the decoder.
    const sources = {
      'union-drop-json.ts': `import {createJsonEncoderFn, createJsonDecoderFn} from '@mionjs/run-types';
export const _e = createJsonEncoderFn<Date | symbol>();
export const _s = createJsonEncoderFn<Date | symbol>(undefined, {strategy: 'direct'});
export const _d = createJsonDecoderFn<Date | symbol>();
`,
    };
    await withInlineSources(sources, async ({client}) => {
      const response = await client.scanFiles(Object.keys(sources), {
        includeEntryModules: true,
      });
      const drops = runtypeDiagsOf(response).filter((d) => d.code.endsWith('014'));
      const codes = new Set(drops.map((d) => d.code));
      expect(codes, [...codes].join(',')).toContain('PJS014');
      expect(codes).toContain('SJ014');
      expect(codes).toContain('RJ014');
      // Every …014 is a Warning, never an Error.
      for (const d of drops) expect(d.severity).toBe(Severity.Warning);
    });
  });

  register('emits NO union-drop warning when every member is stripped (alwaysThrow instead)', async () => {
    // `symbol | (() => void)` projects to `never` — uninhabitable — so the
    // factory alwaysThrows and there is no surviving union to drop INTO. A
    // …014 drop warning would be wrong here.
    const sources = {
      'union-allstripped.ts': `import {createValidateFn} from '@mionjs/run-types';
export const _ = createValidateFn<symbol | (() => void)>();
`,
    };
    await withInlineSources(sources, async ({client}) => {
      const response = await client.scanFiles(Object.keys(sources), {
        includeEntryModules: true,
      });
      const codes = new Set(runtypeDiagsOf(response).map((d) => d.code));
      expect(codes, [...codes].join(',')).not.toContain('VL014');
    });
  });

  register('formatTscDiagnostic renders runtype warnings in tsc line format', async () => {
    // pj is demand-driven, so seed it via createJsonEncoderFn(mutate) → [pj].
    const sources = {
      'fmt-rt.ts': `import {createJsonEncoderFn} from '@mionjs/run-types';
export const _ = createJsonEncoderFn<never>(undefined, {strategy: 'mutate'});
`,
    };
    await withInlineSources(sources, async ({client}) => {
      const response = await client.scanFiles(Object.keys(sources), {
        includeEntryModules: true,
      });
      const diagnostic = runtypeDiagsOf(response).find((d) => d.code === 'PJ001');
      expect(diagnostic).toBeDefined();
      const line = formatTscDiagnostic(diagnostic!);
      expect(line).toMatch(/^[^(]+\(\d+,\d+\):\s+error\s+PJ001:\s+.+$/);
    });
  });

  register('emits VE020 warning diagnostic for validationErrors on root any/unknown', async () => {
    const sources = {
      'any.ts': `import {getRunTypeId} from '@mionjs/run-types';
export const _ = getRunTypeId<any>();
`,
    };
    await withInlineSources(sources, async ({client}) => {
      const response = await client.scanFiles(Object.keys(sources), {
        includeEntryModules: true,
      });
      const diags = runtypeDiagsOf(response);
      const warning = diags.find((d) => d.code === 'VE020');
      // VE020 surfaces as Warning (not Info): root any/unknown is an
      // intentional escape hatch but a validator that accepts every
      // value is still a UX surprise worth flagging visibly.
      if (warning) {
        expect(warning.severity).toBe(Severity.Warning);
      }
    });
  });

  register('emits VL021 warning diagnostic for validate on root any/unknown', async () => {
    // `it` is demand-driven, so seed it via createValidateFn<unknown>() (a
    // reflection-only getRunTypeId would emit no val_ entry, no VL021).
    const sources = {
      'any-istype.ts': `import {createValidateFn} from '@mionjs/run-types';
export const _ = createValidateFn<unknown>();
`,
    };
    await withInlineSources(sources, async ({client}) => {
      const response = await client.scanFiles(Object.keys(sources), {
        includeEntryModules: true,
      });
      const diags = runtypeDiagsOf(response);
      const warning = diags.find((d) => d.code === 'VL021');
      // VL021 is the validate-family parallel to VE020 — root any/unknown
      // produces a validator that returns true for every value; surface
      // a warning so the user knows the schema is no longer enforced.
      expect(warning).toBeDefined();
      expect(warning!.severity).toBe(Severity.Warning);
    });
  });

  // Tuple slots are structural — a function or symbol slot can't be
  // silently dropped without changing the tuple's length / shape on the
  // wire. The serialization families (prepareForJson, prepareForJsonSafe,
  // restoreFromJson, stringifyJson, toBinary, fromBinary) propagate the
  // CodeNS upward so the renderer emits an alwaysThrow factory keyed on
  // the leaf's per-family code. Regression coverage for the array-style
  // short-circuits we removed in the tuple emits.

  register('propagates function-typed tuple slot as alwaysThrow under prepareForJson', async () => {
    // pj/pjs/rj/sj are demand-driven: seed pj via createJsonEncoderFn(mutate), pjs
    // via the default clone (shape-derived strip), sj via direct, and rj via createJsonDecoderFn.
    const sources = {
      'fn-tuple.ts': `import {createJsonEncoderFn, createJsonDecoderFn} from '@mionjs/run-types';
export const _ = createJsonEncoderFn<[number, () => void]>(undefined, {strategy: 'mutate'});
export const _s = createJsonEncoderFn<[number, () => void]>();
export const _d = createJsonEncoderFn<[number, () => void]>(undefined, {strategy: 'direct'});
export const _r = createJsonDecoderFn<[number, () => void]>();
`,
    };
    await withInlineSources(sources, async ({client}) => {
      const response = await client.scanFiles(Object.keys(sources), {
        includeEntryModules: true,
      });
      const codes = new Set(runtypeDiagsOf(response).map((d) => d.code));
      // One per-family error code per emitter — PJ003 / PJS003 /
      // RJ003 / SJ003 — all on the same function-root leaf.
      expect(codes, [...codes].join(',')).toContain('PJ003');
      expect(codes).toContain('PJS003');
      expect(codes).toContain('RJ003');
      expect(codes).toContain('SJ003');
      // Entry modules must wire the tuple's prepareForJson entry as
      // alwaysThrow so calling `createJsonEncoderFn<[number, () => void]>()`
      // throws at the first lookup. The fully rendered throw message rides
      // the tuple's final positional slot — verify it for the tuple entry.
      const allModules = Object.values(response.entryModules ?? {}).join('\n');
      expect(allModules).toMatch(
        /'[A-Za-z0-9]+_[A-Za-z0-9]+','tuple',,,,,,'\[PJ003\] Type `Function` can never be encoded to JSON/
      );
    });
  });

  register('propagates function-typed tuple slot as alwaysThrow under toBinary / fromBinary', async () => {
    // tb/fb are demand-driven, so seed each via the matching binary createX.
    const sources = {
      'fn-tuple-bin.ts': `import {createBinaryEncoderFn, createBinaryDecoderFn} from '@mionjs/run-types';
export const _e = createBinaryEncoderFn<[string, () => number]>();
export const _d = createBinaryDecoderFn<[string, () => number]>();
`,
    };
    await withInlineSources(sources, async ({client}) => {
      const response = await client.scanFiles(Object.keys(sources), {
        includeEntryModules: true,
      });
      const codes = new Set(runtypeDiagsOf(response).map((d) => d.code));
      expect(codes).toContain('TB003');
      expect(codes).toContain('FB003');
      // Entry key is the opaque `<fnHash>_<id>`, matched generically.
      const allModules = Object.values(response.entryModules ?? {}).join('\n');
      expect(allModules).toMatch(
        /'[A-Za-z0-9]+_[A-Za-z0-9]+','tuple',,,,,,'\[TB003\] Type `Function` can never be serialised to binary/
      );
    });
  });

  register('propagates symbol-typed tuple slot as alwaysThrow under prepareForJson', async () => {
    // Symbol in a tuple slot wasn't covered by the explicit
    // isFunctionLikeKind short-circuit — it took the natural CompileChild
    // path even before the fix. This test pins that behavior so a future
    // optimisation can't silently regress it.
    const sources = {
      'sym-tuple.ts': `import {createJsonEncoderFn, createBinaryEncoderFn} from '@mionjs/run-types';
export const _ = createJsonEncoderFn<[number, symbol]>(undefined, {strategy: 'mutate'});
export const _b = createBinaryEncoderFn<[number, symbol]>();
`,
    };
    await withInlineSources(sources, async ({client}) => {
      const response = await client.scanFiles(Object.keys(sources), {
        includeEntryModules: true,
      });
      const codes = new Set(runtypeDiagsOf(response).map((d) => d.code));
      expect(codes).toContain('PJ005');
      expect(codes).toContain('TB006');
    });
  });

  // JCP001 regression — the `compact` JSON strategy (encoder cj / decoder cjr)
  // used to SILENTLY SKIP its primitive entry when a walk hit an unserialisable
  // leaf at a propagating position, because the compact emitters implemented
  // neither diagnostic interface. The composite then bound a never-rendered
  // primitive (`utl.getRT(cj_<id>).fn` on a module that never registered),
  // surfacing the internal JCP001 "never rendered — please file an issue" error.
  // The fix delegates cj → prepareForJsonSafe (PJS*) and cjr → restoreFromJson
  // (RJ*), so compact now alwaysThrows with the SAME per-family code as its
  // siblings and never trips JCP001. See docs/done/jcp001-*.
  register('compact strategy alwaysThrows (PJS003 / RJ003) with NO JCP001 for a function tuple slot', async () => {
    const sources = {
      'compact-fn-tuple.ts': `import {createJsonEncoderFn, createJsonDecoderFn} from '@mionjs/run-types';
export const _e = createJsonEncoderFn<[number, () => void]>(undefined, {strategy: 'compact'});
export const _d = createJsonDecoderFn<[number, () => void]>(undefined, {strategy: 'compact'});
`,
    };
    await withInlineSources(sources, async ({client}) => {
      const response = await client.scanFiles(Object.keys(sources), {
        includeEntryModules: true,
      });
      const diags = response.diagnostics ?? [];
      // The internal breach must be gone entirely.
      expect(
        diags.filter((d) => d.code === 'JCP001'),
        JSON.stringify(diags, null, 2)
      ).toHaveLength(0);
      const codes = new Set(runtypeDiagsOf(response).map((d) => d.code));
      // Compact encode (cj) mirrors clone (pjs); compact decode (cjr) mirrors
      // preserve (rj) — same function-root code the sibling strategies emit.
      expect(codes, [...codes].join(',')).toContain('PJS003');
      expect(codes).toContain('RJ003');
      // The compact composite entry must wire the tuple as an alwaysThrow, so
      // calling it throws at first lookup rather than crashing on an undefined fn.
      const allModules = Object.values(response.entryModules ?? {}).join('\n');
      expect(allModules).toMatch(/'\[PJS003\] Type `Function` can never be encoded to JSON/);
    });
  });

  register('compact strategy alwaysThrows (PJS005 / RJ005) with NO JCP001 for a symbol tuple slot', async () => {
    const sources = {
      'compact-sym-tuple.ts': `import {createJsonEncoderFn, createJsonDecoderFn} from '@mionjs/run-types';
export const _e = createJsonEncoderFn<[number, symbol]>(undefined, {strategy: 'compact'});
export const _d = createJsonDecoderFn<[number, symbol]>(undefined, {strategy: 'compact'});
`,
    };
    await withInlineSources(sources, async ({client}) => {
      const response = await client.scanFiles(Object.keys(sources), {
        includeEntryModules: true,
      });
      const diags = response.diagnostics ?? [];
      expect(
        diags.filter((d) => d.code === 'JCP001'),
        JSON.stringify(diags, null, 2)
      ).toHaveLength(0);
      const codes = new Set(runtypeDiagsOf(response).map((d) => d.code));
      expect(codes, [...codes].join(',')).toContain('PJS005');
      expect(codes).toContain('RJ005');
    });
  });

  register('emits a …015 WARNING (not a root error) for a directly-stripped property value (F3)', async () => {
    // `{a: symbol}` / `{a: Promise<number>}` — the property VALUE is directly
    // non-data, so the property is DROPPED and the object still serializes:
    // `DataOnly<{a: symbol; b: number}>` = `{b: number}`. The drop is a …015
    // child-position Warning, NEVER a root error (the factory does not throw).
    // Before the fix the default clone encoder (prepareForJsonSafe) FAILED these
    // outright, and the other families emitted an Error — F3.
    const sources = {
      'stripped-prop.ts': `import {createValidateFn, createJsonEncoderFn} from '@mionjs/run-types';
interface S { a: symbol; b: number; }
interface P { a: Promise<number>; b: number; }
export const _v = createValidateFn<S>();
export const _e = createJsonEncoderFn<S>();
export const _p = createValidateFn<P>();
`,
    };
    await withInlineSources(sources, async ({client}) => {
      const response = await client.scanFiles(Object.keys(sources), {
        includeEntryModules: true,
      });
      const diags = runtypeDiagsOf(response);
      // The default clone encoder + validate drop the property with a …015 Warning.
      const drops = diags.filter((d) => d.code.endsWith('015'));
      const codes = new Set(drops.map((d) => d.code));
      expect(codes, JSON.stringify(diags, null, 2)).toContain('VL015'); // validate
      expect(codes).toContain('PJS015'); // default clone encoder
      for (const d of drops) {
        expect(d.severity, `${d.code} should be a Warning`).toBe(Severity.Warning);
        expect(d.args?.[0]).toBe('a');
      }
      // NO root error may fire — a dropped property serializes fine. (The …002 /
      // …005 codes are the symbol / non-serialisable ROOT errors.)
      const errors = diags.filter((d) => d.severity === Severity.Error);
      expect(errors, JSON.stringify(errors, null, 2)).toHaveLength(0);
      // And the object factory must NOT be an alwaysThrow tuple.
      const allModules = Object.values(response.entryModules ?? {}).join('\n');
      expect(allModules).not.toMatch(/'objectLiteral',,,,,,'\[(PJS|VL)/);
    });
  });

  register('throws (root error, not a …015 drop) for a structurally-unserialisable property value (F3)', async () => {
    // `{a: symbol[]}` — the property value is only STRUCTURALLY unserialisable
    // (a symbol in a propagating array slot). DataOnly KEEPS it as `never[]`, so
    // it cannot be safely dropped: the family throws at build time with a root
    // error, and the …015 drop Warning must NOT fire.
    const sources = {
      'structural-prop.ts': `import {createJsonEncoderFn} from '@mionjs/run-types';
interface S { a: symbol[]; b: number; }
export const _e = createJsonEncoderFn<S>(undefined, {strategy: 'mutate'});
`,
    };
    await withInlineSources(sources, async ({client}) => {
      const response = await client.scanFiles(Object.keys(sources), {
        includeEntryModules: true,
      });
      const diags = runtypeDiagsOf(response);
      const codes = new Set(diags.map((d) => d.code));
      expect(codes, JSON.stringify(diags, null, 2)).toContain('PJ005'); // symbol root error
      expect(
        [...codes].some((c) => c.endsWith('015')),
        'no …015 drop for a kept property'
      ).toBe(false);
    });
  });

  // The default emit mode (no inline createRTFn) keeps the cache
  // Regression: one diagnostic per CALL SITE, never one per cache family.
  //
  // A class demanded by two families (the JSON encoder walks it, the decoder
  // walks it) used to report CLS001 FOUR times for two call sites: each family
  // gets its own Walker — so its own per-code latch — and each walk emits
  // against EVERY provenance site of the root type. mion saw 114 CLS001 lines
  // per lint run, roughly half of them exact duplicates.
  //
  // Nothing about this was class-serializer specific; it hit any code emitted
  // from a family-shared path. The fix (diagnostics.Dedupe, applied once in
  // Session.Dispatch) is keyed on the FULL identity, so the sibling assertion
  // below — two different classes at two sites — must still report four.
  register('reports CLS001 once per call site, not once per cache family', async () => {
    const sources = {
      'cls.ts': `import {createJsonEncoderFn, createJsonDecoderFn} from '@mionjs/run-types';
export class Pet { name: string = 'x'; }
export const enc = createJsonEncoderFn<Pet>();
export const dec = createJsonDecoderFn<Pet>();
`,
    };
    await withInlineSources(sources, async ({client}) => {
      const response = await client.scanFiles(Object.keys(sources), {includeEntryModules: true});
      const cls = runtypeDiagsOf(response).filter((d) => d.code === 'CLS001');
      expect(cls.length, `expected one CLS001 per call site, got:\n${JSON.stringify(cls, null, 2)}`).toBe(2);
      // Both sites are represented — dedup must not collapse ACROSS sites.
      const lines = cls.map((d) => d.site.startLine).sort((a, b) => a - b);
      expect(lines).toEqual([3, 4]);
      for (const diagnostic of cls) {
        expect(diagnostic.severity).toBe(Severity.Warning);
        expect(diagnostic.args).toEqual(['Pet']);
      }
    });
  });

  // A child type gets its OWN cache entry, keyed by its own structural id — an
  // id no marker call ever named. Provenance was built from call sites alone, so
  // a child entry had none, and EmitDiagnostic drops what it cannot attribute
  // (rather than render an empty filePath). The effect was silent and backwards:
  // a class warned at the ROOT of an encoder but said nothing when nested or in
  // a union — the normal way people write types.
  //
  // Provenance is now inherited by every type a call site reaches, so the site
  // is told about the types it actually pulls in.
  register('warns for a class nested inside the encoded type, not just at the root', async () => {
    const sources = {
      'nested.ts': `import {createJsonEncoderFn} from '@mionjs/run-types';
export class Pet { name: string = 'x'; }
export class Owner { email: string = 'y'; }
export const enc = createJsonEncoderFn<{pet: Pet; owner: Owner}>();
`,
    };
    await withInlineSources(sources, async ({client}) => {
      const response = await client.scanFiles(Object.keys(sources), {includeEntryModules: true});
      const cls = runtypeDiagsOf(response).filter((d) => d.code === 'CLS001');
      // BOTH nested classes, each once, attributed to the call site that pulled
      // them in. Each is its own child entry, so the per-walk code latch (which
      // would allow only one CLS001 per walk) does not merge them.
      expect(cls.map((d) => d.args?.[0]).sort()).toEqual(['Owner', 'Pet']);
      for (const diagnostic of cls) expect(diagnostic.site.startLine).toBe(4);
    });
  });

  register('warns for a class reached through a union arm', async () => {
    const sources = {
      'union.ts': `import {createJsonEncoderFn} from '@mionjs/run-types';
export class Pet { name: string = 'x'; }
export class Owner { email: string = 'y'; }
export const enc = createJsonEncoderFn<Pet | Owner>();
`,
    };
    await withInlineSources(sources, async ({client}) => {
      const response = await client.scanFiles(Object.keys(sources), {includeEntryModules: true});
      const cls = runtypeDiagsOf(response).filter((d) => d.code === 'CLS001');
      expect(cls.map((d) => d.args?.[0]).sort()).toEqual(['Owner', 'Pet']);
    });
  });

  register('warns for a class buried several levels down', async () => {
    const sources = {
      'deep.ts': `import {createJsonEncoderFn} from '@mionjs/run-types';
export class Pet { name: string = 'x'; }
export const enc = createJsonEncoderFn<{a: {b: {c: Pet}}}>();
`,
    };
    await withInlineSources(sources, async ({client}) => {
      const response = await client.scanFiles(Object.keys(sources), {includeEntryModules: true});
      const cls = runtypeDiagsOf(response).filter((d) => d.code === 'CLS001');
      expect(cls).toHaveLength(1);
      expect(cls[0]!.args).toEqual(['Pet']);
      expect(cls[0]!.site.startLine).toBe(3);
    });
  });

  // A recursive type must not send the provenance walk into a loop, and must not
  // multiply the diagnostic by however many times the cycle is traversed.
  register('a self-referencing type warns once, without looping', async () => {
    const sources = {
      'cycle.ts': `import {createJsonEncoderFn} from '@mionjs/run-types';
export class Node { name: string = 'x'; next?: Node; }
export const enc = createJsonEncoderFn<{root: Node}>();
`,
    };
    await withInlineSources(sources, async ({client}) => {
      const response = await client.scanFiles(Object.keys(sources), {includeEntryModules: true});
      const cls = runtypeDiagsOf(response).filter((d) => d.code === 'CLS001');
      expect(cls).toHaveLength(1);
      expect(cls[0]!.args).toEqual(['Node']);
    });
  });

  // The matching NEGATIVE case — same code and site, different args, both
  // surviving — is covered by TestDedupe_KeepsSameSiteDifferentArgs in
  // internal/diagnostics/dedupe_test.go rather than here, because the pipeline
  // cannot currently produce that shape end-to-end: Walker.EmitDiagnostic's
  // per-walk latch is keyed on the CODE alone, so a single walk emits any given
  // code at most once whatever its args. Asserting it at this layer would pin
  // that incidental limitation instead of the dedup contract.

  // module compact by leaving the validator body in arg-3 only and
  // trimming the all-default tail (isNoop false, empty dep lists, the
  // createRTFn placeholder) — non-noop dep-less entries end at the
  // quoted `code` string. The JS-side materializeRTFn rebuilds the
  // factory via `new Function('utl', code)` on first lookup. Test runs
  // themselves opt INTO the inline-factory shape via vitest config (so
  // suites cover both materialisation paths) — this regression spins up
  // a one-shot ResolverClient with the production default and pins the
  // smaller emit shape.
  register('default emit (no inline createRTFn) trims the default tail and omits g_<hash>(utl)', async () => {
    // `it` is demand-driven, so seed it via createValidateFn<User>() — a
    // reflection-only getRunTypeId would emit no val_ entries to inspect.
    const sources = {
      'mini.ts': `import {createValidateFn} from '@mionjs/run-types';
interface User { name: string; age: number; tags: string[]; }
export const _ = createValidateFn<User>();
`,
    };
    // Slice 4: the validate family prefix is the opaque fnHash the scanner
    // injected into the createValidateFn site's `fnId`, not the readable `it`
    // tag. Captured from the first scan so both the inline-factory and the
    // one-shot init-line assertions stay correct across version-isolated hashes.
    let itPrefix = '';
    await withInlineSources(sources, async ({client}) => {
      const inlineOn = await client.scanFiles(Object.keys(sources), {
        includeEntryModules: true,
      });
      const inlineOnBody = Object.values(inlineOn.entryModules ?? {}).join('\n');
      const itSite = inlineOn.sites.find((s) => s.fnId);
      if (!itSite?.fnId) throw new Error('expected a createValidateFn site with an injected fnId');
      itPrefix = itSite.fnId;
      // The default shared client runs with emitMode 'both' so we get the
      // inline factory here as a baseline.
      expect(inlineOnBody, 'shared client should emit the inline factory').toMatch(
        new RegExp('function g_' + itPrefix + '_[A-Za-z0-9]+\\(utl\\)')
      );
    });

    // Spin up a one-shot client with the production default
    // (emitMode omitted → 'code') and assert the smaller shape.
    const {ResolverClient} = await import('../src/core/resolver-client.ts');
    const path = await import('node:path');
    const ROOT = path.resolve(__dirname, '../../..');
    const oneShot = new ResolverClient(`${ROOT}/bin/mion`, ROOT, '', {serverMode: true});
    try {
      await oneShot.setSources({...MARKER_PACKAGE_OVERLAY, ...sources});
      const response = await oneShot.scanFiles(Object.keys(sources), {
        includeEntryModules: true,
      });
      const entryModules = response.entryModules ?? {};
      // The trailing run of default-valued slots (`…,false,[],[],u`) is
      // trimmed per entry, stopping at the first non-default from the end —
      // a dep-less entry ends at the quoted `code` string, a dep-carrying
      // one at its rtDependencies array. Scan the validate-family tuples,
      // keyed by the opaque fnHash prefix (`<itPrefix>_<id>`).
      const validateModules = Object.entries(entryModules).filter(([key]) => key.startsWith(itPrefix + '_'));
      expect(validateModules.length, 'expected at least one validate entry for User').toBeGreaterThan(0);
      let depLessEndsAtCode = 0;
      for (const [key, source] of validateModules) {
        // Noop entries use the 4-arg short tuple tail `,undefined,true];` — skip those.
        if (source.includes(',undefined,true];')) continue;
        expect(source, `the u placeholder never survives at the tail — got: ${source}`).not.toMatch(/,u\];\n$/);
        expect(source, `the full default tail never survives — got: ${source}`).not.toContain(',false,[],[]');
        // The code slot's body ends `…}return <innerName>` (hoisted inner
        // declaration + name return — see typefns.WrapClosure).
        if (/return [A-Za-z0-9_$]+'\];\n$/.test(source)) depLessEndsAtCode++;
        void key;
      }
      // User's `tags: string[]` member entry has no deps of its own, so at
      // least one tuple must demonstrate the maximal trim (ends at `code`).
      expect(depLessEndsAtCode, 'expected a dep-less entry ending at the code slot').toBeGreaterThan(0);
      // And the closure-form must be completely absent under the default.
      const body = Object.values(entryModules).join('\n');
      expect(body, 'default emit must NOT contain the inline factory closure').not.toMatch(
        new RegExp('function g_' + itPrefix + '_[A-Za-z0-9]+\\(utl\\)')
      );
    } finally {
      oneShot.close();
    }
  });
});

// The marker-package overlay is borrowed via the helper; re-import the
// constant for the one-shot probe above so the inline `setSources`
// call doesn't have to re-declare the marker module.
import {MARKER_PACKAGE_OVERLAY} from './helpers/inline.ts';
