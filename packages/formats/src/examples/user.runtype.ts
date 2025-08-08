/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// Import string formats types
import {StrFormat, StrUUIDv4, StrEmail, StrUrlHttp, StrDate, StrDateTime} from '@mionkit/formats/StringFormats';
// Import number formats types
import {NumFormat, NumPositiveInt, NumPositive} from '@mionkit/formats/NumberFormats';

/**
 * Example User object demonstrating various Runtype Formats
 *
 * This example shows how to use both string and number formats
 * to create a strongly typed User object with validation.
 */

// ############### User Type Definition ###############

export type User = {
    // Basic identification
    id: StrUUIDv4; // UUID v4 format
    email: StrEmail; // Email validation

    // Personal information with string constraints
    firstName: StrFormat<{
        minLength: 2;
        maxLength: 50;
        pattern: NamePattern;
        trim: true;
    }>;

    lastName: StrFormat<{
        minLength: 2;
        maxLength: 50;
        pattern: NamePattern;
        trim: true;
    }>;

    // Username with specific constraints
    username: StrFormat<{
        minLength: 3;
        maxLength: 20;
        pattern: UsernamePattern;
        lowercase: true;
        trim: true;
    }>;

    // Phone number with international format
    phoneNumber: StrFormat<{
        pattern: PhonePattern;
        minLength: 7; // Minimum E.164 format: +1234567 (country code + 6 digits)
        maxLength: 15; // Maximum E.164 format: +123456789012345 (15 digits total)
    }>;

    // Website URL (optional) - HTTP/HTTPS only
    website?: StrUrlHttp;

    // Bio with length constraints
    bio?: StrFormat<{
        maxLength: 500;
        trim: true;
    }>;

    // ############### Number Format Examples ###############

    // Age with realistic constraints
    age: NumFormat<{
        min: 13; // Minimum age for most platforms
        max: 120; // Realistic maximum age
        integer: true;
    }>;

    // Account balance (can be negative for overdrafts)
    accountBalance: NumFormat<{
        min: -10000; // Maximum overdraft
        max: 1000000; // Maximum balance
        // No multipleOf constraint - allow any precision
    }>;

    // Credit score
    creditScore: NumFormat<{
        min: 300;
        max: 850;
        integer: true;
    }>;

    // Rating (1-5 stars, any precision allowed)
    rating?: NumFormat<{
        min: 1;
        max: 5;
        // No multipleOf constraint - allow any precision
    }>;

    // Number of followers (positive integer)
    followersCount: NumPositiveInt;

    // Monthly income (positive number)
    monthlyIncome?: NumPositive;

    // ############### Additional Examples ###############

    // Date formats
    birthDate: StrDate;
    lastLoginAt?: StrDateTime;

    // Address components (flattened)
    street?: StrFormat<{
        minLength: 5;
        maxLength: 100;
        trim: true;
    }>;
    city?: StrFormat<{
        minLength: 2;
        maxLength: 50;
        pattern: CityPattern;
        trim: true;
    }>;
    zipCode?: StrFormat<{
        pattern: PostalCodePattern;
        uppercase: true;
        trim: true;
    }>;
    country?: StrFormat<{
        minLength: 2;
        maxLength: 2;
        pattern: CountryCodePattern;
        uppercase: true;
    }>;

    // Preferences (flattened)
    theme?: StrFormat<{allowedValues: ThemeValues}>;
    language?: StrFormat<{pattern: LanguageCodePattern}>;
    timezone?: StrFormat<{pattern: TimezonePattern}>;
};

// ############### Example Usage ###############

/**
 * Example of a valid user object that satisfies all format constraints
 */
export const exampleUser: User = {
    id: '550e8400-e29b-41d4-a716-446655440000',
    email: 'john.doe@example.com',
    firstName: 'John',
    lastName: 'Doe',
    username: 'john_doe',
    phoneNumber: '+1234567890',
    website: 'https://johndoe.com',
    bio: 'Software developer passionate about TypeScript and web technologies.',
    age: 30,
    accountBalance: 1250.75,
    creditScore: 750,
    rating: 4.5,
    followersCount: 1500,
    monthlyIncome: 5000.0,
    birthDate: '1994-01-15',
    lastLoginAt: '2025-01-15T10:30:00Z',
    street: '123 Main Street',
    city: 'New York',
    zipCode: '10001',
    country: 'US',
    theme: 'dark',
    language: 'en-US',
    timezone: 'America/New_York',
};

/**
 * Example of how to use the User type with validation functions
 *
 * Note: In a real application, you would use these with mion's
 * validation functions like isTypeFn, mockTypeFn, etc.
 */
export const userExamples = {
    // Valid examples
    validUsers: [
        {
            id: '550e8400-e29b-41d4-a716-446655440001',
            email: 'maria.garcia@example.es',
            firstName: 'María',
            lastName: 'García',
            username: 'maria_garcia',
            phoneNumber: '+34123456789',
            age: 25,
            accountBalance: 500.0,
            creditScore: 680,
            followersCount: 250,
            birthDate: '1999-03-20',
        },
        {
            id: '550e8400-e29b-41d4-a716-446655440002',
            email: 'alex.smith@example.com',
            firstName: 'Alexander',
            lastName: 'Smith',
            username: 'alex_smith',
            phoneNumber: '+447700900123',
            age: 45,
            accountBalance: -500.0, // Overdraft allowed
            creditScore: 820,
            followersCount: 5000,
            monthlyIncome: 8500.0,
            birthDate: '1979-11-08',
            rating: 5.0,
        },
    ] as User[],

    // Examples that would fail validation
    invalidExamples: {
        // These would fail validation due to format constraints:

        // Invalid email
        invalidEmail: 'not-an-email',

        // Username too short
        invalidUsername: 'ab',

        // Age out of range
        invalidAge: 150,

        // Invalid phone number format
        invalidPhone: '123-456-7890', // Missing country code

        // Invalid country code
        invalidCountry: 'USA', // Should be 2 letters

        // Credit score out of range
        invalidCreditScore: 900, // Max is 850
    } as Partial<User>,
};

