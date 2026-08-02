// Phase 2 value layer — generate a CONFORMING value for a generated type, and
// corrupt one to a provably-invalid one. Operates over the abstract
// GeneratedType (typeGen.ts), resolving named decls (interfaces / enums / types)
// and bounding recursion so circular types terminate.
//
// Only the SERIALISABLE projection of a type carries a value: methods /
// function-typed object properties are simply omitted — the validator drops them
// too, so the omission is faithful. `valueOracleSafe` is the STRICT gate the
// runner uses to decide whether the strong oracles may run at all: it excludes
// anything whose value-generation can't provably match the validator (any /
// unknown, primitive-bearing intersections, class refs, non-droppable
// non-serialisable positions); those types are policed by the robustness oracle.
//
// SOUNDNESS CONTRACT (mirrors invalidValue.ts, one-directional): when
// `corruptValue` returns a value, `validate<T>` on it MUST be false. Corruption
// only targets provably-invalidatable positions and never descends through a
// union / any / unknown (a sibling or catch-all could re-accept).

import type {Decl, GeneratedType, IndexKeyKind, PropShape, TypeShape} from '../core/typeGen.ts';
import {FORMAT_LEAVES} from '../core/typeGen.ts';

function rnd(): number {
  return Math.random();
}
function int(maxExclusive: number): number {
  return Math.floor(rnd() * maxExclusive);
}
function pick<T>(items: readonly T[]): T {
  return items[int(items.length)];
}
function chance(p: number): boolean {
  return rnd() < p;
}

const STRINGS = ['', 'a', 'hello world', 'with "quotes"', 'líne\nbreak', '🦊 unicode', 'tab\tsep', '0', 'null', '{}'];

function finiteNumber(): number {
  const flavour = int(4);
  if (flavour === 0) return int(1000) - 500;
  if (flavour === 1) return 0;
  if (flavour === 2) return (int(2) ? 1 : -1) * rnd() * 1e6;
  return (int(2) ? 1 : -1) * rnd();
}

interface ValueCtx {
  decls: Map<string, Decl>;
  budget: number; // recursion budget for refs
  floored: {hit: boolean}; // set when budget ran out (value may not fully conform)
  nodes: {count: number; cap: number}; // hard cap so recursive/array fan-out can't explode
}

function declMap(gen: GeneratedType): Map<string, Decl> {
  const map = new Map<string, Decl>();
  for (const decl of gen.decls) map.set(decl.name, decl);
  return map;
}

/** A conforming value plus whether recursion had to be truncated at the budget
 *  floor (in which case the value may not fully conform and the strong oracles
 *  should be skipped). **/
export function genValidValue(gen: GeneratedType): {value: unknown; floored: boolean} {
  const ctx: ValueCtx = {decls: declMap(gen), budget: 5, floored: {hit: false}, nodes: {count: 0, cap: 1200}};
  const value = valueOf(gen.root, ctx);
  return {value, floored: ctx.floored.hit};
}

/** A value conforming to the generated type's root (convenience over genValidValue). **/
export function validValue(gen: GeneratedType): unknown {
  return genValidValue(gen).value;
}

