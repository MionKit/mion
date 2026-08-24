import {createStandardSchema} from '@ts-runtypes/core';

type User = {
  id: number;
  name: string;
  roles: ('admin' | 'user')[];
};

// start-standard
// createStandardSchema -> a Standard Schema v1 object: a single `~standard`
// property that tRPC, TanStack Form/Router, Hono and others accept directly.
const userSchema = createStandardSchema<User>();

// Valid input comes back under `value`.
userSchema['~standard'].validate({id: 1, name: 'Ada', roles: ['admin']});
// {value: {id: 1, name: 'Ada', roles: ['admin']}}

// Invalid input comes back as a flat list of issues, each with a message + path.
userSchema['~standard'].validate({id: '1', name: 'Ada', roles: ['admin']});
// {issues: [{message: 'Expected number', path: ['id']}]}
// end-standard

export {userSchema};
