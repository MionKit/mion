// Type-only pins, checked by `typecheck:test`: what the client sees from each route.
import type {AppClient} from '../src/client/client.ts';
import type * as Pg from '../src/db/pg.builders.ts';
import type * as PgTypes from '../src/db/pg.types.ts';
import type * as Mysql from '../src/db/mysql.builders.ts';
import type * as MysqlTypes from '../src/db/mysql.types.ts';
import type * as Sqlite from '../src/db/sqlite.builders.ts';
import type * as SqliteTypes from '../src/db/sqlite.types.ts';

type Equal<X, Y> = (<T>() => T extends X ? 1 : 2) extends <T>() => T extends Y ? 1 : 2 ? true : false;
type Expect<T extends true> = T;

type Group<D extends 'pg' | 'mysql' | 'sqlite', V extends 'drizzle' | 'types' | 'builders'> = AppClient[D][V];
type Answer<G, K extends keyof G> = G[K] extends (...args: any[]) => {call(): Promise<infer R>}
  ? R extends [infer Value, ...unknown[]]
    ? Value
    : never
  : never;
type Params<G, K extends keyof G> = G[K] extends (...args: infer P) => unknown ? P : never;
// `User & {posts: Post[]}` and drizzle's flat relation row hold the same fields, so rows compare flattened
type Flat<T> = {[K in keyof T]: T[K]} & {};
type Rows<T> = T extends (infer Row)[] ? Flat<Row>[] : T;

// builder and type-form tables give the client the same params and answers, route by route
type SameRoutes<A, B> = {
  [K in keyof A & keyof B]: [Equal<Rows<Answer<A, K>>, Rows<Answer<B, K>>>, Equal<Params<A, K>, Params<B, K>>];
};
type AllTrue<T> = {[K in keyof T]: [true, true]};
export type FormPins = [
  Expect<Equal<SameRoutes<Group<'pg', 'builders'>, Group<'pg', 'types'>>, AllTrue<Group<'pg', 'builders'>>>>,
  Expect<Equal<SameRoutes<Group<'mysql', 'builders'>, Group<'mysql', 'types'>>, AllTrue<Group<'mysql', 'builders'>>>>,
  Expect<Equal<SameRoutes<Group<'sqlite', 'builders'>, Group<'sqlite', 'types'>>, AllTrue<Group<'sqlite', 'builders'>>>>,
  Expect<Equal<PgTypes.User, Pg.User>>,
  Expect<Equal<MysqlTypes.User, Mysql.User>>,
  Expect<Equal<SqliteTypes.User, Sqlite.User>>,
  Expect<Equal<SqliteTypes.Post, Sqlite.Post>>,
];

// the slim models reach the client with their formats
export type ModelPins = [
  Expect<Equal<Answer<Group<'pg', 'builders'>, 'listUsers'>, Pg.User[] | undefined>>,
  Expect<Equal<Answer<Group<'mysql', 'builders'>, 'listUsers'>, Mysql.User[] | undefined>>,
  Expect<Equal<Answer<Group<'sqlite', 'builders'>, 'adults'>, Sqlite.AdultUser[] | undefined>>,
  Expect<Equal<Params<Group<'pg', 'builders'>, 'createUser'>, [Pg.NewUser]>>,
];