function valueOf(shape: TypeShape, ctx: ValueCtx): unknown {
  // Hard size cap — recursive `kids: Node[]` / nested arrays fan out
  // exponentially; once the budget is spent, collapse to a terminal value and
  // flag the truncation so the strong oracles are skipped.
  if (++ctx.nodes.count > ctx.nodes.cap) {
    ctx.floored.hit = true;
    return floorValue(shape);
  }
  switch (shape.kind) {
    case 'number':
      return finiteNumber();
    case 'string':
      return pick(STRINGS);
    case 'boolean':
      return chance(0.5);
    case 'bigint':
      return BigInt(int(1_000_000)) * BigInt(int(2) ? 1 : -1);
    case 'null':
      return null;
    case 'undefined':
    case 'void':
      return undefined;
    case 'date':
      return new Date(Date.UTC(2000 + int(40), int(12), 1 + int(28), int(24), int(60), int(60)));
    case 'regexp':
      return new RegExp(pick(['ab+c', '^x$', '[0-9]+', '.*']), pick(['', 'g', 'i', 'gi']));
    case 'literal':
      return shape.value;
    case 'any':
    case 'unknown':
      return pick([0, 'x', true, null, {a: 1}, [1, 2]] as const);
    case 'array': {
      const out: unknown[] = [];
      for (let i = 0, n = int(4); i < n; i++) out.push(valueOf(shape.elem, ctx));
      return out;
    }
    case 'tuple':
      return shape.elems.map((s) => valueOf(s, ctx));
    case 'set': {
      const set = new Set<unknown>();
      for (let i = 0, n = int(3); i < n; i++) set.add(valueOf(shape.elem, ctx));
      return set;
    }
    case 'map': {
      const map = new Map<unknown, unknown>();
      for (let i = 0, n = int(3); i < n; i++) map.set(valueOf(shape.key, ctx), valueOf(shape.value, ctx));
      return map;
    }
    case 'record': {
      const out: Record<string, unknown> = {};
      for (let i = 0, n = int(3); i < n; i++) out[`k${i}`] = valueOf(shape.value, ctx);
      return out;
    }
    case 'format':
      return pick(FORMAT_LEAVES[shape.name].valid);
    case 'not':
      // The generator only wraps format leaves; a counter value satisfies the
      // base kind while failing the negated format — exactly Not's valid set.
      if (shape.child.kind !== 'format') throw new Error('not-shape child must be a format leaf');
      return pick(FORMAT_LEAVES[shape.child.name].counter);
    case 'object':
      return objectValue(shape.props, shape.index, shape.indexKey, ctx);
    case 'union':
      return valueOf(pick(shape.members), ctx);
    case 'intersection':
      return intersectionValue(shape.members, ctx);
    case 'ref':
      return refValue(shape.name, ctx);
    // Non-serialisable at a value position — only reached when canValue is
    // false (robustness path); return a placeholder so we never throw.
    case 'function':
    case 'symbol':
    case 'promise':
    case 'never':
      return undefined;
  }
}

// Kinds the validator does NOT keep as data at a property position (dropped or
// otherwise not value-generated) — omitted from the generated value.
const NON_DATA_KINDS = new Set(['function', 'symbol', 'promise', 'never', 'void']);
function omitProp(prop: PropShape): boolean {
  return prop.method || NON_DATA_KINDS.has(prop.shape.kind);
}

function objectValue(
  props: PropShape[],
  index: TypeShape | undefined,
  indexKey: IndexKeyKind[] | undefined,
  ctx: ValueCtx
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const prop of props) {
    // Methods / function-typed members are dropped by the validator — omit them
    // so the value matches the validated projection.
    if (omitProp(prop)) continue;
    if (prop.optional && chance(0.4)) continue;
    out[prop.name] = valueOf(prop.shape, ctx);
  }
  if (index) {
    // Each index key must MATCH the declared key kind, or the value doesn't
    // conform: a non-numeric key under a `[k: number]` index is corrupted by the
    // binary number-index codec (it encodes numeric keys as numbers). A union
    // key picks a kind per entry. Symbol keys are dropped by JSON and by the
    // serializers, so they add no round-trip coverage — skip them (a symbol-only
    // index yields no entries). createMockDataFn keys on the resolved RunType's
    // index kind; this is the shape-lane equivalent.
    const kinds = (indexKey ?? ['string']).filter((kind) => kind !== 'symbol');
    if (kinds.length) {
      for (let i = 0, n = int(3); i < n; i++) {
        out[pick(kinds) === 'number' ? i : `idx${i}`] = valueOf(index, ctx);
      }
    }
  }
  return out;
}

function intersectionValue(members: TypeShape[], ctx: ValueCtx): unknown {
  const out: Record<string, unknown> = {};
  for (const member of members) {
    const v = valueOf(member, ctx);
    if (v && typeof v === 'object' && !Array.isArray(v)) Object.assign(out, v);
  }
  return out;
}

function refValue(name: string, ctx: ValueCtx): unknown {
  const decl = ctx.decls.get(name);
  if (!decl) return undefined;
  if (decl.kind === 'enum') {
    const member = pick(decl.members);
    const index = decl.members.indexOf(member);
    return member.value !== undefined ? member.value : index; // auto-numbered === declaration index
  }
  if (decl.kind === 'type') return valueOf(decl.shape, ctx);
  if (decl.kind === 'class') return undefined; // class instances aren't value-generated (robustness path)
  // interface — bounded recursion. At the floor, emit a TERMINAL object (no
  // further ref expansion) and flag the truncation.
  if (ctx.budget <= 0) {
    ctx.floored.hit = true;
    return minimalObject(decl.props, ctx);
  }
  // A declared interface carries no index signature, so no index key set.
  return objectValue(decl.props, undefined, undefined, {...ctx, budget: ctx.budget - 1});
}

