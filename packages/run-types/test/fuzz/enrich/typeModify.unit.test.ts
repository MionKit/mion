// The MODEL-vs-SOURCE parity of the type-modification edit engine, checked
// without the binary so it runs in milliseconds.
//
// A declaration carries two member lists: `props` is the flattened view the ops
// read (inherited, then own), `ownProps` is what the declaration itself spells
// and the ONLY thing renderDecl prints. An edit written to the wrong one leaves
// the model claiming a member the rendered source never declares — and then the
// reconcile fuzzer fails on the harness instead of on the reconciler.
//
// So this drives long random edit streams over heritage-ON types and asserts,
// after every single edit, that the model still describes the source it renders.
//
// The generator reaches a derived declaration on a few percent of draws and a
// NARROWING OVERRIDE on roughly one draw in a thousand, which is far too thin to
// pin the override rules by sampling. A hand-built base + override fixture (the
// last test) drives that path directly instead.

import {describe, it, expect} from 'vitest';
import {withSeededRandom, mixSeed} from '../core/seededRng.ts';
import {genType, inheritedProps, SCRATCH_FORMAT_LEAVES, type Decl, type GenOptions, type PropShape} from '../core/typeGen.ts';
import {modifyType, renderRootedSource, rootGeneratedType, type RootedType} from './typeModify.ts';

// The same space the typemod lane generates — heritage included, which is the
// point of this test.
const GEN_OPTIONS: GenOptions = {
  maxDepth: 3,
  maxBreadth: 3,
  wild: false,
  nonDataTypes: false,
  weirdKeys: true,
  named: true,
  formatLeafPool: SCRATCH_FORMAT_LEAVES,
  classes: true,
  heritage: true,
};

type MemberDecl = Extract<Decl, {props: PropShape[]}>;

function memberDecls(decls: Decl[]): MemberDecl[] {
  return decls.filter((decl): decl is MemberDecl => decl.kind === 'interface' || decl.kind === 'class');
}

function duplicateName(props: PropShape[]): string | undefined {
  const seen = new Set<string>();
  for (const prop of props) {
    if (seen.has(prop.name)) return prop.name;
    seen.add(prop.name);
  }
  return undefined;
}

// The members a declaration inherits, as the checker merges them.
function inheritedOf(decl: MemberDecl, byName: Map<string, Decl>): PropShape[] {
  return inheritedProps((decl.extends ?? []).map((name) => byName.get(name)!));
}

interface Coverage {
  derived: number;
  overrides: number;
  derivedEdits: number;
}

// Assert the whole model is coherent with the source it renders, and count what
// the heritage shapes actually turned up so a run can prove it saw them.
function checkRooted(rooted: RootedType, where: string, coverage: Coverage): void {
  const byName = new Map(rooted.decls.map((decl) => [decl.name, decl] as const));
  expect(byName.has(rooted.rootName), `${where}: rootName ${rooted.rootName} names no declaration`).toBe(true);

  for (const decl of memberDecls(rooted.decls)) {
    const own = decl.ownProps ?? decl.props;
    expect(duplicateName(own), `${where}: ${decl.name} spells a member twice`).toBeUndefined();
    expect(duplicateName(decl.props), `${where}: ${decl.name} flattens to a duplicate member`).toBeUndefined();

    const bases = decl.extends ?? [];
    if (bases.length === 0) {
      // No heritage means no second list to drift: `props` IS what is rendered.
      expect(decl.ownProps, `${where}: ${decl.name} has ownProps without extends`).toBeUndefined();
      continue;
    }
    coverage.derived++;

    for (const base of bases) {
      const target = byName.get(base);
      expect(target, `${where}: ${decl.name} extends ${base}, which is not declared`).toBeDefined();
      expect(target!.kind, `${where}: ${decl.name} extends a ${target!.kind}`).toBe(decl.kind);
    }

    // THE parity check: the flattened view is exactly what the rendered source
    // implies — the inherited members this declaration does not restate, then
    // the ones it spells. An edit applied to only one of the two lists breaks it.
    const inherited = inheritedOf(decl, byName);
    const ownNames = new Set(own.map((prop) => prop.name));
    const expected = [...inherited.filter((prop) => !ownNames.has(prop.name)), ...own];
    expect(decl.props, `${where}: ${decl.name} model and rendered source disagree`).toEqual(expected);
    // Same OBJECTS, so an in-place edit through either list stays coherent.
    for (const prop of own) {
      expect(decl.props.includes(prop), `${where}: ${decl.name}.${prop.name} is not the object props holds`).toBe(true);
    }

    // Every override must still narrow the member it restates: a literal of the
    // same primitive, carrying that member's optional / readonly verbatim.
    const inheritedByName = new Map(inherited.map((prop) => [prop.name, prop] as const));
    const literalFor: Record<string, string> = {string: 'string', number: 'number', boolean: 'boolean'};
    for (const prop of own) {
      const base = inheritedByName.get(prop.name);
      if (!base) continue;
      coverage.overrides++;
      expect(prop.shape.kind, `${where}: ${decl.name}.${prop.name} overrides without a literal`).toBe('literal');
      expect(
        typeof (prop.shape as {value: unknown}).value,
        `${where}: ${decl.name}.${prop.name} narrows a ${base.shape.kind} with the wrong literal`
      ).toBe(literalFor[base.shape.kind]);
      expect(prop.optional, `${where}: ${decl.name}.${prop.name} override changed optional`).toBe(base.optional);
      expect(prop.readonly, `${where}: ${decl.name}.${prop.name} override changed readonly`).toBe(base.readonly);
    }
  }
}

