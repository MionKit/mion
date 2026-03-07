import {FormatEmail} from '@mionjs/type-formats/StringFormats';

type UserEmail = FormatEmail;

// Valid
('user@example.com'); // ✓
('user+tag@example.com'); // ✓ (allows + for email aliases)
('user(comment)@test.com'); // ✓

// Invalid
('user@name@example.com'); // ✗ (multiple @)
('@example.com'); // ✗ (missing local part)
