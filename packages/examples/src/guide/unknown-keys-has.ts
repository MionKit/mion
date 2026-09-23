import {createHasUnknownKeysFn} from '@mionjs/run-types';

type User = {id: number; name: string};

const hasExtra = createHasUnknownKeysFn<User>();

hasExtra({id: 1, name: 'Ada'}); // false
hasExtra({id: 1, name: 'Ada', admin: true}); // true, `admin` isn't in User

export {hasExtra};
