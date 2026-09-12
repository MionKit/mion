// Offline unit tests for the Phase-2 type generator — no Go binary, no plugin.
// Pins: determinism (a seed reproduces the exact type), well-formedness
// (balanced rendered source, bounded size, unique keys), broad WILD coverage
// (the exotic kinds are actually generated), the data-preset restriction, and
// recursion detection.

import {describe, it, expect} from 'vitest';
import {withSeededRandom, mixSeed} from './seededRng.ts';
import {
  genType,
  renderDecl,
  renderGenerated,
  describeType,
  countNodes,
  isRecursive,
  hasStructuralParams,
  genHasStructuralParams,
  usesFormatLeaves,
  DATA_GEN_OPTIONS,
  type Decl,
  type GeneratedType,
  type TypeShape,
} from './typeGen.ts';

function eachShape(shape: TypeShape, visit: (s: TypeShape) => void): void {
  visit(shape);
  switch (shape.kind) {
    case 'array':
    case 'set':
      return eachShape(shape.elem, visit);
    case 'record':
    case 'promise':
      return eachShape(shape.value, visit);
    case 'map':
      eachShape(shape.key, visit);
      eachShape(shape.value, visit);
      return;
    case 'tuple':
      return shape.elems.forEach((s) => eachShape(s, visit));
    case 'union':
    case 'intersection':
      return shape.members.forEach((s) => eachShape(s, visit));
    case 'function':
      shape.params.forEach((s) => eachShape(s, visit));
      return eachShape(shape.ret, visit);
    case 'object':
      shape.props.forEach((p) => eachShape(p.shape, visit));
      if (shape.index) eachShape(shape.index, visit);
      return;
  }
}

function eachShapeIn(gen: GeneratedType, visit: (s: TypeShape) => void): void {
  for (const decl of gen.decls) {
    if (decl.kind === 'interface' || decl.kind === 'class') decl.props.forEach((p) => eachShape(p.shape, visit));
    else if (decl.kind === 'type') eachShape(decl.shape, visit);
  }
  eachShape(gen.root, visit);
}

function kindsOf(gen: GeneratedType): Set<string> {
  const kinds = new Set<string>();
  eachShapeIn(gen, (s) => kinds.add(s.kind));
  for (const d of gen.decls) kinds.add(`decl:${d.kind}`);
  return kinds;
}

describe('typeGen — determinism', () => {
  it('reproduces the identical type (decls + root) from the same seed', () => {
    for (let i = 0; i < 50; i++) {
      const seed = mixSeed(0x1234, 'det', i);
      const a = withSeededRandom(seed, () => genType());
      const b = withSeededRandom(seed, () => genType());
      expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    }
  });

  it('produces many distinct types across seeds', () => {
    const rendered = new Set<string>();
    for (let i = 0; i < 80; i++) {
      const gen = withSeededRandom(mixSeed(0x99, 'spread', i), () => genType());
      const {decls, rootExpr} = renderGenerated(gen);
      rendered.add(decls + '\n' + rootExpr);
    }
    expect(rendered.size).toBeGreaterThan(40);
  });
});

describe('typeGen — well-formedness', () => {
  it('renders balanced source, bounded size, unique object keys', () => {
    for (let i = 0; i < 200; i++) {
      const gen = withSeededRandom(mixSeed(0xabc, 'wf', i), () => genType());
      const {decls, rootExpr} = renderGenerated(gen);
      expect(balanced(decls + '\n' + rootExpr)).toBe(true);
      expect(rootExpr.length).toBeGreaterThan(0);
      expect(describeType(gen).length).toBeGreaterThan(0);
      expect(countNodes(gen)).toBeLessThan(800);
      eachShapeIn(gen, (s) => {
        if (s.kind === 'object') {
          const names = s.props.map((p) => p.name);
          expect(new Set(names).size).toBe(names.length);
        }
      });
    }
  });
});

