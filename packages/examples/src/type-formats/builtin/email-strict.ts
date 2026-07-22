import {EmailStrict} from '@ts-runtypes/core/formats';

// Valid
('user@example.com'); // ✓
('user.name@sub.domain.com'); // ✓

// Invalid (stricter than Email)
('user+tag@example.com'); // ✗ (disallows special chars)
('user(comment)@test.com'); // ✗ (disallows parentheses)