// At the recursion floor: required serialisable props get a TERMINAL value
// (floorValue never re-expands refs/objects), optional / method / non-serialisable
// props are omitted.
function minimalObject(props: PropShape[], ctx: ValueCtx): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const prop of props) {
    if (prop.optional || omitProp(prop)) continue;
    out[prop.name] = floorValue(prop.shape);
  }
  return out;
}

// A fully TERMINAL value — never recurses through refs/objects, so it always
// halts. Only tuple/union recurse, and both strictly shrink.
function floorValue(shape: TypeShape): unknown {
  switch (shape.kind) {
    case 'number':
      return 0;
    case 'string':
      return '';
    case 'boolean':
      return false;
    case 'bigint':
      return 0n;
    case 'null':
      return null;
    case 'date':
      return new Date(0);
    case 'regexp':
      return /x/;
    case 'literal':
      return shape.value;
    case 'any':
    case 'unknown':
      return null;
    case 'array':
      return [];
    case 'set':
      return new Set();
    case 'map':
      return new Map();
    case 'record':
    case 'object':
    case 'intersection':
    case 'ref':
      return {};
    case 'format':
      return FORMAT_LEAVES[shape.name].valid[0];
    case 'not':
      return shape.child.kind === 'format' ? FORMAT_LEAVES[shape.child.name].counter[0] : undefined;
    case 'tuple':
      return shape.elems.map(floorValue);
    case 'union':
      return floorValue(shape.members[0]);
    default:
      return undefined; // undefined / void / function / symbol / promise / never
  }
}

// =============================================================================
// valueOracleSafe — STRICT gate for the strong value oracles.
// =============================================================================
//
// True only for types whose value-generation provably matches the validator's
// expectation. Deliberately conservative: anything ambiguous (any / unknown,
// intersections containing a primitive — which collapse to a BRANDED primitive
// the validator checks as that primitive — symbols, functions at value
// positions, class refs) is excluded and policed by the robustness probe
// instead. Object properties that the validator DROPS (methods / function-typed
// props, a build-time Warning) are fine — value-gen omits them too.

const SAFE_LEAF = new Set(['number', 'string', 'boolean', 'bigint', 'null', 'undefined', 'date', 'regexp', 'literal']);

/** A property the validator silently drops (so omitting it in value-gen is
 *  faithful). Methods and bare function-typed props only — symbols / promises
 *  ERROR rather than drop, so they are NOT safe. **/
function isDroppableProp(prop: PropShape): boolean {
  return prop.method || prop.shape.kind === 'function';
}

export function valueOracleSafe(gen: GeneratedType): boolean {
  return safe(gen.root, declMap(gen), new Set());
}

function safe(shape: TypeShape, decls: Map<string, Decl>, seen: Set<string>): boolean {
  if (SAFE_LEAF.has(shape.kind)) return true;
  switch (shape.kind) {
    case 'any':
    case 'unknown':
    case 'symbol':
    case 'function':
    case 'promise':
    case 'never':
    case 'void':
      return false;
    case 'array':
    case 'set':
      return safe(shape.elem, decls, seen);
    case 'record':
      return safe(shape.value, decls, seen);
    case 'map':
      return safe(shape.key, decls, seen) && safe(shape.value, decls, seen);
    case 'tuple':
      return shape.elems.every((s) => safe(s, decls, seen));
    case 'union':
      return shape.members.every((s) => safe(s, decls, seen));
    case 'format':
      return true; // exact valid/counter pools — strong oracles hold
    case 'not':
      return shape.child.kind === 'format';
    case 'intersection':
      // ONLY pure-object intersections (a clean structural merge). A primitive
      // member would make the whole thing a branded primitive — out of scope.
      return shape.members.every((s) => s.kind === 'object' && safe(s, decls, seen));
    case 'object':
      if (shape.index && !safe(shape.index, decls, seen)) return false;
      return shape.props.every((p) => isDroppableProp(p) || safe(p.shape, decls, seen));
    case 'ref': {
      if (seen.has(shape.name)) return false; // recursion is excluded upstream; be conservative
      const decl = decls.get(shape.name);
      if (!decl || decl.kind === 'class') return false;
      if (decl.kind === 'enum') return true;
      const next = new Set(seen).add(shape.name);
      if (decl.kind === 'type') return safe(decl.shape, decls, next);
      return decl.props.every((p) => isDroppableProp(p) || safe(p.shape, decls, next)); // interface
    }
  }
  return false; // unreachable — leaf kinds returned above; keeps the switch total
}

