// Raw driver rows per dialect, in the shape each real driver sends them, and the values the client should get back.
import type {Dialect} from './routeVariants.ts';

export const ANN = '793aff46-42ac-4372-b7fa-c48ba48ed94f';
export const BOB = '0f8fad5b-d9cb-469f-a165-70867728950e';
export const POST = '7c9e6679-7425-40de-944b-e07fc1f90ae7';
export const CREATED = new Date('2026-01-02T03:04:05Z');

export interface Fixture {
  user(id: string, name: string, balance: bigint): unknown[];
  post(published: boolean): unknown[];
  /** A post as a relation query nests it inside the user row. */
  nestedPost(published: boolean): unknown;
  /** The nested posts cell of a relation query row. */
  nestedPosts(posts: unknown[]): unknown;
  balance(id: string, balance: bigint): unknown[];
  stats: {raw: unknown[]; avgAge: string};
}

/** What a mysql write answers instead of rows: the result header. */
export const MYSQL_WRITE = [{insertId: 0, affectedRows: 1}] as unknown as unknown[][];

const pgDate = '2026-01-02 03:04:05';
const tags = ['a', 'b'];

export const FIXTURES: Record<Dialect, Fixture> = {
  pg: {
    user: (id, name, balance) => [id, name, 'ann@x.io', 30, 'admin', true, String(balance), pgDate],
    post: (published) => [POST, ANN, 'Hello', tags, 150, published ? pgDate : null],
    nestedPost: (published) => [POST, ANN, 'Hello', tags, 150, published ? '2026-01-02T03:04:05' : null],
    nestedPosts: (posts) => posts,
    balance: (id, balance) => [id, String(balance)],
    stats: {raw: ['admin', '2', '30.5000000000000000', 40], avgAge: '30.5000000000000000'},
  },
  mysql: {
    user: (id, name, balance) => [id, name, 'ann@x.io', 30, 'admin', 1, String(balance), pgDate],
    // mysql2 parses json columns itself
    post: (published) => [POST, ANN, 'Hello', tags, 150, published ? pgDate : null],
    nestedPost: (published) => [POST, ANN, 'Hello', tags, 150, published ? '2026-01-02 03:04:05.000000' : null],
    nestedPosts: (posts) => posts,
    balance: (id, balance) => [id, String(balance)],
    stats: {raw: ['admin', 2, '30.5000', 40], avgAge: '30.5000'},
  },
  sqlite: {
    user: (id, name, balance) => [id, name, 'ann@x.io', 30, 'admin', 1, Buffer.from(String(balance)), CREATED.getTime() / 1000],
    post: (published) => [POST, ANN, 'Hello', JSON.stringify(tags), 150, published ? CREATED.getTime() / 1000 : null],
    nestedPost: (published) => [POST, ANN, 'Hello', JSON.stringify(tags), 150, published ? CREATED.getTime() / 1000 : null],
    nestedPosts: (posts) => JSON.stringify(posts),
    balance: (id, balance) => [id, Buffer.from(String(balance))],
    stats: {raw: ['admin', 2, 30.5, 40], avgAge: '30.5'},
  },
};

export const expectedUser = (id: string, name: string, balance: bigint) => ({
  id,
  name,
  email: 'ann@x.io',
  age: 30,
  role: 'admin',
  active: true,
  balance,
  createdAt: CREATED,
});

export const expectedPost = (published: boolean) => ({
  id: POST,
  authorId: ANN,
  title: 'Hello',
  tags,
  views: 150,
  publishedAt: published ? CREATED : null,
});
