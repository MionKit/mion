import {Email} from '@ts-runtypes/core/formats';

type UserEmail = Email;

// Valid
('user@example.com'); // ✓
('user+tag@example.com'); // ✓ (allows + for email aliases)
('user(comment)@test.com'); // ✓

// Invalid
('user@name@example.com'); // ✗ (multiple @)
('@example.com'); // ✗ (missing local part)
