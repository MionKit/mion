import {initClient, batch} from '@mionjs/client';
import type {MyApi} from './batch-orders.routes.ts';

const {routes} = initClient<MyApi>({baseURL: 'http://localhost:3000'});

// returns [result, error, undeclared, middleFnResults, middleFnErrors]
const [user, error] = await routes.users.getById('USER-123').call();

if (error?.type === 'user-not-found')
  console.log('User not found:', error.errorData?.requestedId);
else console.log('User:', user?.name);

// returns [[results...], [errors...], undeclared, middleFnResults, middleFnErrors]; one undeclared per batch
const [[user2, order], [userError, orderError]] = await batch([
  routes.users.getById('USER-123'),
  routes.orders.getById('ORDER-1'),
]).call();

if (userError) console.log('User error:', userError.publicMessage);
else console.log('User:', user2?.name);

if (orderError) console.log('Order error:', orderError.publicMessage);
else console.log('Order:', order?.id);
