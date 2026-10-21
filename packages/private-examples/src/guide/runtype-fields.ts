import {RunTypeKind} from '@mionjs/run-types';
import {getRunType} from '@mionjs/run-types';

type Order = {
  id: string;
  total: number;
  items: {sku: string; qty: number}[];
};

// start-fields
// pass the type, or a value to infer it from
const orderRT = getRunType<Order>();

console.log(orderRT.kind === RunTypeKind.objectLiteral); // true: an object shape
console.log(orderRT.children?.map((prop) => prop.name)); // ['id', 'total', 'items']

// a property's `child` is its own type
const itemsRT = orderRT.children?.find((prop) => prop.name === 'items');
console.log(itemsRT?.child?.kind === RunTypeKind.array); // true: items is an array
console.log(itemsRT?.child?.child?.kind === RunTypeKind.objectLiteral); // true: of {sku, qty}
// end-fields
