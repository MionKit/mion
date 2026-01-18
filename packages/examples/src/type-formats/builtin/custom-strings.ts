import {StrFormat} from '@mionkit/type-formats/FormatsString';

// Username: 3-20 chars, lowercase, trimmed
type Username = StrFormat<{
    minLength: 3;
    maxLength: 20;
    lowercase: true;
    trim: true;
}>;

// Slug with pattern validation
const slugRegex = /^[a-z0-9-]+$/;
type Slug = StrFormat<{
    minLength: 1;
    maxLength: 100;
    pattern: {
        val: typeof slugRegex;
        errorMessage: 'Slug can only contain lowercase letters, numbers, and hyphens';
        mockSamples: ['my-post', 'hello-world', 'article-123'];
    };
}>;

// Name with allowed characters only
type SafeName = StrFormat<{
    minLength: 1;
    maxLength: 50;
    allowedChars: {
        val: 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ ';
        errorMessage: 'Name can only contain letters and spaces';
    };
    capitalize: true;
}>;

