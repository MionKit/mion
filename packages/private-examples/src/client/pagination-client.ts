import {initClient} from '@mionjs/client';
import type {Pagination, PaginationApi} from '../router/pagination.routes.ts';

const {routes} = initClient<PaginationApi>({baseURL: 'http://localhost:3000'});

// one call: the route's items, and the pagination middleware's result by its id
const [products, error, , middlewareResults] = await routes.products
  .list(2)
  .call();
const pagination = middlewareResults?.['products/pagination'] as
  | Pagination
  | undefined;

if (!error) console.log(products?.length, 'of', pagination?.total);
