// Type-only pins, checked by `typecheck:test`: what the client sees from each route.
import type {AppClient} from '../src/client/client.ts';
import type {AdultUser, Post, User} from '../src/db/pg.schema.ts';
import type * as TypeForm from '../src/db/pg.types.schema.ts';

type Equal<X, Y> = (<T>() => T extends X ? 1 : 2) extends <T>() => T extends Y ? 1 : 2 ? true : false;
type Expect<T extends true> = T;

type Group = 'pg' | 'pgTyped';
type Answer<G extends Group, K extends keyof AppClient[G]> = AppClient[G][K] extends (...args: any[]) => {
  call(): Promise<infer R>;
}
  ? R extends [infer Value, ...unknown[]]
    ? Value
    : never
  : never;
type Keys = keyof AppClient['pg'] & keyof AppClient['pgTyped'];

// `User & {posts: Post[]}` and drizzle's flat relation row hold the same fields, so rows compare flattened
type Flat<T> = {[K in keyof T]: T[K]} & {};
type Rows<T> = T extends (infer Row)[] ? Flat<Row>[] : T;

// a route that returns drizzle's own result type gives the client the same type as one written by hand
type SameAnswer = {[K in Keys]: Equal<Rows<Answer<'pg', K>>, Rows<Answer<'pgTyped', K>>>};
export type SameForEveryCase = Expect<Equal<SameAnswer, {[K in Keys]: true}>>;

type UserName = Pick<User, 'id' | 'name'>;
export type Pins = [
  Expect<Equal<Answer<'pg', 'listUsers'>, User[] | undefined>>,
  Expect<Equal<Answer<'pg', 'userNames'>, UserName[] | undefined>>,
  Expect<Equal<Answer<'pg', 'postsWithAuthor'>, {post: Post; author: UserName}[] | undefined>>,
  Expect<Equal<Answer<'pg', 'adults'>, AdultUser[] | undefined>>,
  Expect<Equal<Rows<NonNullable<Answer<'pg', 'usersWithPosts'>>>, Flat<User & {posts: Post[]}>[]>>,
];

// both table forms give the same row types
export type FormPins = [
  Expect<Equal<TypeForm.User, User>>,
  Expect<Equal<TypeForm.Post, Post>>,
  Expect<Equal<TypeForm.AdultUser, AdultUser>>,
];
