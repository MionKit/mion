import {initClient} from '@mionjs/client';
import type {MyApi} from './sum.routes.ts';

const {routes} = initClient<MyApi>({baseURL: 'http://localhost:3000'});

const [sum, error] = await routes.utils.sum(5, 2).call();

if (error) {
  console.log('Error:', error.publicMessage);
} else {
  console.log(sum); // 7
}
