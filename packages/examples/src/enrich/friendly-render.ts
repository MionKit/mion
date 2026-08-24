import {createFriendlyText, createGetValidationErrorsFn} from '@ts-runtypes/core';
import type {User} from './user';
import {friendlyUser} from './friendly-user';

const getUserErrors = createGetValidationErrorsFn<User>();
const friendly = createFriendlyText<User>(friendlyUser);

// label(path): dotted string or a raw path-segment array
friendly.label('profile.email');
// → 'Email'

// errors(errs): render a createGetValidationErrorsFn result into messages
const badInput: unknown = {name: 'A', age: 200, profile: {email: 'nope'}};
friendly.errors(getUserErrors(badInput));
// → [{ path: 'profile.email', label: 'Email', message: 'Enter a valid email address' }, …]
