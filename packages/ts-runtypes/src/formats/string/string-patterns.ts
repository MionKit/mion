// Centralised regex patterns for the built-in string formats. Each is
// registered via registerFormatPattern with its `source` (+ optional `flags`)
// as STRING literals, which (a) validates the mockSamples against the actual JS
// engine at module load — catching a sample that contradicts its own pattern —
// and (b) keeps source/flags/mockSamples as literal TYPES on `typeof X_PATTERN`,
// so the Go scanner recovers them from the RESOLVED TYPE even when a consumer
// imports the package through its published `.d.ts`.
//
// Why not a `/regex/` literal: `typeof /x/` is `RegExp` (no literal regex type),
// and `.d.ts` emission erases the initializer — so the source/flags would be
// invisible to any downstream consumer.

import {registerFormatPattern} from '../../runtypes/formatPattern.ts';

// Latin domain: each label ≤63 chars, tld 2-63 latin letters.
export const DOMAIN_PATTERN = registerFormatPattern({
  source: '^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\\.)+[a-zA-Z]{2,63}$',
  mockSamples: ['mion.io', 'example.com', 'mionkit.io', 'sub.example.co.uk', 'wiki.org'],
});

// Unicode domain (labels allow \p{L}\p{N}); tld stays latin.
export const DOMAIN_UNICODE_PATTERN = registerFormatPattern({
  source: '^(?:[\\p{L}\\p{N}](?:[\\p{L}\\p{N}-]{0,61}[\\p{L}\\p{N}])?\\.)+[a-zA-Z]{2,63}$',
  flags: 'u',
  mockSamples: ['mion.io', 'example.com', 'mionkit.io', 'sub.example.co.uk', 'wiki.org'],
});

// Punycode domain: tld may contain digits/hyphens (xn--…).
export const DOMAIN_PUNYCODE_PATTERN = registerFormatPattern({
  source: '^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\\.)+[a-zA-Z0-9-]{2,63}$',
  mockSamples: ['xn--e1afmkfd.xn--p1ai', 'example.com'],
});

// Strict-domain label / tld sub-patterns (used by DomainStrict).
export const DOMAIN_NAME_PATTERN = registerFormatPattern({
  source: '^[a-zA-Z0-9-]+$',
  mockSamples: ['domain', 'mion', 'example', 'wiki', 'mionkit'],
});
export const DOMAIN_TLD_PATTERN = registerFormatPattern({
  source: '^[a-zA-Z]+(\\.[a-zA-Z]+)?$',
  mockSamples: ['com', 'org', 'net', 'io'],
});

// Email (latin-label domains; tld stays latin) + punycode variant.
export const EMAIL_PATTERN = registerFormatPattern({
  source: '^[^\\s@]{1,64}@(?:[a-zA-Z0-9-]{1,63}\\.)+[a-zA-Z]{2,63}$',
  mockSamples: ['john@example.com', 'jane.doe@mion.io', 'contact@test.org'],
});
export const EMAIL_PUNYCODE_PATTERN = registerFormatPattern({
  source: '^[^\\s@]{1,64}@(?:[a-zA-Z0-9-]{1,63}\\.)+[a-zA-Z0-9-]{2,63}$',
  mockSamples: ['john@example.xn--fiqs8s'],
});

// URL — http/ftp/ws schemes, http-only, and file:// (unix-style paths).
export const URL_PATTERN = registerFormatPattern({
  source: '^(?:https?|ftps?|wss?):\\/\\/[^\\s/$.?#-][^\\s]*$',
  flags: 'i',
  mockSamples: ['https://example.com', 'http://mion.io/path', 'ftp://files.example.org'],
});
export const URL_HTTP_PATTERN = registerFormatPattern({
  source: '^https?:\\/\\/[^\\s/$.?#-][^\\s]*$',
  flags: 'i',
  mockSamples: ['https://example.com', 'http://mion.io/a/b'],
});
export const URL_FILE_PATTERN = registerFormatPattern({
  source: '^file:\\/\\/\\/?(?:[a-zA-Z]:)?[^\\s/$.?#-][^\\s]*$',
  flags: 'i',
  mockSamples: ['file:///etc/hosts', 'file:///var/log/app.log'],
});

// Default char-class formats (Alpha / AlphaNumeric / Numeric).
export const ALPHA_PATTERN = registerFormatPattern({
  source: '^[\\p{L}]+$',
  flags: 'u',
  mockSamples: ['abc', 'Hello', 'World'],
});
export const ALPHANUMERIC_PATTERN = registerFormatPattern({
  source: '^[\\p{L}\\p{N}]+$',
  flags: 'u',
  mockSamples: ['abc123', 'Test42', 'XYZ0'],
});
export const NUMERIC_PATTERN = registerFormatPattern({
  source: '^[\\p{N}]+$',
  flags: 'u',
  mockSamples: ['123', '007', '42'],
});
