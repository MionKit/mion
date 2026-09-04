import {initClient} from '@mionjs/client';
import type {SumApi} from './sum.routes.ts';

const {routes} = initClient<SumApi>({baseURL: 'http://localhost:3000'});

// calls the sum route in the server
const [sum, error] = await routes.utils.sum(5, 2).call();

if (error) {
  console.log('Error:', error.publicMessage);
} else {
  console.log(sum); // 7
}
