import {StrEmailPunycode} from '@mionkit/type-formats/FormatsString';

type InternationalEmail = StrEmailPunycode;

// Valid
('user@xn--80akhbyknj4f.xn--p1ai'); // ✓ (punycode domain)
('user@sub-domain.example.com'); // ✓ (hyphenated domains)
