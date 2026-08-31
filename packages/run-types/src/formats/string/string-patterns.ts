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

// ─────────────── RFC named formats (JSON Schema 2020-12 parity) ───────────────
//
// One pattern per named `format`, transcribed from the RFC each keyword names.
//
// HOSTNAME_PATTERN is RFC 1123, which DOMAIN_PATTERN is not: a domain here
// wants a dotted name with a TLD, while a hostname may be a single label
// (`localhost`, `db1`). Keeping both means `format: 'hostname'` can be exact
// without narrowing what `TF.Domain` means to everyone already using it.
//
// STRING_DURATION_PATTERN is RFC 3339 Appendix A, which is NOT the same grammar
// as the `now±P…` relative bound specs in the date/time params (validated Go-side
// by parseISODuration in internal/cachegen/typefunctions/formats/datetime/bounds.go).
// RFC 3339 nests its components — a year may be followed by a month, a month by
// a day, never skipping — and forbids the week form from combining with
// anything, so `P1Y2D` and `PT1H2S` are invalid here while staying perfectly
// good bound specs. Two grammars on purpose: this one is what the keyword
// means, that one is what our own parameter syntax accepts.
//
// URI_PATTERN is RFC 3986 and accepts ANY scheme (`mailto:`, `urn:`, `tel:`),
// where URL_PATTERN above is deliberately the narrow web-address form
// (http/ftp/ws only). The IRI twins are the same grammar with RFC 3987's
// non-ASCII ranges added to each character class.

