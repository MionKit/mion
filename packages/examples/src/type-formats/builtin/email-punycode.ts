import {FormatEmailPunycode} from '@mionjs/type-formats/StringFormats';

type InternationalEmail = FormatEmailPunycode;

// Valid
('user@xn--80akhbyknj4f.xn--p1ai'); // ✓ (punycode domain)
('user@sub-domain.example.com'); // ✓ (hyphenated domains)
