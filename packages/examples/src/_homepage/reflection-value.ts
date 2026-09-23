import {getRunType} from '@mionjs/run-types';

// The same Order type as above, declared here so the example compiles on its own.
type Order = {
  id: string;
  total: number;
  items: {sku: string; qty: number}[];
};

// start-value
const order: Order = {id: 'A-1', total: 42, items: [{sku: 'WIDGET', qty: 2}]};

const orderRT = getRunType(order);
console.log(orderRT.children?.map((prop) => prop.name)); // ['id', 'total', 'items']
// end-value
