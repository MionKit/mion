/* eslint-disable @typescript-eslint/no-unused-vars */
import type {FriendlyErrors} from '@mionkit/core';
import {getFriendlyErrors} from '@mionkit/core';
import {User, userFriendlyErrors} from './friendly-errors-map.ts';
import type {FormatString, FormatEmail} from '@mionkit/type-formats/StringFormats';

// start-narrowing-params
// Define a simple type with format constraints
type ContactInfo = {
    name: FormatString<{minLength: 2; maxLength: 50}>;
    email: FormatEmail;
    website: FormatString<{minLength: 10}>;
};

// Error params are automatically inferred from the branded type
// Handler is called ONCE per field with ALL aggregated error params
const contactErrors: FriendlyErrors<ContactInfo> = {
    // FormatString infers StringErrorParams: minLength, maxLength, pattern, length, etc.
    // All failed constraints are available at once in the params object
    name: (failed) => {
        const messages: string[] = [];
        if (failed.minLength) messages.push(`at least ${failed.minLength.val} characters`);
        if (failed.maxLength) messages.push(`at most ${failed.maxLength.val} characters`);
        if (messages.length > 0) return `Name must be ${messages.join(' and ')}`;
        return 'Name must be a valid string';
    },
    // FormatEmail infers EmailErrorParams: pattern, localPart, domain, minLength, maxLength
    email: (failed) => {
        const messages: string[] = [];
        if (failed.pattern) messages.push('invalid format');
        if (failed.localPart) messages.push('invalid username');
        if (failed.domain) messages.push('invalid domain');
        if (messages.length > 0) return `Email: ${messages.join(', ')}`;
        return 'Email must be a valid string';
    },
    // FormatString infers StringErrorParams automatically
    website: (failed) => {
        if (failed.minLength) return `Website must be at least ${failed.minLength.val} characters`;
        return 'Website must be a valid string';
    },
};
// end-narrowing-params

// start-error-values
// Access the constraint value from error parameters
const accessingErrorValues = (failed) => {
    if (failed.minLength) {
        const minValue = failed.minLength.val; // e.g., 5
        return `Must be at least ${minValue} characters`;
    }
    return 'Invalid value';
};
// end-error-values

// start-root-errors
// Handle root level errors (when path is empty)
const validationErrors: Parameters<typeof getFriendlyErrors>[0] = [];
const result = getFriendlyErrors<User>(validationErrors, userFriendlyErrors);
if (result.$root) {
    console.log('Root errors:', result.$root);
}
// end-root-errors
