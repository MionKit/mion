import {getRunType, RunTypeKind} from '@ts-runtypes/core';

type Order = {
  id: string;
  total: number;
  items: {sku: string; qty: number}[];
};

// start-fields
// Pass the type (or a value, and it is inferred) to get the node.
const orderRT = getRunType<Order>();

console.log(orderRT.kind === RunTypeKind.objectLiteral); // true: an object shape
console.log(orderRT.children?.map((prop) => prop.name)); // ['id', 'total', 'items']

// Drill into one property: its `child` is that property's own type.
const itemsRT = orderRT.children?.find((prop) => prop.name === 'items');
console.log(itemsRT?.child?.kind === RunTypeKind.array); // true: items is an array
console.log(itemsRT?.child?.child?.kind === RunTypeKind.objectLiteral); // true: of {sku, qty}
// end-fields