// ############### Regex Patterns ###############

/**
 * Pattern for names and city names - supports international characters
 *
 * Includes:
 * - Basic Latin: A-Z, a-z
 * - Latin with accents: À, é, ñ, ü, etc. (European languages)
 * - Cyrillic: А, Б, В, Г, etc. (Russian, Bulgarian, Serbian, etc.)
 * - Hiragana: あ, い, う, え, etc. (Japanese)
 * - Katakana: ア, イ, ウ, エ, etc. (Japanese)
 * - CJK Ideographs: 中, 国, 日, 本, etc. (Chinese, Japanese, Korean)
 * - Arabic: ا, ب, ت, ث, etc. (Arabic, Persian, Urdu, etc.)
 * - Spaces, hyphens, and apostrophes for compound names
 *
 * Examples: John, María, Jean-Pierre, O'Connor, Александр, 田中, محمد, São Paulo, München
 */
const internationalNamePattern =
    /^[a-zA-ZÀ-ÿ\u0100-\u017F\u0400-\u04FF\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF\u0600-\u06FF\s'-]+$/;

/**
 * Pattern for usernames - simple alphanumeric with underscore and hyphen
 * Examples: john_doe, user123, cool-user, alpha_beta
 */
const usernamePattern = /^[a-zA-Z0-9_-]+$/;

/**
 * Pattern for international phone numbers in E.164 format
 * Must start with + followed by country code (1-9) and 1-14 more digits
 * Examples: +1234567890, +447700900123, +33123456789
 */
const phonePattern = /^\+[1-9]\d{1,14}$/;

// City names use the same pattern as personal names
const cityPattern = internationalNamePattern;

/**
 * Pattern for postal codes - flexible international format
 * Supports various formats: 12345, 10001, SW1A 1AA, K1A 0A6, 75001
 * Allows: uppercase letters, numbers, spaces, and hyphens (3-10 characters)
 */
const postalCodePattern = /^[A-Z0-9\s-]{3,10}$/;

/**
 * Pattern for country codes (ISO 3166-1 alpha-2)
 * Exactly 2 uppercase letters: US, CA, GB, DE, FR, JP, AU, etc.
 */
const countryCodePattern = /^[A-Z]{2}$/;

/**
 * Pattern for language codes (ISO 639-1 with optional country)
 * Format: "en" or "en-US" (language code optionally followed by country)
 */
const languageCodePattern = /^[a-z]{2}(-[A-Z]{2})?$/;

/**
 * Pattern for timezone in IANA format
 * Format: "Continent/City" like "America/New_York", "Europe/London"
 * Strict IANA format: Capital first letter, then lowercase/underscores/capitals for compound names
 */
const timezonePattern = /^[A-Z][a-zA-Z_]*\/[A-Z][a-zA-Z_]*$/;

// ############### Pattern Types ###############

export type NamePattern = {
    val: typeof internationalNamePattern;
    errorMessage: 'Name must contain only letters, spaces, hyphens, and apostrophes (supports Unicode)';
    mockSamples: ['John', 'María', 'Jean-Pierre', "O'Connor", 'Александр', '田中', 'محمد'];
};

type UsernamePattern = {
    val: typeof usernamePattern;
    errorMessage: 'Username can only contain letters, numbers, underscores, and hyphens';
    mockSamples: ['john_doe', 'user123', 'cool-user', 'alpha_beta'];
};

type PhonePattern = {
    val: typeof phonePattern;
    errorMessage: 'Phone number must be in international format (+1234567890)';
    mockSamples: ['+1234567890', '+447700900123', '+33123456789', '+81312345678'];
};

type CityPattern = {
    val: typeof cityPattern;
    errorMessage: 'City name must contain only letters, spaces, hyphens, and apostrophes';
    mockSamples: ['New York', 'São Paulo', 'München', 'Москва', '東京', 'القاهرة'];
};

type PostalCodePattern = {
    val: typeof postalCodePattern;
    errorMessage: 'Invalid postal code format';
    mockSamples: ['12345', '10001', 'SW1A 1AA', 'K1A 0A6', '75001'];
};

type CountryCodePattern = {
    val: typeof countryCodePattern;
    errorMessage: 'Country code must be 2 uppercase letters (ISO 3166-1 alpha-2)';
    mockSamples: ['US', 'CA', 'GB', 'DE', 'FR', 'JP', 'AU'];
};

type LanguageCodePattern = {
    val: typeof languageCodePattern;
    errorMessage: 'Language code must be in format "en" or "en-US"';
    mockSamples: ['en', 'es', 'fr', 'de', 'ja', 'en-US', 'es-ES', 'fr-CA'];
};

type TimezonePattern = {
    val: typeof timezonePattern;
    errorMessage: 'Timezone must be in IANA format (e.g., America/New_York)';
    mockSamples: ['America/New_York', 'Europe/London', 'Asia/Tokyo', 'Australia/Sydney'];
};

type ThemeValues = {
    val: ['light', 'dark', 'auto'];
    errorMessage: 'Theme must be light, dark, or auto';
    mockSamples: ['light', 'dark', 'auto'];
};
