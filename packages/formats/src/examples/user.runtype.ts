/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// Example: How to define and use type formats from @mionkit/formats

// ============= STRING FORMATS =============

// Import predefined string formats
import type {String_Alphanumeric, String_Capitalize} from '../string/defaultStringFormats.runtype';

// Import specific string format types
import type {EmailFormat} from '../string/email.runtype';
import type {UUIDFormat_V4, UUIDFormat_V7} from '../string/uuid.runtype';
import type {UrlFormat} from '../string/url.runtype';
import type {DateFormat} from '../string/date.runtype';
import type {DateTimeFormat} from '../string/dateTime.runtype';
import type {TimeFormat} from '../string/time.runtype';
import type {IP_Format} from '../string/ip.runtype';

// ============= NUMBER FORMATS =============

// Import number format types directly
import type {NumberFormat} from '../numberFormnat.runtype';

// Import predefined number formats
import type {
    Number_Integer,
    Number_Float,
    Number_Positive,
    Number_PositiveInteger,
    Number_Uint32,
    Number_Int64,
} from '../number/defaultNumberFormats';

// ============= EXAMPLE USER TYPES =============

// Example 1: User Profile with various string formats

export interface UserProfile {
    // Basic string formats with constraints
    username: String_Alphanumeric<{minLength: 3; maxLength: 20}>;
    displayName: String_Capitalize<{minLength: 2; maxLength: 50}>;
    email: EmailFormat;
    // numbers
    age: NumberFormat<{min: 18; max: 120; integer: true}>;
    // UUID formats
    id: UUIDFormat_V4;
    sessionId: UUIDFormat_V7;
    // URL and domain formats
    website?: UrlFormat;
    // Date and time formats
    birthDate: DateFormat;
    createdAt: DateTimeFormat;
    preferredTime?: TimeFormat;
    // IP address formats
    lastLoginIP?: IP_Format;
}

// Example 2: Product with number formats
export interface Product {
    // Basic number formats
    id: Number_PositiveInteger;
    price: Number_Positive; // Allows decimals, >= 0
    discount: NumberFormat<{min: 0; max: 100; integer: true}>; // 0-100 integer

    // Specific number ranges
    rating: NumberFormat<{min: 1; max: 5; float: true}>; // 1.0 to 5.0 with decimals
    stock: Number_Integer; // Any integer
    weight: Number_Float; // Must be decimal

    // System-specific number formats
    categoryId: Number_Uint32; // Unsigned 32-bit integer
    timestamp: Number_Int64; // 64-bit integer for timestamps
}
