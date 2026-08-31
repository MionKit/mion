import {createValidateFn, getRunTypeId} from '@mionjs/run-types';
import * as RT from '@mionjs/run-types/builders';
import * as TF from '@mionjs/run-types/formats';

export interface User {
  id: number;
  name: string;
  email: string;
  roles: string[];
}

// The marker call shapes the plugin rewrites (CLAUDE.md marker rule): the factory
// createValidateFn<T>(), static getRunTypeId<T>(), AND value-first getRunTypeId(value).
// If the host-platform binary didn't resolve (via @ts-runtypes/bin's optional-dep
// model), spawn, and rewrite these, the transform would fail outright.
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
