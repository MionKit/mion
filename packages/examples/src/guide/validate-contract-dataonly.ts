import {createJsonDecoderFn, type DataOnly} from '@mionjs/run-types';

// Decoders return the data-only projection of T: the non-serializable
// members are gone from the return type too, so it can't lie to you.
interface User {
  name: string;
  greet: () => string; // dropped on the wire AND in the return type
}

const decode = createJsonDecoderFn<User>();

const user = decode('{"name":"Ada"}');
user.name; // string, fine
// user.greet();   // ❌ type error: greet isn't on the decoded type

// DataOnly<T> is the same projection, if you want to name it yourself.
type StoredUser = DataOnly<User>; // { name: string }

export {decode, user};
export type {User, StoredUser};
