import {initClient, batch} from '@mionjs/client';
import type {MyApi} from './batch-orders.routes.ts';

const {routes} = initClient<MyApi>({baseURL: 'http://localhost:3000'});

const [[user, , response], [, orderError]] = await batch([
  routes.users.getById('USER-123'),
  routes.orders.getById('ORDER-404'), // returns order-not-found
]).call();

if (user) console.log('User:', user.name); // John
if (orderError?.type === 'order-not-found')
  console.log('No order:', orderError.errorData?.requestedId);

// a timeout or a thrown error leaves every result and error undefined
for (const thrown of response['@thrownErrors'] ?? [])
  console.log('Batch failed:', thrown.publicMessage);
