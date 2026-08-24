import {createHasUnknownKeysFn} from '@ts-runtypes/core';

type User = {id: number; name: string};

// createHasUnknownKeysFn -> true if the value carries any key the type didn't declare.
const hasExtra = createHasUnknownKeysFn<User>();

hasExtra({id: 1, name: 'Ada'}); // false
hasExtra({id: 1, name: 'Ada', admin: true}); // true, `admin` isn't in User

export {hasExtra};