describe('typeGen — wild coverage', () => {
  it('generates the exotic kinds across the seed space', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 300; i++) {
      const gen = withSeededRandom(mixSeed(0x77, 'wild', i), () => genType());
      for (const k of kindsOf(gen)) seen.add(k);
    }
    for (const k of [
      'function',
      'symbol',
      'any',
      'unknown',
      'never',
      'void',
      'map',
      'set',
      'regexp',
      'promise',
      'intersection',
      'record',
    ]) {
      expect(seen.has(k), `expected to generate kind ${k}`).toBe(true);
    }
    for (const d of ['decl:interface', 'decl:class', 'decl:enum']) {
      expect(seen.has(d), `expected to generate ${d}`).toBe(true);
    }
  });

  it('data preset excludes non-serialisable kinds', () => {
    for (let i = 0; i < 200; i++) {
      const gen = withSeededRandom(mixSeed(0x55, 'data', i), () => genType(DATA_GEN_OPTIONS));
      eachShapeIn(gen, (s) => {
        for (const bad of ['function', 'symbol', 'any', 'unknown', 'never', 'void', 'promise']) {
          expect(s.kind, `data preset leaked ${s.kind}`).not.toBe(bad);
        }
      });
    }
  });

  // A plain user class carrying only data properties IS data: it validates
  // structurally, and the emitters treat it exactly like an object literal. It
  // used to be excluded from this preset, which left every strong oracle
  // blind to the one shape that had already drifted twice.
  it('data preset DOES emit classes, and heritage on both classes and interfaces', () => {
    let classDecls = 0;
    let classHeritage = 0;
    let interfaceHeritage = 0;
    let multiParent = 0;
    let override = 0;
    for (let i = 0; i < 1500; i++) {
      const gen = withSeededRandom(mixSeed(0x55, 'data', i), () => genType(DATA_GEN_OPTIONS));
      const byName = new Map(gen.decls.map((d) => [d.name, d] as const));
      for (const decl of gen.decls) {
        if (decl.kind === 'class') classDecls++;
        if (decl.kind !== 'class' && decl.kind !== 'interface') continue;
        const bases = decl.extends ?? [];
        if (bases.length === 0) continue;
        if (decl.kind === 'class') classHeritage++;
        else interfaceHeritage++;
        if (bases.length > 1) multiParent++;
        const inherited = new Set(
          bases.flatMap((name) => {
            const base = byName.get(name);
            return base && (base.kind === 'interface' || base.kind === 'class') ? base.props.map((p) => p.name) : [];
          })
        );
        // every inherited member is in the FLATTENED list, mirroring the
        // checker-merged `children` the emitters see
        const flattened = new Set(decl.props.map((p) => p.name));
        for (const name of inherited) expect(flattened.has(name), `${decl.name} lost inherited ${name}`).toBe(true);
        // ...but the declaration itself only spells its own members
        const own = decl.ownProps ?? [];
        expect(own.length).toBeLessThanOrEqual(decl.props.length);
        if (own.some((p) => inherited.has(p.name))) override++;
      }
    }
    expect(classDecls, 'no class in the data preset').toBeGreaterThan(0);
    expect(classHeritage, 'no class extends').toBeGreaterThan(0);
    expect(interfaceHeritage, 'no interface extends').toBeGreaterThan(0);
    expect(multiParent, 'no multi-parent interface').toBeGreaterThan(0);
    expect(override, 'no narrowing property override').toBeGreaterThan(0);
  });

  // The heritage REACHABILITY edge, pinned on its own. A base is reached only
  // through `extends` — no property shape points at it — so without that edge
  // in declRefs, pruneUnreachableDecls deletes it and the rendered source names
  // a type that was never declared. Measured at 31% of derived declarations
  // when the edge is dropped, and NOTHING else in the suite noticed: the
  // orphan test only checks surviving decls, and the type lane quietly
  // suppresses the resulting invalid TypeScript.
  it('a base reached only through extends survives pruning', () => {
    let derived = 0;
    for (let i = 0; i < 3000; i++) {
      const gen = withSeededRandom(mixSeed(0x57, 'dangle', i), () => genType(DATA_GEN_OPTIONS));
      const declared = new Set(gen.decls.map((decl) => decl.name));
      for (const decl of gen.decls) {
        if (decl.kind !== 'class' && decl.kind !== 'interface') continue;
        for (const base of decl.extends ?? []) {
          derived++;
          expect(declared.has(base), `${decl.name} extends ${base}, which is not declared`).toBe(true);
        }
      }
    }
    expect(derived, 'no derived declaration was checked').toBeGreaterThan(50);
  });

  // A derived declaration renders only what it declares; the base supplies the
  // rest. Rendering the flattened list instead would redeclare an inherited
  // member with a possibly different type, which TypeScript rejects.
  it('a derived declaration renders its own members only, after an extends clause', () => {
    for (let i = 0; i < 1500; i++) {
      const gen = withSeededRandom(mixSeed(0x56, 'render', i), () => genType(DATA_GEN_OPTIONS));
      for (const decl of gen.decls) {
        if (decl.kind !== 'class' && decl.kind !== 'interface') continue;
        if (!decl.extends?.length) continue;
        const source = renderDecl(decl);
        expect(source).toContain(` extends ${decl.extends.join(', ')} {`);
        const own = decl.ownProps ?? [];
        const inheritedOnly = decl.props.filter((prop) => !own.includes(prop));
        if (inheritedOnly.length === 0) continue;
        // Rendering the FLATTENED list would redeclare every inherited member,
        // so the derived form is necessarily shorter. A name-substring check
        // cannot work here: a nested inline object legitimately reuses `p0`.
        const body = (text: string): string => text.slice(text.indexOf('{'));
        const flattened = renderDecl({...decl, ownProps: undefined, extends: undefined});
        expect(body(source).length, `${decl.name} rendered its inherited members`).toBeLessThan(body(flattened).length);
      }
    }
  });
});

