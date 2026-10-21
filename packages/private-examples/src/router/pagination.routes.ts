import {createMionRouter, Routes} from '@mionjs/router';

export type Product = {id: string; name: string};
export type Pagination = {page: number; pageSize: number; total: number};

declare function findProducts(
  page: number,
  pageSize: number
): {items: Product[]; total: number};

const mion = createMionRouter({
  contextDataFactory: (): {pagination?: Pagination} => ({}),
});

const routes = {
  products: {
    // returns only the items, and leaves the page info in the context
    list: mion.route((ctx, page: number): Product[] => {
      const {items, total} = findProducts(page, 20);
      ctx.shared.pagination = {page, pageSize: 20, total};
      return items;
    }),
    // declared after the routes of `products`: runs after each of them, and only them
    pagination: mion.middleware(
      (ctx): Pagination | void => ctx.shared.pagination
    ),
  },
} satisfies Routes;

const api = mion.initRoutes(routes);

export type PaginationApi = typeof api;
