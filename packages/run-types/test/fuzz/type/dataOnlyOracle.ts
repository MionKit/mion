// D4: `DataOnly<T>` (TypeScript) and `reflection.NonDataOf` (Go) make one decision twice, so they must agree on a
// random T. Root: a `never` projection means T's validator throws. Answers: both validators give the same verdict on
// the mock and its mutations. Members: each object keeps the same member names, the DataOnly side read off its own
// reflection and the T side off the `notSupported` flags the Go side sets.

import type {RunType} from '../../../src/runtypes/types.ts';
import {RunTypeKind, RunTypeSubKind} from '../../../src/go-generated/runTypeKind.generated.ts';
import type {Violation} from '../value/fuzzOracle.ts';
import {snapshot} from '../value/fuzzOracle.ts';
import {copyTree, type DiagContext} from './diagOracle.ts';

/** `DataOnly` stops projecting past this many levels and keeps the rest as is. **/
const DATA_ONLY_DEPTH = 8;
const MAX_MUTATIONS = 16;
const MUTATION_DEPTH = 3;

export type Resolve = (node: RunType) => RunType | undefined;

/** A validator's verdict, or the code-less marker for a throw. **/
export type Verdict = boolean | 'throws';

function violation(message: string, ctx: DiagContext, value: unknown = ctx.source): Violation {
  return {oracle: 'D4', target: ctx.target, seed: ctx.seed, phase: 'valid', message, value: snapshot(value)};
}

/** Root: a `DataOnly<T>` of `never` means T has no data at all, so T's validator must throw. **/
export function checkDataOnlyRoot(
  typeKind: number,
  dataOnlyKind: number,
  typeValidateThrows: boolean,
  ctx: DiagContext
): Violation | null {
  // A written `never` compiles to a check that always fails, on both sides.
  if (dataOnlyKind !== RunTypeKind.never || typeKind === RunTypeKind.never || typeValidateThrows) return null;
  return violation("DataOnly<T> is never, but T's validator builds and runs without throwing", ctx);
}

/** Answers: the two validators agree on every sample. **/
export function checkDataOnlyAnswers(
  samples: readonly {label: string; value: unknown}[],
  validate: (value: unknown) => Verdict,
  validateDataOnly: (value: unknown) => Verdict,
  ctx: DiagContext
): Violation | null {
  for (const {label, value} of samples) {
    const typeVerdict = validate(value);
    const dataOnlyVerdict = validateDataOnly(value);
    if (typeVerdict !== dataOnlyVerdict)
      return violation(
        `validate<T> says ${typeVerdict} but validate<DataOnly<T>> says ${dataOnlyVerdict} on the ${label}`,
        ctx,
        value
      );
  }
  return null;
}

/** Members: every object keeps the same member names, in step down both reflections. **/
export function checkDataOnlyMembers(type: RunType, dataOnly: RunType, resolve: Resolve, ctx: DiagContext): Violation | null {
  const mismatches = memberMismatches(type, dataOnly, resolve);
  if (mismatches.length === 0) return null;
  return violation(`T and DataOnly<T> keep different members: ${mismatches.slice(0, 4).join('; ')}`, ctx);
}

export function runVerdict(fn: ((value: unknown) => unknown) | undefined, value: unknown): Verdict {
  if (!fn) return 'throws';
  try {
    return fn(copyTree(value)) === true;
  } catch {
    return 'throws';
  }
}

export function memberMismatches(
  type: RunType,
  dataOnly: RunType,
  resolve: Resolve,
  path = '$',
  depth = 0,
  seen = new Set<string>()
): string[] {
  const typeNode = deref(type, resolve);
  const dataOnlyNode = deref(dataOnly, resolve);
  if (!typeNode || !dataOnlyNode || depth >= DATA_ONLY_DEPTH) return [];
  const pairKey = `${typeNode.id}|${dataOnlyNode.id}`;
  if (seen.has(pairKey)) return [];
  seen.add(pairKey);
  const recurse = (typeChild: RunType | undefined, dataOnlyChild: RunType | undefined, childPath: string) =>
    typeChild && dataOnlyChild ? memberMismatches(typeChild, dataOnlyChild, resolve, childPath, depth + 1, seen) : [];

  if (isObjectShape(typeNode)) {
    // DataOnly projects a class to a plain object, so only the side's object-ness is compared.
    if (!isObjectShape(dataOnlyNode)) return [`${path}: an object in T is kind ${kindName(dataOnlyNode)} in DataOnly<T>`];
    const typeMembers = keptMembers(typeNode, resolve, true);
    const dataOnlyMembers = keptMembers(dataOnlyNode, resolve, false);
    const out: string[] = [];
    for (const name of typeMembers.named.keys())
      if (!dataOnlyMembers.named.has(name)) out.push(`${path}.${name} is kept in T but dropped by DataOnly<T>`);
    for (const name of dataOnlyMembers.named.keys())
      if (!typeMembers.named.has(name)) out.push(`${path}.${name} is kept by DataOnly<T> but dropped in T`);
    if (typeMembers.indexes.length !== dataOnlyMembers.indexes.length)
      out.push(
        `${path} keeps ${typeMembers.indexes.length} index signature(s) in T, ${dataOnlyMembers.indexes.length} in DataOnly<T>`
      );
    for (const [name, member] of typeMembers.named) {
      const other = dataOnlyMembers.named.get(name);
      if (!other) continue;
      if (Boolean(member.optional) !== Boolean(other.optional))
        out.push(
          `${path}.${name} is ${member.optional ? '' : 'not '}optional in T but ${other.optional ? '' : 'not '}in DataOnly<T>`
        );
      out.push(...recurse(member.child, other.child, `${path}.${name}`));
    }
    typeMembers.indexes.forEach((index, position) =>
      out.push(...recurse(index.child, dataOnlyMembers.indexes[position]?.child, `${path}[key]`))
    );
    return out;
  }
  if (typeNode.kind === RunTypeKind.array && dataOnlyNode.kind === RunTypeKind.array)
    return recurse(typeNode.child, dataOnlyNode.child, `${path}[]`);
  if (typeNode.kind === RunTypeKind.tuple && dataOnlyNode.kind === RunTypeKind.tuple)
    return (typeNode.children ?? []).flatMap((member, position) =>
      recurse(deref(member, resolve)?.child, deref(dataOnlyNode.children?.[position], resolve)?.child, `${path}[${position}]`)
    );
  // Unions, Maps and Sets: TypeScript may reorder or merge members after the projection, so the answers check covers them.
  return [];
}