describe('typeGen — recursion detection', () => {
  const prop = (name: string, shape: TypeShape, optional = false) => ({name, optional, readonly: false, method: false, shape});

  it('flags a self-referential interface', () => {
    const decls: Decl[] = [
      {kind: 'interface', name: 'N', props: [prop('next', {kind: 'ref', name: 'N'}, true), prop('v', {kind: 'number'})]},
    ];
    expect(isRecursive({decls, root: {kind: 'ref', name: 'N'}})).toBe(true);
  });

  it('flags a mutual cycle', () => {
    const decls: Decl[] = [
      {kind: 'interface', name: 'A', props: [prop('b', {kind: 'ref', name: 'B'})]},
      {kind: 'interface', name: 'B', props: [prop('a', {kind: 'ref', name: 'A'})]},
    ];
    expect(isRecursive({decls, root: {kind: 'ref', name: 'A'}})).toBe(true);
  });

  it('does not flag an acyclic ref chain', () => {
    const decls: Decl[] = [
      {kind: 'interface', name: 'A', props: [prop('b', {kind: 'ref', name: 'B'})]},
      {kind: 'interface', name: 'B', props: [prop('v', {kind: 'string'})]},
    ];
    expect(isRecursive({decls, root: {kind: 'ref', name: 'A'}})).toBe(false);
  });
});

describe('typeGen — coherence', () => {
  // Re-derives reachability INDEPENDENTLY of the generator's own prune, so this
  // cross-checks it: every declared type must be reachable from the root through
  // the ref graph. A decl the root can't reach is an orphan declaration emitted
  // beside an unrelated root — pure noise the createX<root>() site never touches.
  function refsIn(shapes: TypeShape[]): string[] {
    const out: string[] = [];
    for (const shape of shapes) eachShape(shape, (s) => s.kind === 'ref' && out.push(s.name));
    return out;
  }
  function declShapes(decl: Decl): TypeShape[] {
    if (decl.kind === 'interface' || decl.kind === 'class') return decl.props.map((p) => p.shape);
    if (decl.kind === 'type') return [decl.shape];
    return [];
  }
  /** A base is reached through `extends`, not through any property shape —
   *  the same edge declRefs adds, mirrored here. **/
  function declBases(decl: Decl): string[] {
    if (decl.kind === 'interface' || decl.kind === 'class') return decl.extends ?? [];
    return [];
  }

  it('emits no orphan declarations — every decl is reachable from the root', () => {
    let withDecls = 0;
    for (let i = 0; i < 300; i++) {
      const gen = withSeededRandom(mixSeed(0xc0de, 'coherent', i), () => genType());
      if (gen.decls.length === 0) continue;
      withDecls++;
      const byName = new Map(gen.decls.map((d) => [d.name, d] as const));
      const reached = new Set<string>();
      const stack = refsIn([gen.root]);
      while (stack.length) {
        const name = stack.pop()!;
        if (reached.has(name) || !byName.has(name)) continue;
        reached.add(name);
        stack.push(...refsIn(declShapes(byName.get(name)!)), ...declBases(byName.get(name)!));
      }
      for (const decl of gen.decls) {
        expect(reached.has(decl.name), `seed ${i}: orphan decl ${decl.name} unreachable from root`).toBe(true);
      }
    }
    // Sanity: the seed space actually exercises the named-decl path (otherwise the
    // assertion above would be vacuous).
    expect(withDecls).toBeGreaterThan(20);
  });
});