export const STRING_DURATION_PATTERN = registerFormatPattern({
  source:
    '^P(?:\\d+W|(?:\\d+Y(?:\\d+M(?:\\d+D)?)?|\\d+M(?:\\d+D)?|\\d+D)(?:T(?:\\d+H(?:\\d+M(?:\\d+S)?)?|\\d+M(?:\\d+S)?|\\d+S))?|T(?:\\d+H(?:\\d+M(?:\\d+S)?)?|\\d+M(?:\\d+S)?|\\d+S))$',
  mockSamples: ['P4DT12H30M5S', 'P1Y2M3D', 'PT1H30M', 'P2W', 'PT0S'],
});
export const JSON_POINTER_PATTERN = registerFormatPattern({
  source: '^(?:\\/(?:[^~\\/]|~[01])*)*$',
  mockSamples: ['', '/foo', '/foo/0', '/a~1b', '/c~0d'],
});
export const RELATIVE_JSON_POINTER_PATTERN = registerFormatPattern({
  source: '^(?:0|[1-9][0-9]*)(?:#|(?:\\/(?:[^~\\/]|~[01])*)*)$',
  mockSamples: ['0', '1/foo', '2#', '0/a~1b'],
});
export const URI_PATTERN = registerFormatPattern({
  source:
    "^[A-Za-z][A-Za-z0-9+\\-.]*:(?:\\/\\/(?:(?:[A-Za-z0-9\\-._~!$&'()*+,;=:]|%[0-9A-Fa-f]{2})*@)?(?:\\[[0-9A-Fa-f:.]+\\]|(?:[A-Za-z0-9\\-._~!$&'()*+,;=]|%[0-9A-Fa-f]{2})*)(?::[0-9]*)?(?:\\/(?:[A-Za-z0-9\\-._~!$&'()*+,;=:@]|%[0-9A-Fa-f]{2})*)*|\\/(?:(?:[A-Za-z0-9\\-._~!$&'()*+,;=:@]|%[0-9A-Fa-f]{2})+(?:\\/(?:[A-Za-z0-9\\-._~!$&'()*+,;=:@]|%[0-9A-Fa-f]{2})*)*)?|(?:[A-Za-z0-9\\-._~!$&'()*+,;=:@]|%[0-9A-Fa-f]{2})+(?:\\/(?:[A-Za-z0-9\\-._~!$&'()*+,;=:@]|%[0-9A-Fa-f]{2})*)*|)(?:\\?(?:[A-Za-z0-9\\-._~!$&'()*+,;=:@\\/?]|%[0-9A-Fa-f]{2})*)?(?:#(?:[A-Za-z0-9\\-._~!$&'()*+,;=:@\\/?]|%[0-9A-Fa-f]{2})*)?$",
  flags: 'u',
  mockSamples: ['https://example.com/path', 'mailto:ada@example.com', 'urn:isbn:0451450523', 'ftp://files.example.org/pub'],
});
export const URI_REFERENCE_PATTERN = registerFormatPattern({
  source:
    "^(?:[A-Za-z][A-Za-z0-9+\\-.]*:(?:\\/\\/(?:(?:[A-Za-z0-9\\-._~!$&'()*+,;=:]|%[0-9A-Fa-f]{2})*@)?(?:\\[[0-9A-Fa-f:.]+\\]|(?:[A-Za-z0-9\\-._~!$&'()*+,;=]|%[0-9A-Fa-f]{2})*)(?::[0-9]*)?(?:\\/(?:[A-Za-z0-9\\-._~!$&'()*+,;=:@]|%[0-9A-Fa-f]{2})*)*|\\/(?:(?:[A-Za-z0-9\\-._~!$&'()*+,;=:@]|%[0-9A-Fa-f]{2})+(?:\\/(?:[A-Za-z0-9\\-._~!$&'()*+,;=:@]|%[0-9A-Fa-f]{2})*)*)?|(?:[A-Za-z0-9\\-._~!$&'()*+,;=:@]|%[0-9A-Fa-f]{2})+(?:\\/(?:[A-Za-z0-9\\-._~!$&'()*+,;=:@]|%[0-9A-Fa-f]{2})*)*|)|(?:\\/\\/(?:(?:[A-Za-z0-9\\-._~!$&'()*+,;=:]|%[0-9A-Fa-f]{2})*@)?(?:\\[[0-9A-Fa-f:.]+\\]|(?:[A-Za-z0-9\\-._~!$&'()*+,;=]|%[0-9A-Fa-f]{2})*)(?::[0-9]*)?(?:\\/(?:[A-Za-z0-9\\-._~!$&'()*+,;=:@]|%[0-9A-Fa-f]{2})*)*|\\/(?:(?:[A-Za-z0-9\\-._~!$&'()*+,;=:@]|%[0-9A-Fa-f]{2})+(?:\\/(?:[A-Za-z0-9\\-._~!$&'()*+,;=:@]|%[0-9A-Fa-f]{2})*)*)?|(?:[A-Za-z0-9\\-._~!$&'()*+,;=@]|%[0-9A-Fa-f]{2})+(?:\\/(?:[A-Za-z0-9\\-._~!$&'()*+,;=:@]|%[0-9A-Fa-f]{2})*)*|))(?:\\?(?:[A-Za-z0-9\\-._~!$&'()*+,;=:@\\/?]|%[0-9A-Fa-f]{2})*)?(?:#(?:[A-Za-z0-9\\-._~!$&'()*+,;=:@\\/?]|%[0-9A-Fa-f]{2})*)?$",
  flags: 'u',
  mockSamples: ['/relative/path', '../up', '#fragment', 'https://example.com'],
});
export const IRI_PATTERN = registerFormatPattern({
  source:
    "^[A-Za-z][A-Za-z0-9+\\-.]*:(?:\\/\\/(?:(?:[A-Za-z0-9\\-._~!$&'()*+,;=:\\u{A0}-\\u{D7FF}\\u{F900}-\\u{FDCF}\\u{FDF0}-\\u{FFEF}\\u{10000}-\\u{EFFFD}]|%[0-9A-Fa-f]{2})*@)?(?:\\[[0-9A-Fa-f:.]+\\]|(?:[A-Za-z0-9\\-._~!$&'()*+,;=\\u{A0}-\\u{D7FF}\\u{F900}-\\u{FDCF}\\u{FDF0}-\\u{FFEF}\\u{10000}-\\u{EFFFD}]|%[0-9A-Fa-f]{2})*)(?::[0-9]*)?(?:\\/(?:[A-Za-z0-9\\-._~!$&'()*+,;=:@\\u{A0}-\\u{D7FF}\\u{F900}-\\u{FDCF}\\u{FDF0}-\\u{FFEF}\\u{10000}-\\u{EFFFD}]|%[0-9A-Fa-f]{2})*)*|\\/(?:(?:[A-Za-z0-9\\-._~!$&'()*+,;=:@\\u{A0}-\\u{D7FF}\\u{F900}-\\u{FDCF}\\u{FDF0}-\\u{FFEF}\\u{10000}-\\u{EFFFD}]|%[0-9A-Fa-f]{2})+(?:\\/(?:[A-Za-z0-9\\-._~!$&'()*+,;=:@\\u{A0}-\\u{D7FF}\\u{F900}-\\u{FDCF}\\u{FDF0}-\\u{FFEF}\\u{10000}-\\u{EFFFD}]|%[0-9A-Fa-f]{2})*)*)?|(?:[A-Za-z0-9\\-._~!$&'()*+,;=:@\\u{A0}-\\u{D7FF}\\u{F900}-\\u{FDCF}\\u{FDF0}-\\u{FFEF}\\u{10000}-\\u{EFFFD}]|%[0-9A-Fa-f]{2})+(?:\\/(?:[A-Za-z0-9\\-._~!$&'()*+,;=:@\\u{A0}-\\u{D7FF}\\u{F900}-\\u{FDCF}\\u{FDF0}-\\u{FFEF}\\u{10000}-\\u{EFFFD}]|%[0-9A-Fa-f]{2})*)*|)(?:\\?(?:[A-Za-z0-9\\-._~!$&'()*+,;=:@\\/?\\u{A0}-\\u{D7FF}\\u{F900}-\\u{FDCF}\\u{FDF0}-\\u{FFEF}\\u{10000}-\\u{EFFFD}]|%[0-9A-Fa-f]{2})*)?(?:#(?:[A-Za-z0-9\\-._~!$&'()*+,;=:@\\/?\\u{A0}-\\u{D7FF}\\u{F900}-\\u{FDCF}\\u{FDF0}-\\u{FFEF}\\u{10000}-\\u{EFFFD}]|%[0-9A-Fa-f]{2})*)?$",
  flags: 'u',
  mockSamples: ['https://example.com/päth', 'https://例え.テスト/ページ', 'mailto:ada@example.com'],
});
export const IRI_REFERENCE_PATTERN = registerFormatPattern({
  source:
    "^(?:[A-Za-z][A-Za-z0-9+\\-.]*:(?:\\/\\/(?:(?:[A-Za-z0-9\\-._~!$&'()*+,;=:\\u{A0}-\\u{D7FF}\\u{F900}-\\u{FDCF}\\u{FDF0}-\\u{FFEF}\\u{10000}-\\u{EFFFD}]|%[0-9A-Fa-f]{2})*@)?(?:\\[[0-9A-Fa-f:.]+\\]|(?:[A-Za-z0-9\\-._~!$&'()*+,;=\\u{A0}-\\u{D7FF}\\u{F900}-\\u{FDCF}\\u{FDF0}-\\u{FFEF}\\u{10000}-\\u{EFFFD}]|%[0-9A-Fa-f]{2})*)(?::[0-9]*)?(?:\\/(?:[A-Za-z0-9\\-._~!$&'()*+,;=:@\\u{A0}-\\u{D7FF}\\u{F900}-\\u{FDCF}\\u{FDF0}-\\u{FFEF}\\u{10000}-\\u{EFFFD}]|%[0-9A-Fa-f]{2})*)*|\\/(?:(?:[A-Za-z0-9\\-._~!$&'()*+,;=:@\\u{A0}-\\u{D7FF}\\u{F900}-\\u{FDCF}\\u{FDF0}-\\u{FFEF}\\u{10000}-\\u{EFFFD}]|%[0-9A-Fa-f]{2})+(?:\\/(?:[A-Za-z0-9\\-._~!$&'()*+,;=:@\\u{A0}-\\u{D7FF}\\u{F900}-\\u{FDCF}\\u{FDF0}-\\u{FFEF}\\u{10000}-\\u{EFFFD}]|%[0-9A-Fa-f]{2})*)*)?|(?:[A-Za-z0-9\\-._~!$&'()*+,;=:@\\u{A0}-\\u{D7FF}\\u{F900}-\\u{FDCF}\\u{FDF0}-\\u{FFEF}\\u{10000}-\\u{EFFFD}]|%[0-9A-Fa-f]{2})+(?:\\/(?:[A-Za-z0-9\\-._~!$&'()*+,;=:@\\u{A0}-\\u{D7FF}\\u{F900}-\\u{FDCF}\\u{FDF0}-\\u{FFEF}\\u{10000}-\\u{EFFFD}]|%[0-9A-Fa-f]{2})*)*|)|(?:\\/\\/(?:(?:[A-Za-z0-9\\-._~!$&'()*+,;=:\\u{A0}-\\u{D7FF}\\u{F900}-\\u{FDCF}\\u{FDF0}-\\u{FFEF}\\u{10000}-\\u{EFFFD}]|%[0-9A-Fa-f]{2})*@)?(?:\\[[0-9A-Fa-f:.]+\\]|(?:[A-Za-z0-9\\-._~!$&'()*+,;=\\u{A0}-\\u{D7FF}\\u{F900}-\\u{FDCF}\\u{FDF0}-\\u{FFEF}\\u{10000}-\\u{EFFFD}]|%[0-9A-Fa-f]{2})*)(?::[0-9]*)?(?:\\/(?:[A-Za-z0-9\\-._~!$&'()*+,;=:@\\u{A0}-\\u{D7FF}\\u{F900}-\\u{FDCF}\\u{FDF0}-\\u{FFEF}\\u{10000}-\\u{EFFFD}]|%[0-9A-Fa-f]{2})*)*|\\/(?:(?:[A-Za-z0-9\\-._~!$&'()*+,;=:@\\u{A0}-\\u{D7FF}\\u{F900}-\\u{FDCF}\\u{FDF0}-\\u{FFEF}\\u{10000}-\\u{EFFFD}]|%[0-9A-Fa-f]{2})+(?:\\/(?:[A-Za-z0-9\\-._~!$&'()*+,;=:@\\u{A0}-\\u{D7FF}\\u{F900}-\\u{FDCF}\\u{FDF0}-\\u{FFEF}\\u{10000}-\\u{EFFFD}]|%[0-9A-Fa-f]{2})*)*)?|(?:[A-Za-z0-9\\-._~!$&'()*+,;=@\\u{A0}-\\u{D7FF}\\u{F900}-\\u{FDCF}\\u{FDF0}-\\u{FFEF}\\u{10000}-\\u{EFFFD}]|%[0-9A-Fa-f]{2})+(?:\\/(?:[A-Za-z0-9\\-._~!$&'()*+,;=:@\\u{A0}-\\u{D7FF}\\u{F900}-\\u{FDCF}\\u{FDF0}-\\u{FFEF}\\u{10000}-\\u{EFFFD}]|%[0-9A-Fa-f]{2})*)*|))(?:\\?(?:[A-Za-z0-9\\-._~!$&'()*+,;=:@\\/?\\u{A0}-\\u{D7FF}\\u{F900}-\\u{FDCF}\\u{FDF0}-\\u{FFEF}\\u{10000}-\\u{EFFFD}]|%[0-9A-Fa-f]{2})*)?(?:#(?:[A-Za-z0-9\\-._~!$&'()*+,;=:@\\/?\\u{A0}-\\u{D7FF}\\u{F900}-\\u{FDCF}\\u{FDF0}-\\u{FFEF}\\u{10000}-\\u{EFFFD}]|%[0-9A-Fa-f]{2})*)?$",
  flags: 'u',
  mockSamples: ['/relative/päth', '#フラグ', 'https://例え.テスト'],
});
export const URI_TEMPLATE_PATTERN = registerFormatPattern({
  source:
    '^(?:[^\\x00-\\x20"\'<>\\\\^\\x60{|}\\x7F]|\\{[+#./;?&=,!@|]?(?:[A-Za-z0-9_]|%[0-9A-Fa-f]{2})(?:\\.?(?:[A-Za-z0-9_]|%[0-9A-Fa-f]{2}))*(?::[1-9][0-9]{0,3}|\\*)?(?:,(?:[A-Za-z0-9_]|%[0-9A-Fa-f]{2})(?:\\.?(?:[A-Za-z0-9_]|%[0-9A-Fa-f]{2}))*(?::[1-9][0-9]{0,3}|\\*)?)*\\})*$',
  mockSamples: ['http://example.com/{id}', 'http://example.com/~{username}/', 'http://example.com/search{?q,lang}', '{/path*}'],
});
export const HOSTNAME_PATTERN = registerFormatPattern({
  source: '^(?=.{1,253}$)[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)*$',
  mockSamples: ['example.com', 'hostname', 'sub.example.co.uk', 'h0stn4me', 'a--b.com'],
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

// contentEncoding patterns — anchored RFC 4648 shapes. The alternation groups
// enforce the padded block lengths, so a plain regex is the exact check. These
// are the single source of truth for the Base64/Base32/Base16 brands (the
// schema door references those brands), so `contentEncoding: 'base64'` and
// `TF.base64()` converge on one id. `flags` is omitted (→ ''); base16 is
// case-insensitive by CHARACTER CLASS, not an `i` flag, so its source must stay literal.
export const BASE64_PATTERN = registerFormatPattern({
  source: '^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$',
  mockSamples: ['', 'QQ==', 'QUJD', 'SGVsbG8='],
});
export const BASE32_PATTERN = registerFormatPattern({
  source: '^(?:[A-Z2-7]{8})*(?:[A-Z2-7]{2}={6}|[A-Z2-7]{4}={4}|[A-Z2-7]{5}={3}|[A-Z2-7]{7}=)?$',
  mockSamples: ['', 'MY======', 'MZXQ===='],
});
export const BASE16_PATTERN = registerFormatPattern({
  source: '^(?:[0-9A-Fa-f]{2})*$',
  mockSamples: ['', '48656C6C6F', 'DEADBEEF'],
});