describe('typeModify keeps a derived declaration and its rendered source in step', () => {
  it('every edit lands on the members the declaration itself spells', () => {
    const coverage: Coverage = {derived: 0, overrides: 0, derivedEdits: 0};
    let edits = 0;
    for (let i = 0; i < 1500; i++) {
      withSeededRandom(mixSeed(0x9d, 'typemod-parity', i), () => {
        const rooted = rootGeneratedType(genType(GEN_OPTIONS), i, Math.random);
        checkRooted(rooted, `seed ${i} start`, coverage);
        const hasHeritage = memberDecls(rooted.decls).some((decl) => decl.extends?.length);
        for (let step = 0; step < 12; step++) {
          const result = modifyType(rooted, Math.random, {allowInvalid: false});
          edits++;
          if (hasHeritage) coverage.derivedEdits++;
          checkRooted(rooted, `seed ${i} step ${step} after ${result.op}`, coverage);
          expect(renderRootedSource(rooted).length, `seed ${i}: rendered nothing`).toBeGreaterThan(0);
        }
      });
    }
    expect(edits, 'no edits ran').toBeGreaterThan(10000);
    expect(coverage.derived, 'no derived declaration was generated').toBeGreaterThan(100);
    expect(coverage.derivedEdits, 'no edit ever ran on a type carrying heritage').toBeGreaterThan(100);
  });

  // A rename has to carry through the `extends` clauses too. They name a
  // declaration in the rendered source but are not shapes, so nothing in the
  // slot walk reaches them — a missed one renders `extends <gone>`.
  it('renaming a base carries into every extends clause', () => {
    let renamedBases = 0;
    for (let i = 0; i < 600; i++) {
      withSeededRandom(mixSeed(0x9e, 'typemod-extends', i), () => {
        const rooted = rootGeneratedType(genType(GEN_OPTIONS), i, Math.random);
        const before = new Set(memberDecls(rooted.decls).flatMap((decl) => decl.extends ?? []));
        for (let step = 0; step < 12; step++) {
          const result = modifyType(rooted, Math.random, {allowInvalid: false});
          const declared = new Set(rooted.decls.map((decl) => decl.name));
          for (const decl of memberDecls(rooted.decls)) {
            for (const base of decl.extends ?? []) {
              expect(declared.has(base), `seed ${i} after ${result.op}: ${decl.name} extends undeclared ${base}`).toBe(true);
            }
          }
          const now = new Set(memberDecls(rooted.decls).flatMap((decl) => decl.extends ?? []));
          for (const name of before) if (!now.has(name)) renamedBases++;
        }
      });
    }
    expect(renamedBases, 'no base was ever renamed').toBeGreaterThan(0);
  });

  // Renaming an INHERITED member is a legitimate edit: it belongs on the base,
  // and because a derived declaration holds the very same PropShape objects it
  // shows up everywhere that extends it, without ever being spelled twice.
  it('renaming an inherited member propagates to everything extending it', () => {
    let checked = 0;
    for (let i = 0; i < 1500 && checked < 25; i++) {
      withSeededRandom(mixSeed(0x9f, 'typemod-inherited', i), () => {
        const rooted = rootGeneratedType(genType(GEN_OPTIONS), i, Math.random);
        for (let step = 0; step < 12 && checked < 25; step++) {
          const result = modifyType(rooted, Math.random, {allowInvalid: false});
          if (!result.op.startsWith('renameProp')) continue;
          const newName = result.op.split('→')[1];
          const byName = new Map(rooted.decls.map((decl) => [decl.name, decl] as const));
          for (const decl of memberDecls(rooted.decls)) {
            if (!decl.extends?.length) continue;
            if (!inheritedOf(decl, byName).some((prop) => prop.name === newName)) continue;
            checked++;
            // Inherited under the new name, and NOT restated here — a base
            // rename must never leave a duplicate behind.
            expect(decl.props.filter((prop) => prop.name === newName)).toHaveLength(1);
            expect((decl.ownProps ?? []).some((prop) => prop.name === newName)).toBe(false);
          }
        }
      });
    }
    expect(checked, 'never observed a renamed member arriving through heritage').toBeGreaterThan(0);
  });
});