// Balanced brackets/quotes — a cheap structural sanity check on rendered source.
function balanced(text: string): boolean {
  const stack: string[] = [];
  const pairs: Record<string, string> = {')': '(', ']': '[', '}': '{'};
  let inStr: string | null = null;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inStr) {
      if (ch === '\\') i++;
      else if (ch === inStr) inStr = null;
      continue;
    }
    if (ch === '"' || ch === "'") inStr = ch;
    else if (ch === '(' || ch === '[' || ch === '{') stack.push(ch);
    else if (ch === ')' || ch === ']' || ch === '}') {
      if (stack.pop() !== pairs[ch]) return false;
    }
  }
  return stack.length === 0 && inStr === null;
}

// A lane whose VALUE generator does not model the collection keywords gates its
// conformance oracles on `genHasStructuralParams`, so the set of kinds that can
// CARRY a params bag has to be complete. It was not: the elision lane kept its
// own copy listing only array and record, which let a bounded Set or Map into
// an oracle that then generated a value ignoring `minItems` / `contains` /
// `uniqueItems` and reported the validator's correct rejection as a violation.
// EVERY collection the generator decorates must be detected.
describe('typeGen — structural params detection', () => {
  const bag = {maxItems: 3} as const;

  it('detects a params bag on every collection kind, not just array and record', () => {
    const str: TypeShape = {kind: 'string'};
    const decorated: TypeShape[] = [
      {kind: 'array', elem: str, structural: bag},
      {kind: 'set', elem: str, structural: bag},
      {kind: 'map', key: str, value: str, structural: bag},
      {kind: 'record', value: str, structural: {minProperties: 1}},
    ];
    for (const shape of decorated) {
      expect(hasStructuralParams(shape), `${shape.kind} must be detected`).toBe(true);
    }
    // The same shapes WITHOUT a bag are not structural.
    const bare: TypeShape[] = [
      {kind: 'array', elem: str},
      {kind: 'set', elem: str},
      {kind: 'map', key: str, value: str},
      {kind: 'record', value: str},
      {kind: 'string'},
    ];
    for (const shape of bare) {
      expect(hasStructuralParams(shape), `bare ${shape.kind} must not be detected`).toBe(false);
    }
  });

  it('finds a bag nested anywhere in the generated type, and agrees with the preamble gate', () => {
    const boundedSet: TypeShape = {kind: 'set', elem: {kind: 'string'}, structural: bag};
    const nested: GeneratedType = {
      decls: [],
      root: {kind: 'object', props: [{name: 'tags', shape: {kind: 'array', elem: boundedSet}}]},
    } as GeneratedType;
    expect(genHasStructuralParams(nested)).toBe(true);
    // A structural bag is also a `TF.*` spelling, so the preamble gate agrees.
    expect(usesFormatLeaves(nested)).toBe(true);

    const plain: GeneratedType = {
      decls: [],
      root: {kind: 'object', props: [{name: 'tags', shape: {kind: 'set', elem: {kind: 'string'}}}]},
    } as GeneratedType;
    expect(genHasStructuralParams(plain)).toBe(false);
  });

  it('finds a bag reached only through a declaration', () => {
    const viaDecl: GeneratedType = {
      decls: [
        {kind: 'type', name: 'Scores', shape: {kind: 'map', key: {kind: 'string'}, value: {kind: 'number'}, structural: bag}},
      ],
      root: {kind: 'ref', name: 'Scores'},
    } as GeneratedType;
    expect(genHasStructuralParams(viaDecl)).toBe(true);
  });
});
