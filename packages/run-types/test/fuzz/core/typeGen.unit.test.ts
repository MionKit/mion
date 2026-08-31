// Offline unit tests for the Phase-2 type generator — no Go binary, no plugin.
// Pins: determinism (a seed reproduces the exact type), well-formedness
// (balanced rendered source, bounded size, unique keys), broad WILD coverage
// (the exotic kinds are actually generated), the data-preset restriction, and
// recursion detection.

import {describe, it, expect} from 'vitest';
import {withSeededRandom, mixSeed} from './seededRng.ts';
import {
  genType,
  renderGenerated,
  describeType,
  countNodes,
  isRecursive,
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
      // classes are value-typed nominal — excluded from the data preset too.
      expect(gen.decls.some((d) => d.kind === 'class')).toBe(false);
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
        stack.push(...refsIn(declShapes(byName.get(name)!)));
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
