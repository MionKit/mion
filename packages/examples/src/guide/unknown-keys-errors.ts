import {createUnknownKeyErrorsFn} from '@ts-runtypes/core';

type User = {id: number; name: string};

// createUnknownKeyErrorsFn -> one {path, expected: 'never'} entry per undeclared key.
const unknownKeyErrors = createUnknownKeyErrorsFn<User>();

unknownKeyErrors({id: 1, name: 'Ada'}); // []
unknownKeyErrors({id: 1, name: 'Ada', admin: true});
// [{path: ['admin'], expected: 'never'}]

export {unknownKeyErrors};
