import {StrEmailStrict} from '@mionkit/type-formats/FormatsString';

type StrictEmail = StrEmailStrict;

// Valid
'user@example.com'; // ✓
'user.name@sub.domain.com'; // ✓

// Invalid (stricter than StrEmail)
'user+tag@example.com'; // ✗ (disallows special chars)
'user(comment)@test.com'; // ✗ (disallows parentheses)

