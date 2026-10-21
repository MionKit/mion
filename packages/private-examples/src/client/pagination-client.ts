import {isRpcError} from '@mionjs/core';
import {initClient} from '@mionjs/client';
import type {PaginationApi} from '../router/pagination.routes.ts';

const {routes} = initClient<PaginationApi>({baseURL: 'http://localhost:3000'});

// one call: the route's items, and the pagination middleware's answer at its path
const [products, error, response] = await routes.products.list(2).call();
const pagination = response.products?.pagination;

if (!error && pagination && !isRpcError(pagination))
  console.log(products?.length, 'of', pagination.total);
