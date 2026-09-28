import {createValidateFn} from '@mionjs/run-types';

// The classic gotcha. `onClick` is a function (not serializable), so the
// validator drops it and only checks `name`. The build notes it as Info
// (VL011, shown with `levels: 'all'`), which is EXPECTED, not an error.
interface User {
  name: string;
  onClick: () => void;
}

const isUser = createValidateFn<User>();

// `onClick` is never checked. A string where a function should be? Still true.
isUser({name: 'Ada', onClick: 'not-a-function' as never}); // true
isUser({name: 'Ada'} as never); // true, onClick isn't part of the data check

export {isUser};
export type {User};
