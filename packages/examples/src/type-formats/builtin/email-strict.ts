import {FormatEmailStrict} from '@mionkit/type-formats/StringFormats';

// Valid
('user@example.com'); // ✓
('user.name@sub.domain.com'); // ✓

// Invalid (stricter than FormatEmail)
('user+tag@example.com'); // ✗ (disallows special chars)
('user(comment)@test.com'); // ✗ (disallows parentheses)
