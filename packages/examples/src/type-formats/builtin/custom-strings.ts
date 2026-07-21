import {FormatString} from '@mionjs/type-formats/StringFormats';
import {registerFormatPattern} from '@mionjs/run-types';

// Username: 3-20 chars, lowercase, trimmed
type Username = FormatString<{
    minLength: 3;
    maxLength: 20;
    lowercase: true;
    trim: true;
}>;

// Slug with pattern validation — regexes ride registerFormatPattern (source + mockSamples as literals).
const slugPattern = registerFormatPattern({
    source: '^[a-z0-9-]+$',
    message: 'Slug can only contain lowercase letters, numbers, and hyphens',
    mockSamples: ['my-post', 'hello-world', 'article-123'],
});
type Slug = FormatString<{
    minLength: 1;
    maxLength: 100;
    pattern: typeof slugPattern;
}>;

// Name with capitalization transform
type SafeName = FormatString<{
    minLength: 1;
    maxLength: 50;
    capitalize: true;
}>;
