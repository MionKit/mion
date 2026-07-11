/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

/**
 * Single source of truth for all TypeFormat type names that must NOT use `import type`.
 * Deepkit's type compiler needs actual imports to preserve type metadata for runtime reflection.
 * When new format types are added to @mionjs/type-formats or @mionjs/run-types, update this file.
 */

/** Format type names from @mionjs/run-types that must not use `import type` */
export const RUN_TYPES_FORMAT_TYPES = new Set(['TypeFormat']);

/** Format type names from @mionjs/type-formats that must not use `import type` */
export const TYPE_FORMATS_FORMAT_TYPES = new Set([
    // Number formats (numberFormat.runtype.ts + defaultNumberFormats.ts)
    'FormatNumber',
    'FormatInteger',
    'FormatFloat',
    'FormatPositive',
    'FormatNegative',
    'FormatPositiveInt',
    'FormatNegativeInt',
    'FormatInt8',
    'FormatInt16',
    'FormatInt32',
    'FormatUInt8',
    'FormatUInt16',
    'FormatUInt32',

    // BigInt formats (bigIntFormat.runtype.ts + defaultBigNumberFormats.ts)
    'FormatBigInt',
    'FormatBigPositive',
    'FormatBigNegative',
    'FormatBigPositiveInt',
    'FormatBigNegativeInt',
    'FormatBigInt64',
    'FormatBigUInt64',

    // String format base (stringFormat.runtype.ts)
    'FormatString',

    // Date/Time formats (date.runtype.ts, time.runtype.ts, dateTime.runtype.ts)
    'FormatStringDate',
    'FormatStringTime',
    'FormatStringDateTime',

    // Email formats (email.runtype.ts)
    'FormatEmail',
    'FormatEmailStrict',
    'FormatEmailPattern',
    'FormatEmailPunycode',

    // Domain formats (domain.runtype.ts)
    'FormatDomain',
    'FormatDomainStrict',

    // URL formats (url.runtype.ts)
    'FormatUrl',
    'FormatUrlFile',
    'FormatUrlHttp',
    'FormatUrlSocialMedia',

    // IP formats (ip.runtype.ts)
    'FormatIP',
    'FormatIPv4',
    'FormatIPv6',
    'FormatIPWithPort',
    'FormatIPv4WithPort',
    'FormatIPv6WithPort',

    // UUID formats (uuid.runtype.ts)
    'FormatUUIDv4',
    'FormatUUIDv7',

    // Default string formats (defaultStringFormats.runtype.ts)
    'FormatAlphaNumeric',
    'FormatAlpha',
    'FormatNumeric',
    'FormatLowercase',
    'FormatUppercase',
    'FormatCapitalize',
]);

/** Maps a source package prefix to the set of format type names from that package */
export const FORMAT_TYPES_BY_PACKAGE = new Map<string, Set<string>>([
    ['@mionjs/run-types', RUN_TYPES_FORMAT_TYPES],
    ['@mionjs/type-formats', TYPE_FORMATS_FORMAT_TYPES],
]);
