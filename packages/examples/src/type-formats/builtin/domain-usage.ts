import {StrDomain, StrDomainStrict} from '@mionkit/type-formats/FormatsString';

type QuickDomain = StrDomain;
type DetailedDomain = StrDomainStrict;

// Both validate the same cases
'example.com'; // ✓
'sub.example.com'; // ✓
'example.co.uk'; // ✓

// Invalid for both
'example'; // ✗ (missing TLD)
'example..com'; // ✗ (empty part)
'exa!mple.com'; // ✗ (invalid characters)

