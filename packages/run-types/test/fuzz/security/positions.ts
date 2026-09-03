// Position walker for the JSON lane: pairs a generated type's shape with the
// PARSED JSON tree of a valid value and yields every position a dictionary
// attack can land on, with the kind that decides which entries apply.
//
// The walk follows the JSON WIRE shape, not the runtime value: a Date is a
// string here, a Map is an array of `[key, value]` pairs, a Set an array, and a
// union member sits inside its `[index, value]` envelope (or bare, when the
// flat layout can tell the members apart natively). Attacks are then spliced by
// path with `applyMutation`, so the mutated tree is exactly what an attacker's
// body would parse to.
//
// Positions under a union or an `any` carry `underCatchAll`, which downgrades
// `expect: 'reject'` to 'any' for them: a sibling arm or the catch-all may
// legitimately re-accept the payload.

import type {Decl, GeneratedType, PropShape, TypeShape} from '../core/typeGen.ts';
import {FORMAT_LEAVES} from '../core/typeGen.ts';
import type {AttackKind} from './attackDictionary.ts';
import {isEnvelope} from './attackDictionary.ts';

export interface Position {
  path: Array<string | number>;
  kind: AttackKind;
  /** The rendered shape kind, for the report. **/
  shapeKind: string;
  /** True under a union member / any / unknown, where a mis-accept is not provable. **/
  underCatchAll: boolean;
  /** Union positions: the member count. **/
  members?: number;
  /** Literal positions: the literal. **/
  literal?: unknown;
  /** Enum positions: the member values. **/
  enumValues?: unknown[];
  /** Optional property slots: true. **/
  optional?: boolean;
}

/** Every attackable position of `gen` over the parsed JSON tree `tree`. **/
export function collectPositions(gen: GeneratedType, tree: unknown): Position[] {
  const decls = new Map<string, Decl>();
  for (const decl of gen.decls) decls.set(decl.name, decl);
  const out: Position[] = [];
  walk(gen.root, tree, [], false, decls, out, new Set());
  return out;
}

function push(out: Position[], position: Position): void {
  out.push(position);
}

function walk(
  shape: TypeShape,
  node: unknown,
  path: Array<string | number>,
  catchAll: boolean,
  decls: Map<string, Decl>,
  out: Position[],
  seen: Set<string>
): void {
  const base = {path, underCatchAll: catchAll, shapeKind: shape.kind};
  switch (shape.kind) {
    case 'string':
      return push(out, {...base, kind: 'string'});
    case 'number':
      return push(out, {...base, kind: 'number'});
    case 'bigint':
      return push(out, {...base, kind: 'bigint'});
    case 'boolean':
      return push(out, {...base, kind: 'boolean'});
    case 'date':
      return push(out, {...base, kind: 'date'});
    case 'regexp':
      return push(out, {...base, kind: 'regexp'});
    case 'literal':
      return push(out, {...base, kind: 'literal', literal: shape.value});
    case 'null':
    case 'undefined':
    case 'void':
      return push(out, {...base, kind: 'optional'});
    case 'any':
    case 'unknown':
      return push(out, {...base, kind: 'any'});
    case 'format':
      return push(out, {...base, kind: FORMAT_LEAVES[shape.name].family === 'number' ? 'format-number' : 'format-string'});
    case 'array':
      push(out, {...base, kind: 'array'});
      if (Array.isArray(node)) node.forEach((item, i) => walk(shape.elem, item, [...path, i], catchAll, decls, out, seen));
      return;
    case 'set':
      push(out, {...base, kind: 'set'});
      if (Array.isArray(node)) node.forEach((item, i) => walk(shape.elem, item, [...path, i], catchAll, decls, out, seen));
      return;
    case 'map':
      push(out, {...base, kind: 'map'});
      if (Array.isArray(node)) {
        node.forEach((pair, i) => {
          if (!Array.isArray(pair)) return;
          walk(shape.key, pair[0], [...path, i, 0], catchAll, decls, out, seen);
          walk(shape.value, pair[1], [...path, i, 1], catchAll, decls, out, seen);
        });
      }
      return;
    case 'tuple':
      push(out, {...base, kind: 'tuple'});
      if (Array.isArray(node))
        shape.elems.forEach((elem, i) => i < node.length && walk(elem, node[i], [...path, i], catchAll, decls, out, seen));
      return;
    case 'record':
      push(out, {...base, kind: 'record'});
      if (isRecord(node))
        for (const key of Object.keys(node)) walk(shape.value, node[key], [...path, key], catchAll, decls, out, seen);
      return;
    case 'object':
      // The empty object type `{}` admits any non-null value, and the compact
      // decoder rebuilds it from zero slots whatever the wire held, so a
      // mis-accept there is not provable: no 'reject' claim on that position.
      push(out, {
        ...base,
        kind: shape.index ? 'record' : 'object',
        underCatchAll: catchAll || (dataProps(shape.props) === 0 && !shape.index),
      });
      if (isRecord(node)) {
        walkProps(shape.props, node, path, catchAll, decls, out, seen);
        if (shape.index) {
          const declared = new Set(shape.props.map((prop) => prop.name));
          for (const key of Object.keys(node))
            if (!declared.has(key)) walk(shape.index, node[key], [...path, key], catchAll, decls, out, seen);
        }
      }
      return;
    case 'intersection':
      push(out, {
        ...base,
        kind: 'object',
        underCatchAll: catchAll || shape.members.every((member) => member.kind !== 'object' || dataProps(member.props) === 0),
      });
      if (isRecord(node))
        for (const member of shape.members)
          if (member.kind === 'object') walkProps(member.props, node, path, catchAll, decls, out, seen);
      return;
    case 'union': {
      push(out, {...base, kind: 'union', members: shape.members.length});
      // Envelope: `[index, payload]` selects the member; `-1` is the merged
      // object bag, where every object member's props may be present.
      if (isEnvelope(node)) {
        const [index, payload] = node as [number, unknown];
        const inner = [...path, 1];
        if (index >= 0 && index < shape.members.length) walk(shape.members[index], payload, inner, true, decls, out, seen);
        else if (index === -1 && isRecord(payload)) {
          for (const member of shape.members) {
            const resolved = resolveObject(member, decls);
            if (resolved) walkProps(resolved, payload, inner, true, decls, out, seen);
          }
        }
        return;
      }
      // Bare: the flat layout told the members apart natively; descend into
      // the first member whose JSON shape matches the node.
      const match = shape.members.find((member) => matches(member, node, decls));
      if (match) walk(match, node, path, true, decls, out, seen);
      return;
    }
    case 'ref': {
      const decl = decls.get(shape.name);
      if (!decl || seen.has(shape.name)) return;
      const next = new Set(seen).add(shape.name);
      if (decl.kind === 'enum') return push(out, {...base, kind: 'enum', enumValues: enumValues(decl)});
      if (decl.kind === 'type') return walk(decl.shape, node, path, catchAll, decls, out, next);
      // interface / class: an object with declared props (an empty one admits
      // anything, see the object arm).
      push(out, {...base, kind: 'object', underCatchAll: catchAll || dataProps(decl.props) === 0});
      if (isRecord(node)) walkProps(decl.props, node, path, catchAll, decls, out, next);
      return;
    }
    default:
      // symbol / function / promise / never / typed arrays: not on the wire.
      return;
  }
}

