import {createJsonEncoderFn} from '@mionjs/run-types';

// start-undeclared
type User = {name: string};

const encodeUser = createJsonEncoderFn<User>();

const input = {name: 'Ada', isAdmin: true} as User;
const json = encodeUser(input); // '{"name":"Ada"}': isAdmin is never read
// end-undeclared

export {json};
