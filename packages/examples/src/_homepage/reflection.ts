import {RunTypeKind} from '@mionjs/run-types';
import {getRunType} from '@mionjs/run-types';

type Order = {
  id: string;
  total: number;
  items: {sku: string; qty: number}[];
};

// the type graph TypeScript erased
const orderRT = getRunType<Order>();

console.log(orderRT.kind === RunTypeKind.objectLiteral); // true
console.log(orderRT.children?.map((prop) => prop.name)); // ['id', 'total', 'items']
