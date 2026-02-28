import {FormatDomain, FormatDomainStrict} from '@mionkit/type-formats/StringFormats';

type QuickDomain = FormatDomain;
type DetailedDomain = FormatDomainStrict;

// Both validate the same cases
('example.com'); // ✓
('sub.example.com'); // ✓
('example.co.uk'); // ✓

// Invalid for both
('example'); // ✗ (missing TLD)
('example..com'); // ✗ (empty part)
('exa!mple.com'); // ✗ (invalid characters)
