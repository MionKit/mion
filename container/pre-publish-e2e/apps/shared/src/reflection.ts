// Family 3 — Reflection / typeIds. Mirrors guide/markers-reflection.ts +
// runtype-fields.ts + runtype-walk.ts. Covers BOTH marker call shapes
// (static getRunTypeId<T>() and value-first getRunTypeId(value)) with a
// convergence assertion — the CLAUDE.md marker rule.
import {getRunTypeId, getRunType, RunTypeKind, type RunType} from '@ts-runtypes/core';
import {type CheckResult, eq, ok} from './check';

interface Order {
  id: string;
  total: number;
  items: {sku: string; qty: number}[];
}

// Static form — the caller supplies T, no value.
export const orderIdStatic = getRunTypeId<Order>();
export const stringId = getRunTypeId<string>();

// Value-first form — T is inferred from a value (read only for its type).
const sampleOrder: Order = {id: 'o-1', total: 42, items: [{sku: 'TS-7', qty: 2}]};
export const orderIdFromValue = getRunTypeId(sampleOrder);

// getRunType — the value-bearing twin, both shapes again.
export const orderRtStatic = getRunType<Order>();
export const orderRtFromValue = getRunType(sampleOrder);

// A minimal walk over the node graph (single-child kinds recurse via `child`).
function arrayElementKind(node: RunType): number | undefined {
  const items = node.children?.find((prop) => prop.name === 'items');
  return items?.child?.child?.kind as number | undefined;
}

export function checkReflection(): CheckResult[] {
  return [
    ok('reflection: static typeId is a non-empty string', typeof orderIdStatic === 'string' && orderIdStatic.length > 0),
    ok('reflection: value-first typeId is a non-empty string', typeof orderIdFromValue === 'string' && orderIdFromValue.length > 0),
    // Convergence: both call shapes resolve to the SAME id for equal T.
    eq('reflection: static id ≡ value-first id (same T)', orderIdStatic, orderIdFromValue),
    ok('reflection: distinct types get distinct ids', orderIdStatic !== stringId),
    ok('reflection: getRunType walks to an object shape', orderRtStatic.kind === RunTypeKind.objectLiteral),
    eq('reflection: items[] element is an object', arrayElementKind(orderRtStatic), RunTypeKind.objectLiteral as number),
    ok('reflection: getRunType static ≡ value-first kind', orderRtStatic.kind === orderRtFromValue.kind),
  ];
}