// --- the override path, driven directly ------------------------------------------

// `Derived extends Base` where Derived narrows Base's `p0: string` to `'fixed'`.
// TypeScript accepts that only while the override still narrows: retype `p0` on
// the base, or move its optional / readonly, and the override has to be re-derived
// or dropped. That is the one heritage shape the generator almost never reaches,
// so the edit engine gets pointed at it here.
function overrideFixture(): RootedType {
  const basePlain: PropShape = {name: 'p1', optional: true, readonly: false, method: false, shape: {kind: 'number'}};
  const baseNarrowed: PropShape = {name: 'p0', optional: false, readonly: false, method: false, shape: {kind: 'string'}};
  const base: Decl = {kind: 'interface', name: 'Base', props: [baseNarrowed, basePlain], calls: undefined};
  const override: PropShape = {
    name: 'p0',
    optional: false,
    readonly: false,
    method: false,
    shape: {kind: 'literal', value: 'fixed'},
  };
  const ownOnly: PropShape = {name: 'p2', optional: false, readonly: false, method: false, shape: {kind: 'boolean'}};
  const derived: Decl = {
    kind: 'interface',
    name: 'Derived',
    // Flattened: the inherited member it does NOT restate, then its own two.
    props: [basePlain, override, ownOnly],
    ownProps: [override, ownOnly],
    calls: undefined,
    extends: ['Base'],
  };
  const root: Decl = {
    kind: 'interface',
    name: 'Root0',
    props: [
      {name: 'value', optional: false, readonly: false, method: false, shape: {kind: 'ref', name: 'Derived'}},
      {name: 'lbl0', optional: false, readonly: false, method: false, shape: {kind: 'string'}},
      {name: 'lbl1', optional: false, readonly: false, method: false, shape: {kind: 'number'}},
    ],
    calls: undefined,
  };
  return {decls: [base, derived, root], rootName: 'Root0'};
}

describe('typeModify keeps a narrowing override valid', () => {
  it('repairs or drops an override the base side invalidated', () => {
    const coverage: Coverage = {derived: 0, overrides: 0, derivedEdits: 0};
    let repaired = 0;
    let dropped = 0;
    for (let i = 0; i < 400; i++) {
      withSeededRandom(mixSeed(0xa0, 'typemod-override', i), () => {
        const rooted = overrideFixture();
        checkRooted(rooted, `seed ${i} start`, coverage);
        for (let step = 0; step < 12; step++) {
          const byNameBefore = new Map(rooted.decls.map((decl) => [decl.name, decl] as const));
          const derivedBefore = byNameBefore.get('Derived');
          const inheritedBefore =
            derivedBefore && derivedBefore.kind === 'interface' ? inheritedOf(derivedBefore, byNameBefore) : [];
          const overridesBefore = new Map(
            (derivedBefore?.kind === 'interface' ? (derivedBefore.ownProps ?? []) : [])
              .filter((prop) => inheritedBefore.some((base) => base.name === prop.name))
              .map((prop) => [prop.name, JSON.stringify(prop)] as const)
          );

          const result = modifyType(rooted, Math.random, {allowInvalid: false});
          checkRooted(rooted, `seed ${i} step ${step} after ${result.op}`, coverage);

          const byNameAfter = new Map(rooted.decls.map((decl) => [decl.name, decl] as const));
          const derivedAfter = byNameAfter.get('Derived');
          const own = derivedAfter?.kind === 'interface' ? (derivedAfter.ownProps ?? []) : [];
          const inheritedAfter = derivedAfter && derivedAfter.kind === 'interface' ? inheritedOf(derivedAfter, byNameAfter) : [];
          for (const [name, snapshot] of overridesBefore) {
            const still = own.find((prop) => prop.name === name);
            const inherited = inheritedAfter.some((prop) => prop.name === name);
            if (!inherited) continue; // the base member itself was renamed or deleted
            if (!still) dropped++;
            else if (JSON.stringify(still) !== snapshot) repaired++;
          }
        }
      });
    }
    expect(coverage.overrides, 'the fixture never produced an override').toBeGreaterThan(1000);
    expect(repaired, 'no override was ever re-derived after a base edit').toBeGreaterThan(0);
    expect(dropped, 'no override was ever dropped after its base stopped being a primitive').toBeGreaterThan(0);
  });
});