// =============================================================================
// corruptValue — one provably-invalid mutation.
// =============================================================================

function disjointValue(shape: TypeShape): unknown {
  // Format / negation leaves: corrupt by violating the BASE kind — a same-kind
  // junk value could still satisfy the brand (`'__invalid__'` has length ≥ 3)
  // or its negation, so only the cross-kind replacement is provably rejected.
  const formatChild =
    shape.kind === 'format' ? shape : shape.kind === 'not' && shape.child.kind === 'format' ? shape.child : null;
  if (formatChild) return FORMAT_LEAVES[formatChild.name].family === 'string' ? 1234567 : '__invalid__';
  const acceptsString = shape.kind === 'string' || (shape.kind === 'literal' && typeof shape.value === 'string');
  return acceptsString ? 1234567 : '__invalid__';
}

interface CorruptionSite {
  shape: TypeShape;
  set: (replacement: unknown) => void;
}

// Walk (shape, value) collecting positions corruptible in isolation. Skips
// unions / any / unknown (a sibling/catch-all may re-accept) and refs/objects
// only when the value shape matches, so we never index a mismatched value.
function collectSites(
  shape: TypeShape,
  value: unknown,
  set: (v: unknown) => void,
  decls: Map<string, Decl>,
  out: CorruptionSite[]
): void {
  switch (shape.kind) {
    case 'union':
    case 'any':
    case 'unknown':
    case 'symbol':
    case 'function':
    case 'promise':
    case 'never':
    case 'void':
      return;
    case 'ref': {
      const decl = decls.get(shape.name);
      if (!decl || decl.kind === 'class') return;
      out.push({shape, set});
      if (decl.kind === 'enum') return;
      if (decl.kind === 'type') return collectSites(decl.shape, value, set, decls, out);
      if (decl.kind === 'interface' && value && typeof value === 'object')
        collectObjectProps(decl.props, value as Record<string, unknown>, decls, out);
      return;
    }
    case 'object':
      out.push({shape, set});
      if (value && typeof value === 'object') collectObjectProps(shape.props, value as Record<string, unknown>, decls, out);
      return;
    case 'array':
      out.push({shape, set});
      if (Array.isArray(value))
        value.forEach((_v, i) => collectSites(shape.elem, value[i], (r) => ((value as unknown[])[i] = r), decls, out));
      return;
    case 'tuple':
      out.push({shape, set});
      if (Array.isArray(value))
        shape.elems.forEach((s, i) => collectSites(s, value[i], (r) => ((value as unknown[])[i] = r), decls, out));
      return;
    default:
      // scalars, literal, date, regexp, map, set, record, intersection — the
      // node itself is a corruptible position (replace with a disjoint value).
      out.push({shape, set});
  }
}

function collectObjectProps(
  props: PropShape[],
  obj: Record<string, unknown>,
  decls: Map<string, Decl>,
  out: CorruptionSite[]
): void {
  for (const prop of props) {
    if (!Object.prototype.hasOwnProperty.call(obj, prop.name)) continue;
    collectSites(prop.shape, obj[prop.name], (r) => (obj[prop.name] = r), decls, out);
  }
}

export interface Corruption {
  value: unknown;
  proven: boolean;
}

/** Corrupt a valid value at exactly one provably-invalid position. Returns null
 *  when no such position exists. The input is not mutated. **/
export function corruptValue(gen: GeneratedType, value: unknown): Corruption | null {
  const clone = structuredClone(value);
  const holder = {root: clone};
  const sites: CorruptionSite[] = [];
  collectSites(gen.root, clone, (v) => (holder.root = v), declMap(gen), sites);
  // Only corrupt positions whose disjoint replacement is provably rejected —
  // scalars/literal/date/regexp/object/array/tuple/ref. Map/Set/record/
  // intersection replacements with a bare string are also rejected, so keep
  // them. (collectSites already excluded union/any/unknown/non-serialisable.)
  if (sites.length === 0) return null;
  const site = sites[int(sites.length)];
  site.set(disjointValue(site.shape));
  return {value: holder.root, proven: true};
}
