// SelectModel / InsertModel / UpdateModel derive the payload shapes a database
// lane needs from one app type. Plain type transforms: every format and its
// params survive into the derived payloads, so their compiled validators keep
// full fidelity.
import type {InsertModel, SelectModel, UpdateModel} from '@mionjs/run-types';
import type {Email, String, UUIDv4} from '@mionjs/run-types/formats';
import {createValidateFn} from '@mionjs/run-types';

interface User {
  id: UUIDv4;
  email: Email;
  name: String<{maxLength: 100}>;
  bio?: string;
  createdAt: Date;
}

// What a select returns: every key present, bio comes back as value | null.
export type UserRow = SelectModel<User>;

// id and createdAt have database defaults, so inserts may omit them.
export type NewUser = InsertModel<User, never, 'id' | 'createdAt'>;

// Updates accept any subset of the insert payload.
export type UserPatch = UpdateModel<User>;

// The derived payloads validate with the same format fidelity as User itself.
export const validateNewUser = createValidateFn<NewUser>();