function walkProps(
  props: PropShape[],
  node: Record<string, unknown>,
  path: Array<string | number>,
  catchAll: boolean,
  decls: Map<string, Decl>,
  out: Position[],
  seen: Set<string>
): void {
  for (const prop of props) {
    if (prop.method || prop.shape.kind === 'function') continue;
    if (!Object.prototype.hasOwnProperty.call(node, prop.name)) {
      if (prop.optional)
        out.push({path: [...path, prop.name], kind: 'optional', shapeKind: 'optional', underCatchAll: catchAll, optional: true});
      continue;
    }
    walk(prop.shape, node[prop.name], [...path, prop.name], catchAll, decls, out, seen);
  }
}

/** Props that reach the wire: methods and function-typed props drop off. **/
function dataProps(props: PropShape[]): number {
  return props.filter((prop) => !prop.method && prop.shape.kind !== 'function').length;
}

function resolveObject(shape: TypeShape, decls: Map<string, Decl>): PropShape[] | null {
  if (shape.kind === 'object') return shape.props;
  if (shape.kind === 'ref') {
    const decl = decls.get(shape.name);
    if (decl && (decl.kind === 'interface' || decl.kind === 'class')) return decl.props;
    if (decl && decl.kind === 'type') return resolveObject(decl.shape, decls);
  }
  return null;
}

function enumValues(decl: Decl & {kind: 'enum'}): unknown[] {
  let auto = 0;
  return decl.members.map((member) => {
    if (member.value === undefined) return auto++;
    if (typeof member.value === 'number') auto = member.value + 1;
    return member.value;
  });
}

function isRecord(node: unknown): node is Record<string, unknown> {
  return typeof node === 'object' && node !== null && !Array.isArray(node);
}

/** Rough JSON-shape match used to pick a bare union member. **/
function matches(shape: TypeShape, node: unknown, decls: Map<string, Decl>): boolean {
  switch (shape.kind) {
    case 'string':
    case 'date':
    case 'regexp':
    case 'bigint':
    case 'format':
      return typeof node === 'string' || (shape.kind === 'format' && typeof node === 'number');
    case 'number':
      return typeof node === 'number';
    case 'boolean':
      return typeof node === 'boolean';
    case 'null':
      return node === null;
    case 'literal':
      return node === shape.value;
    case 'array':
    case 'tuple':
    case 'set':
    case 'map':
      return Array.isArray(node);
    case 'object':
    case 'record':
    case 'intersection':
      return isRecord(node);
    case 'ref': {
      const decl = decls.get(shape.name);
      if (!decl) return false;
      if (decl.kind === 'enum') return typeof node === 'string' || typeof node === 'number';
      if (decl.kind === 'type') return matches(decl.shape, node, decls);
      return isRecord(node);
    }
    default:
      return false;
  }
}
