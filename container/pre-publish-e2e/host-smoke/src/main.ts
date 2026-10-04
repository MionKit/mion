import {createValidateFn, getRunTypeId} from '@mionjs/run-types';
import * as RT from '@mionjs/run-types/builders';
import * as TF from '@mionjs/run-types/formats';

export interface User {
  id: number;
  name: string;
  email: string;
  roles: string[];
}

// AGENTS.md requires both marker forms; failed optional-dependency binary resolution or startup must fail the transform.
export const isUser = createValidateFn<User>();
export const userTypeIdStatic = getRunTypeId<User>();

const sampleUser: User = {id: 1, name: 'Ada', email: 'a@b.c', roles: ['admin']};
export const userTypeIdFromValue = getRunTypeId(sampleUser);

// The value-first builder call form, off the packed builders + formats subpaths:
// an RT/TF run-type denoting the same User shape must land on the same
// structural id.
export const userTypeIdFromBuilder = getRunTypeId(
  RT.object({
    id: TF.number(),
    name: TF.string(),
    email: TF.string(),
    roles: RT.array(TF.string()),
  })
);
