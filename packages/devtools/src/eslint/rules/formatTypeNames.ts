/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

/**
 * Single source of truth for all TypeFormat type names that must NOT use `import type`.
 * Deepkit's type compiler needs actual imports to preserve type metadata for runtime reflection.
 * When new format types are added to @mionkit/type-formats or @mionkit/run-types, update this file.
 */

/** Format type names from @mionkit/run-types that must not use `import type` */
export const RUN_TYPES_FORMAT_TYPES = new Set(['TypeFormat']);

/** Format type names from @mionkit/type-formats that must not use `import type` */
export const TYPE_FORMATS_FORMAT_TYPES = new Set([
    // Number formats (numberFormat.runtype.ts + defaultNumberFormats.ts)
    'NumFormat',
    'NumInteger',
    'NumFloat',
    'NumPositive',
    'NumNegative',
    'NumPositiveInt',
    'NumNegativeInt',
    'NumInt8',
    'NumInt16',
    'NumInt32',
    'NumUInt8',
    'NumUInt16',
    'NumUInt32',

    // BigInt formats (bigIntFormat.runtype.ts + defaultBigNumberFormats.ts)
    'BigNumFormat',
    'BigNumPositive',
    'BigNumNegative',
    'BigNumPositiveInt',
    'BigNumNegativeInt',
    'BigNumInt64',
    'BigNUmUInt64',

    // String format base (stringFormat.runtype.ts)
    'StrFormat',

    // Date/Time formats (date.runtype.ts, time.runtype.ts, dateTime.runtype.ts)
    'StrDate',
    'StrTime',
    'StrDateTime',

    // Email formats (email.runtype.ts)
    'StrEmail',
    'StrEmailStrict',
    'StrEmailPattern',
    'StrEmailPunycode',

    // Domain formats (domain.runtype.ts)
    'StrDomain',
    'StrDomainStrict',

    // URL formats (url.runtype.ts)
    'StrUrl',
    'StrUrlFile',
    'StrUrlHttp',
    'StrUrlSocialMedia',

    // IP formats (ip.runtype.ts)
    'StrIP',
    'StrIPv4',
    'StrIPv6',
    'StrIPWithPort',
    'StrIPv4WithPort',
    'StrIPv6WithPort',

    // UUID formats (uuid.runtype.ts)
    'StrUUIDv4',
    'StrUUIDv7',

    // Default string formats (defaultStringFormats.runtype.ts)
    'StrAlphaNumeric',
    'StrAlpha',
    'StrNumeric',
    'StrLowercase',
    'StrUppercase',
    'StrCapitalize',
]);

/** Maps a source package prefix to the set of format type names from that package */
export const FORMAT_TYPES_BY_PACKAGE = new Map<string, Set<string>>([
    ['@mionkit/run-types', RUN_TYPES_FORMAT_TYPES],
    ['@mionkit/type-formats', TYPE_FORMATS_FORMAT_TYPES],
]);
