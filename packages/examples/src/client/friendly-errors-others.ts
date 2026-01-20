/* eslint-disable @typescript-eslint/no-unused-vars */
import type {FriendlyErrors, StringErrorParams, EmailErrorParams} from '@mionkit/core';
import {getFriendlyErrors} from '@mionkit/core';
import {User, userFriendlyErrors} from './friendly-errors-map';
import type {StrFormat, StrEmail} from '@mionkit/type-formats/FormatsString';

// start-narrowing-params
// Define a simple type with format constraints
type ContactInfo = {
    name: StrFormat<{minLength: 2; maxLength: 50}>;
    email: StrEmail;
    website: StrFormat<{minLength: 10}>;
};

// Use specific ErrorParams types to narrow down the failed parameters
const contactErrors: FriendlyErrors<ContactInfo> = {
    // StringErrorParams narrows down to: minLength, maxLength, pattern, length, etc.
    name: (failed: StringErrorParams) => {
        if (failed.minLength) return `Name must be at least ${failed.minLength.val} characters`;
        if (failed.maxLength) return `Name must be at most ${failed.maxLength.val} characters`;
        return 'Name must be a valid string';
    },
    // EmailErrorParams narrows down to: pattern, localPart, domain, minLength, maxLength
    email: (failed: EmailErrorParams) => {
        if (failed.pattern) return `Please enter a valid email address`;
        if (failed.localPart) return `Email username is invalid`;
        if (failed.domain) return `Email domain is invalid`;
        return 'Email must be a valid string';
    },
    // Without explicit type, `failed` contains ALL possible string format params
    // (from Email, Url, DateTime, etc.) - less precise but still works
    website: (failed) => {
        if (failed.minLength) return `Website must be at least ${failed.minLength.val} characters`;
        return 'Website must be a valid string';
    },
};
// end-narrowing-params

// start-handler-typing
// Option 1: Explicitly type the parameter for better intellisense
const nameHandler1 = (failed: StringErrorParams) => {
    if (failed.minLength) return `Min ${failed.minLength.val} chars`;
    if (failed.maxLength) return `Max ${failed.maxLength.val} chars`;
    return 'Invalid name';
};

// Option 2: Check existence of properties without explicit type
const nameHandler2 = (failed: {minLength?: {val: number}}) => {
    if (failed.minLength) return `Min ${failed.minLength.val} chars`;
    return 'Invalid name';
};
// end-handler-typing

// start-error-values
// Access the constraint value from error parameters
const accessingErrorValues = (failed: StringErrorParams) => {
    if (failed.minLength) {
        const minValue = failed.minLength.val; // e.g., 5
        return `Must be at least ${minValue} characters`;
    }
    return 'Invalid value';
};
// end-error-values

// start-root-errors
// Handle root level errors (when path is empty)
async function handleRootErrors() {
    const validationErrors: Parameters<typeof getFriendlyErrors>[0] = [];
    const result = getFriendlyErrors<User>(validationErrors, userFriendlyErrors);
    if (result.$root) {
        console.log('Root errors:', result.$root);
    }
}
// end-root-errors
