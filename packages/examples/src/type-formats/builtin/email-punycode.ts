import {EmailPunycode} from '@ts-runtypes/core/formats';

type InternationalEmail = EmailPunycode;

// Valid
('user@xn--80akhbyknj4f.xn--p1ai'); // ✓ (punycode domain)
('user@sub-domain.example.com'); // ✓ (hyphenated domains)
