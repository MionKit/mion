import {Domain, DomainStrict} from '@ts-runtypes/core/formats';

type QuickDomain = Domain;
type DetailedDomain = DomainStrict;

// Both validate the same cases
('example.com'); // ✓
('sub.example.com'); // ✓
('example.co.uk'); // ✓

// Invalid for both
('example'); // ✗ (missing TLD)
('example..com'); // ✗ (empty part)
('exa!mple.com'); // ✗ (invalid characters)
