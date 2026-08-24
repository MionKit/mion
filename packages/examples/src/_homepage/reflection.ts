import {getRunType, RunTypeKind} from '@ts-runtypes/core';

// One real type, the single source of truth.
type Order = {
  id: string;
  total: number;
  items: {sku: string; qty: number}[];
};

// Recover the actual RunType node, the traversable type graph TypeScript erased.
const orderRT = getRunType<Order>();

// Walk it like any tree: its kind, property names, nested children…
console.log(orderRT.kind === RunTypeKind.objectLiteral); // true
console.log(orderRT.children?.map((prop) => prop.name)); // ['id', 'total', 'items']
