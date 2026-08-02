// Offline unit tests for the Phase-2 value layer. Pins the soundness contract
// the O1/O2 oracles depend on, using a reference structural validator built
// directly from the type (independent of the runtime emitter). Only types the
// strong oracles actually run on (`valueOracleSafe`, non-recursive) are checked.

import {describe, it, expect} from 'vitest';
import {withSeededRandom, mixSeed} from '../core/seededRng.ts';
import {FORMAT_LEAVES, genType, isRecursive, type Decl, type GeneratedType, type TypeShape} from '../core/typeGen.ts';
import {genValidValue, validValue, corruptValue, valueOracleSafe} from './shapeValue.ts';

// Reference validator over the safe subset (an INDEPENDENT oracle for the
// generated values). Methods / function-typed props are dropped (omitted from
// the value), so a missing such prop is fine.
function conforms(shape: TypeShape, value: unknown, decls: Map<string, Decl>): boolean {
  switch (shape.kind) {
    case 'number':
      return typeof value === 'number' && Number.isFinite(value);
    case 'string':
      return typeof value === 'string';
    case 'boolean':
      return typeof value === 'boolean';
    case 'bigint':
      return typeof value === 'bigint';
    case 'null':
      return value === null;
    case 'undefined':
      return value === undefined;
    case 'date':
      return value instanceof Date && !Number.isNaN(value.getTime());
    case 'regexp':
      return value instanceof RegExp;
    case 'literal':
      return value === shape.value;
    case 'array':
      return Array.isArray(value) && value.every((v) => conforms(shape.elem, v, decls));
    case 'set':
      return value instanceof Set && [...value].every((v) => conforms(shape.elem, v, decls));
    case 'map':
      return (
        value instanceof Map && [...value].every(([k, v]) => conforms(shape.key, k, decls) && conforms(shape.value, v, decls))
      );
    case 'record':
      return isPlainObject(value) && Object.values(value).every((v) => conforms(shape.value, v, decls));
    case 'tuple':
      return (
        Array.isArray(value) && value.length === shape.elems.length && shape.elems.every((s, i) => conforms(s, value[i], decls))
      );
    case 'union':
      return shape.members.some((m) => conforms(m, value, decls));
    case 'intersection':
      return shape.members.every((m) => conforms(m, value, decls));
    case 'object':
      return objectConforms(shape.props, value, decls);
    case 'format':
      return FORMAT_LEAVES[shape.name].test(value); // predicate includes the base-kind check
    case 'not': {
      // Not<F> = base kind holds AND the format check fails (never a bare ¬).
      if (shape.child.kind !== 'format') return false;
      const spec = FORMAT_LEAVES[shape.child.name];
      const baseOk = spec.family === 'string' ? typeof value === 'string' : typeof value === 'number' && Number.isFinite(value);
      return baseOk && !spec.test(value);
    }
    case 'ref':
      return refConforms(shape.name, value, decls);
    default:
      return true; // any/unknown/symbol/function/… aren't generated in safe types
  }
}

function objectConforms(
  props: {name: string; optional: boolean; method: boolean; shape: TypeShape}[],
  value: unknown,
  decls: Map<string, Decl>
): boolean {
  if (!isPlainObject(value)) return false;
  for (const prop of props) {
    if (prop.method || prop.shape.kind === 'function') continue; // dropped
    const present = Object.prototype.hasOwnProperty.call(value, prop.name);
    if (!present) {
      if (!prop.optional) return false;
      continue;
    }
    if (!conforms(prop.shape, value[prop.name], decls)) return false;
  }
  return true;
}

function refConforms(name: string, value: unknown, decls: Map<string, Decl>): boolean {
  const decl = decls.get(name);
  if (!decl) return false;
  if (decl.kind === 'enum') return decl.members.some((m, i) => value === (m.value !== undefined ? m.value : i));
  if (decl.kind === 'type') return conforms(decl.shape, value, decls);
  if (decl.kind === 'interface') return objectConforms(decl.props, value, decls);
  return false;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    !!value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    !(value instanceof Set) &&
    !(value instanceof Map) &&
    !(value instanceof Date) &&
    !(value instanceof RegExp)
  );
}

function declMap(gen: GeneratedType): Map<string, Decl> {
  return new Map(gen.decls.map((d) => [d.name, d]));
}

// A safe, non-recursive, non-floored type plus its value — the exact subset the
// runner applies the strong oracles to.
function safeSample(seed: number): {gen: GeneratedType; value: unknown} | null {
  const gen = withSeededRandom(seed, () => genType());
  if (isRecursive(gen) || !valueOracleSafe(gen)) return null;
  const {value, floored} = genValidValue(gen);
  if (floored) return null;
  return {gen, value};
}

describe('shapeValue — validValue conforms', () => {
  it('every safe generated value conforms to its type (reference validator)', () => {
    let checked = 0;
    for (let i = 0; i < 1000; i++) {
      withSeededRandom(mixSeed(0x222, 'valid', i), () => {
        const s = safeSample(mixSeed(0x222, 'valid', i));
        if (!s) return;
        checked++;
        expect(conforms(s.gen.root, s.value, declMap(s.gen)), `type=${JSON.stringify(s.gen)} value=${String(s.value)}`).toBe(
          true
        );
      });
    }
    expect(checked).toBeGreaterThan(150); // the safe subset is actually exercised
  });
});

describe('shapeValue — corruptValue is sound', () => {
  it('a corruption is always rejected by the reference validator', () => {
    let corrupted = 0;
    for (let i = 0; i < 1000; i++) {
      const s = safeSample(mixSeed(0x333, 'corrupt', i));
      if (!s) continue;
      const c = corruptValue(s.gen, s.value);
      if (!c) continue;
      corrupted++;
      const decls = declMap(s.gen);
      expect(conforms(s.gen.root, c.value, decls), `type=${JSON.stringify(s.gen)} corrupted=${String(c.value)}`).toBe(false);
      // original untouched
      expect(conforms(s.gen.root, s.value, decls)).toBe(true);
    }
    expect(corrupted).toBeGreaterThan(100);
  });
});

describe('shapeValue — validValue never throws on the wild space', () => {
  it('produces a value (or undefined) for any generated type without throwing', () => {
    for (let i = 0; i < 300; i++) {
      withSeededRandom(mixSeed(0x444, 'wild', i), () => {
        const gen = withSeededRandom(mixSeed(0x444, 'wild', i), () => genType());
        expect(() => validValue(gen)).not.toThrow();
      });
    }
  });
});