/** Plain objects and user classes; Date / Map / Set / Temporal ride a SubKind and are not member lists. **/
function isObjectShape(node: RunType): boolean {
  return node.kind === RunTypeKind.objectLiteral || (node.kind === RunTypeKind.class && node.subKind === RunTypeSubKind.none);
}

/** The members a node keeps as data; only T's side reads the Go `notSupported` flags, DataOnly's side keeps what it reflects. **/
function keptMembers(
  node: RunType,
  resolve: Resolve,
  goDropsNonData: boolean
): {named: Map<string, RunType>; indexes: RunType[]} {
  const named = new Map<string, RunType>();
  const indexes: RunType[] = [];
  for (const childRef of node.children ?? []) {
    const member = deref(childRef, resolve);
    if (!member || member.isStatic) continue;
    if (goDropsNonData && (member.notSupported || deref(member.child, resolve)?.notSupported)) continue;
    if (member.kind === RunTypeKind.indexSignature) {
      // A symbol key is never enumerated, so neither side keeps it as data.
      if (deref(member.index, resolve)?.kind !== RunTypeKind.symbol) indexes.push(member);
      continue;
    }
    if (member.kind !== RunTypeKind.property && member.kind !== RunTypeKind.propertySignature) continue;
    const name = String(member.name ?? '');
    if (name === '' || name === '__proto__' || isSymbolKeyedName(name)) continue;
    named.set(name, member);
  }
  return {named, indexes};
}

/** The Go side's spelling of a symbol-keyed member name (reflection.IsSymbolKeyedName). **/
function isSymbolKeyedName(name: string): boolean {
  return name.startsWith('@@') || ((name.charCodeAt(0) === 0xfe || name.charCodeAt(0) === 0xfffd) && name[1] === '@');
}

function deref(node: RunType | undefined, resolve: Resolve): RunType | undefined {
  let current = node;
  for (let hops = 0; current && current.kind === RunTypeKind.ref && hops < 16; hops++) current = resolve(current);
  return current;
}

function kindName(node: RunType): string {
  return Object.entries(RunTypeKind).find(([, value]) => value === node.kind)?.[0] ?? String(node.kind);
}

/** Copies of `value` with one member removed or set to a wrong-typed value, down to a few levels. **/
export function mutationsOf(value: unknown): {label: string; value: unknown}[] {
  const out: {label: string; value: unknown}[] = [];
  const visit = (node: unknown, path: (string | number)[]) => {
    if (out.length >= MAX_MUTATIONS || path.length >= MUTATION_DEPTH || node === null || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      if (node.length > 0) visit(node[0], [...path, 0]);
      return;
    }
    if (Object.getPrototypeOf(node) !== Object.prototype) return;
    for (const key of Object.keys(node)) {
      if (out.length >= MAX_MUTATIONS) return;
      const original = (node as Record<string, unknown>)[key];
      const label = [...path, key].join('.');
      out.push({label: `mock with ${label} removed`, value: mutateAt(value, [...path, key], undefined, true)});
      out.push({label: `mock with ${label} wrong-typed`, value: mutateAt(value, [...path, key], wrongTyped(original), false)});
      visit(original, [...path, key]);
    }
  };
  visit(value, []);
  return out;
}

function wrongTyped(original: unknown): unknown {
  return typeof original === 'number' ? 'not a number' : 404.5;
}

function mutateAt(root: unknown, path: (string | number)[], replacement: unknown, remove: boolean): unknown {
  const copy = copyTree(root);
  let parent = copy as Record<string | number, unknown>;
  for (const step of path.slice(0, -1)) parent = parent[step] as Record<string | number, unknown>;
  const last = path[path.length - 1];
  if (remove) delete parent[last];
  else parent[last] = replacement;
  return copy;
}
