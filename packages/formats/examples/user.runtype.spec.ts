/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {isTypeFn, mockTypeFn, typeErrorsFn} from '@mionkit/run-types';
import {User, exampleUser, userExamples} from './user.runtype';

// ############### Basic User Validation Tests ###############

it('should validate complete valid user', async () => {
    const isType = await isTypeFn<User>();
    expect(isType(exampleUser)).toBe(true);
});

it('should validate minimal valid user', async () => {
    const isType = await isTypeFn<User>();
    const minimalUser = {
        id: '550e8400-e29b-41d4-a716-446655440000',
        email: 'test@example.com',
        firstName: 'John',
        lastName: 'Doe',
        username: 'johndoe',
        phoneNumber: '+1234567890',
        age: 25,
        accountBalance: 0,
        creditScore: 650,
        followersCount: 0,
        birthDate: '1999-01-01',
    };
    expect(isType(minimalUser)).toBe(true);
});

it('should validate example users from userExamples', async () => {
    const isType = await isTypeFn<User>();
    for (const user of userExamples.validUsers) {
        expect(isType(user)).toBe(true);
    }
});

// ############### String Format Validation Tests ###############

// firstName validation tests
it('should accept valid international names', async () => {
    const isType = await isTypeFn<User>();
    const validNames = ['John', 'María', 'Jean-Pierre', "O'Connor", 'Александр', '田中', 'محمد'];

    for (const name of validNames) {
        const user = {...exampleUser, firstName: name};
        expect(isType(user)).toBe(true);
    }
});

it('should reject names that are too short', async () => {
    const isType = await isTypeFn<User>();
    const user = {...exampleUser, firstName: 'A'};
    expect(isType(exampleUser)).toBe(true);
    expect(isType(user)).toBe(false);
});

it('should reject names that are too long', async () => {
    const isType = await isTypeFn<User>();
    const user = {...exampleUser, firstName: 'A'.repeat(51)};
    expect(isType(user)).toBe(false);
});

it('should reject names with invalid characters', async () => {
    const isType = await isTypeFn<User>();
    const invalidNames = ['John123', 'John@Doe', 'John.Doe', 'John_Doe'];

    for (const name of invalidNames) {
        const user = {...exampleUser, firstName: name};
        expect(isType(user)).toBe(false);
    }
});

// username validation tests
it('should accept valid usernames', async () => {
    const isType = await isTypeFn<User>();
    const validUsernames = ['john_doe', 'user123', 'cool-user', 'alpha_beta'];

    for (const username of validUsernames) {
        const user = {...exampleUser, username};
        expect(isType(user)).toBe(true);
    }
});

it('should reject usernames that are too short', async () => {
    const isType = await isTypeFn<User>();
    const user = {...exampleUser, username: 'ab'};
    expect(isType(user)).toBe(false);
});

it('should reject usernames with invalid characters', async () => {
    const isType = await isTypeFn<User>();
    const invalidUsernames = ['john.doe', 'john@doe', 'john doe', 'john+doe'];

    for (const username of invalidUsernames) {
        const user = {...exampleUser, username};
        expect(isType(user)).toBe(false);
    }
});

// phoneNumber validation tests
it('should accept valid international phone numbers', async () => {
    const isType = await isTypeFn<User>();
    const validPhones = ['+1234567890', '+447700900123', '+33123456789', '+81312345678'];

    for (const phone of validPhones) {
        const user = {...exampleUser, phoneNumber: phone};
        expect(isType(user)).toBe(true);
    }
});

it('should reject phone numbers without country code', async () => {
    const isType = await isTypeFn<User>();
    const user = {...exampleUser, phoneNumber: '1234567890'};
    expect(isType(user)).toBe(false);
});

it('should reject phone numbers with invalid format', async () => {
    const isType = await isTypeFn<User>();
    const invalidPhones = ['+0123456789', '123-456-7890', '+1-234-567-890', '+12345'];

    for (const phone of invalidPhones) {
        const user = {...exampleUser, phoneNumber: phone};
        expect(isType(user)).toBe(false);
    }
});

// email validation tests
it('should accept valid email addresses', async () => {
    const isType = await isTypeFn<User>();
    const validEmails = ['user@example.com', 'test.email@domain.co.uk', 'user123@test-domain.org'];

    for (const email of validEmails) {
        const user = {...exampleUser, email};
        expect(isType(user)).toBe(true);
    }
});

it('should reject invalid email addresses', async () => {
    const isType = await isTypeFn<User>();
    const invalidEmails = ['invalid-email', '@domain.com', 'user@', 'user@@domain.com'];

    for (const email of invalidEmails) {
        const user = {...exampleUser, email};
        expect(isType(user)).toBe(false);
    }
});

// ############### Number Format Validation Tests ###############

// age validation tests
it('should accept valid ages', async () => {
    const isType = await isTypeFn<User>();
    const validAges = [13, 25, 65, 120];

    for (const age of validAges) {
        const user = {...exampleUser, age};
        expect(isType(user)).toBe(true);
    }
});

it('should reject ages below minimum', async () => {
    const isType = await isTypeFn<User>();
    const user = {...exampleUser, age: 12};
    expect(isType(user)).toBe(false);
});

it('should reject ages above maximum', async () => {
    const isType = await isTypeFn<User>();
    const user = {...exampleUser, age: 121};
    expect(isType(user)).toBe(false);
});

it('should reject non-integer ages', async () => {
    const isType = await isTypeFn<User>();
    const user = {...exampleUser, age: 25.5};
    expect(isType(user)).toBe(false);
});

// accountBalance validation tests
it('should accept valid account balances', async () => {
    const isType = await isTypeFn<User>();
    const validBalances = [-10000, -500.5, 0, 1250.75, 1000000];

    for (const balance of validBalances) {
        const user = {...exampleUser, accountBalance: balance};
        expect(isType(user)).toBe(true);
    }
});

it('should reject balances below minimum overdraft', async () => {
    const isType = await isTypeFn<User>();
    const user = {...exampleUser, accountBalance: -10000.01};
    expect(isType(user)).toBe(false);
});

it('should reject balances above maximum', async () => {
    const isType = await isTypeFn<User>();
    const user = {...exampleUser, accountBalance: 1000000.01};
    expect(isType(user)).toBe(false);
});

// creditScore validation tests
it('should accept valid credit scores', async () => {
    const isType = await isTypeFn<User>();
    const validScores = [300, 650, 750, 850];

    for (const score of validScores) {
        const user = {...exampleUser, creditScore: score};
        expect(isType(user)).toBe(true);
    }
});

it('should reject credit scores below minimum', async () => {
    const isType = await isTypeFn<User>();
    const user = {...exampleUser, creditScore: 299};
    expect(isType(user)).toBe(false);
});

it('should reject credit scores above maximum', async () => {
    const isType = await isTypeFn<User>();
    const user = {...exampleUser, creditScore: 851};
    expect(isType(user)).toBe(false);
});

// rating validation tests
it('should accept valid ratings', async () => {
    const isType = await isTypeFn<User>();
    const validRatings = [1, 2.5, 4, 5, 3.7, 4.2]; // Any precision allowed

    for (const rating of validRatings) {
        const user = {...exampleUser, rating};
        expect(isType(user)).toBe(true);
    }
});

it('should accept undefined rating', async () => {
    const isType = await isTypeFn<User>();
    const user = {...exampleUser};
    delete user.rating;
    expect(isType(user)).toBe(true);
});

it('should reject ratings below minimum', async () => {
    const isType = await isTypeFn<User>();
    const user = {...exampleUser, rating: 0.5};
    expect(isType(user)).toBe(false);
});

it('should reject ratings above maximum', async () => {
    const isType = await isTypeFn<User>();
    const user = {...exampleUser, rating: 5.5};
    expect(isType(user)).toBe(false);
});

// ############### Flattened Address and Preferences Validation Tests ###############

// address validation tests (flattened)
it('should accept valid address fields', async () => {
    const isType = await isTypeFn<User>();
    const user = {
        ...exampleUser,
        street: '123 Main Street',
        city: 'New York',
        zipCode: '10001',
        country: 'US',
    };
    expect(isType(user)).toBe(true);
});

it('should accept international address fields', async () => {
    const isType = await isTypeFn<User>();
    const internationalAddresses = [
        {street: 'Champs-Élysées 123', city: 'Paris', zipCode: '75001', country: 'FR'},
        {street: 'Alexanderplatz 1', city: 'Berlin', zipCode: '10178', country: 'DE'},
        {street: '新宿区西新宿1-1-1', city: '東京', zipCode: '160-0023', country: 'JP'},
        {street: 'شارع التحرير 123', city: 'القاهرة', zipCode: '11511', country: 'EG'},
    ];

    for (const address of internationalAddresses) {
        const user = {...exampleUser, ...address};
        expect(isType(user)).toBe(true);
    }
});

it('should accept undefined address fields', async () => {
    const isType = await isTypeFn<User>();
    const user = {...exampleUser};
    delete user.street;
    delete user.city;
    delete user.zipCode;
    delete user.country;
    expect(isType(user)).toBe(true);
});

it('should reject invalid country codes', async () => {
    const isType = await isTypeFn<User>();
    const invalidCountries = ['USA', 'United States', 'us', '1', 'ABC'];

    for (const country of invalidCountries) {
        const user = {...exampleUser, country};
        expect(isType(user)).toBe(false);
    }
});

it('should reject invalid zip codes', async () => {
    const isType = await isTypeFn<User>();
    const invalidZipCodes = ['12', '12345678901', 'invalid-zip', ''];

    for (const zipCode of invalidZipCodes) {
        const user = {...exampleUser, zipCode};
        expect(isType(user)).toBe(false);
    }
});

// preferences validation tests (flattened)
it('should accept valid preference fields', async () => {
    const isType = await isTypeFn<User>();
    const user = {
        ...exampleUser,
        theme: 'dark' as const,
        language: 'en-US',
        timezone: 'America/New_York',
    };
    expect(isType(user)).toBe(true);
});

it('should accept all valid theme values', async () => {
    const isType = await isTypeFn<User>();
    const validThemes = ['light', 'dark', 'auto'] as const;

    for (const theme of validThemes) {
        const user = {...exampleUser, theme};
        expect(isType(user)).toBe(true);
    }
});

it('should accept various language codes', async () => {
    const isType = await isTypeFn<User>();
    const validLanguages = ['en', 'es', 'fr', 'de', 'ja', 'en-US', 'es-ES', 'fr-CA'];

    for (const language of validLanguages) {
        const user = {...exampleUser, language};
        expect(isType(user)).toBe(true);
    }
});

it('should accept various timezone formats', async () => {
    const isType = await isTypeFn<User>();
    const validTimezones = ['America/New_York', 'Europe/London', 'Asia/Tokyo', 'Australia/Sydney', 'America/Los_Angeles'];

    for (const timezone of validTimezones) {
        const user = {...exampleUser, timezone};
        expect(isType(user)).toBe(true);
    }
});

it('should reject invalid theme values', async () => {
    const isType = await isTypeFn<User>();
    const invalidThemes = ['bright', 'night', 'custom', ''];

    for (const theme of invalidThemes) {
        const user = {...exampleUser, theme: theme as any};
        expect(isType(user)).toBe(false);
    }
});

it('should reject invalid language codes', async () => {
    const isType = await isTypeFn<User>();
    const invalidLanguages = ['english', 'EN', 'en_US', 'en-us', 'e', 'eng'];

    for (const language of invalidLanguages) {
        const user = {...exampleUser, language};
        expect(isType(user)).toBe(false);
    }
});

it('should reject invalid timezone formats', async () => {
    const isType = await isTypeFn<User>();
    const invalidTimezones = ['EST', 'UTC+5', 'New York', 'America-New_York', 'america/new_york'];

    for (const timezone of invalidTimezones) {
        const user = {...exampleUser, timezone};
        expect(isType(user)).toBe(false);
    }
});

// ############### Error Validation Tests ###############

// error reporting tests
it('should return specific errors for invalid firstName', async () => {
    const typeErrors = await typeErrorsFn<User>();
    const userWithInvalidName = {...exampleUser, firstName: 'A'};
    const errors = typeErrors(userWithInvalidName);

    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].path).toEqual(['firstName']);
    expect(errors[0].expected).toBe('string');
    expect(errors[0].format?.name).toBe('stringFormat');
});

it('should return specific errors for invalid age', async () => {
    const typeErrors = await typeErrorsFn<User>();
    const userWithInvalidAge = {...exampleUser, age: 12};
    const errors = typeErrors(userWithInvalidAge);

    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].path).toEqual(['age']);
    expect(errors[0].expected).toBe('number');
    expect(errors[0].format?.name).toBe('numberFormat');
});

it('should return specific errors for invalid email', async () => {
    const typeErrors = await typeErrorsFn<User>();
    const userWithInvalidEmail = {...exampleUser, email: 'invalid-email'};
    const errors = typeErrors(userWithInvalidEmail);

    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].path).toEqual(['email']);
    expect(errors[0].expected).toBe('string');
    expect(errors[0].format?.name).toBe('email');
});

it('should return specific errors for invalid flattened address field', async () => {
    const typeErrors = await typeErrorsFn<User>();
    const userWithInvalidAddress = {
        ...exampleUser,
        country: 'USA', // Invalid country code (should be 2 letters)
    };
    const errors = typeErrors(userWithInvalidAddress);

    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].path).toEqual(['country']);
    expect(errors[0].expected).toBe('string');
    expect(errors[0].format?.name).toBe('stringFormat');
});

it('should return multiple errors for multiple invalid fields', async () => {
    const typeErrors = await typeErrorsFn<User>();
    const userWithMultipleErrors = {
        ...exampleUser,
        firstName: 'A', // Too short
        age: 12, // Too young
        email: 'invalid-email', // Invalid format
    };
    const errors = typeErrors(userWithMultipleErrors);
    expect(errors.length).toBe(3);
    const paths = errors.map((e) => e.path);
    expect(paths).toContainEqual(['firstName']);
    expect(paths).toContainEqual(['age']);
    expect(paths).toContainEqual(['email']);
});

// ############### Mock Generation Tests ###############

// mock generation tests
it('should generate valid user mocks', async () => {
    const mockType = await mockTypeFn<User>();
    const isType = await isTypeFn<User>();

    // Generate multiple mocks to test consistency
    const mocks = Array.from({length: 10}, () => mockType());

    for (const mock of mocks) {
        expect(isType(mock)).toBe(true);
    }
});

it('should generate mocks with proper string constraints', async () => {
    const mockType = await mockTypeFn<User>();
    const mocks = Array.from({length: 20}, () => mockType());

    for (const mock of mocks) {
        // Check firstName constraints
        expect(mock.firstName.length).toBeGreaterThanOrEqual(2);
        expect(mock.firstName.length).toBeLessThanOrEqual(50);

        // Check username constraints
        expect(mock.username.length).toBeGreaterThanOrEqual(3);
        expect(mock.username.length).toBeLessThanOrEqual(20);
        expect(mock.username).toMatch(/^[a-zA-Z0-9_-]+$/);

        // Check phone number format
        expect(mock.phoneNumber).toMatch(/^\+[1-9]\d{1,14}$/);

        // Check email format
        expect(mock.email).toContain('@');
        expect(mock.email).toContain('.');
    }
});

it('should generate mocks with proper number constraints', async () => {
    const mockType = await mockTypeFn<User>();
    const mocks = Array.from({length: 20}, () => mockType());

    for (const mock of mocks) {
        // Check age constraints
        expect(mock.age).toBeGreaterThanOrEqual(13);
        expect(mock.age).toBeLessThanOrEqual(120);
        expect(Number.isInteger(mock.age)).toBe(true);

        // Check account balance constraints
        expect(mock.accountBalance).toBeGreaterThanOrEqual(-10000);
        expect(mock.accountBalance).toBeLessThanOrEqual(1000000);

        // Check credit score constraints
        expect(mock.creditScore).toBeGreaterThanOrEqual(300);
        expect(mock.creditScore).toBeLessThanOrEqual(850);
        expect(Number.isInteger(mock.creditScore)).toBe(true);

        // Check followers count (positive integer)
        expect(mock.followersCount).toBeGreaterThanOrEqual(0);
        expect(Number.isInteger(mock.followersCount)).toBe(true);
    }
});

it('should generate mocks with valid optional rating when present', async () => {
    const mockType = await mockTypeFn<User>();
    const mocks = Array.from({length: 20}, () => mockType());
    const mocksWithRating = mocks.filter((mock) => mock.rating !== undefined);

    // If any mocks have rating, they should be valid 1-5 range
    mocksWithRating.forEach((mock) => {
        expect(mock.rating).toBeGreaterThanOrEqual(1);
        expect(mock.rating).toBeLessThanOrEqual(5);
    });
});

it('should generate mocks with valid optional website when present', async () => {
    const mockType = await mockTypeFn<User>();
    const mocks = Array.from({length: 20}, () => mockType());
    const mocksWithWebsite = mocks.filter((mock) => mock.website !== undefined);

    // If any mocks have website, they should be valid
    mocksWithWebsite.forEach((mock) => {
        expect(mock.website).toMatch(/^https?:\/\//);
    });
});

it('should generate mocks with valid optional address fields when present', async () => {
    const mockType = await mockTypeFn<User>();
    const mocks = Array.from({length: 20}, () => mockType());
    const mocksWithCountry = mocks.filter((mock) => mock.country !== undefined);
    const mocksWithZipCode = mocks.filter((mock) => mock.zipCode !== undefined);

    // If any mocks have country, they should be valid
    mocksWithCountry.forEach((mock) => {
        expect(mock.country).toMatch(/^[A-Z]{2}$/);
    });

    // If any mocks have zipCode, they should be valid
    mocksWithZipCode.forEach((mock) => {
        expect(mock.zipCode).toMatch(/^[A-Z0-9\s-]{3,10}$/);
    });
});

it('should generate mocks with valid optional preference fields when present', async () => {
    const mockType = await mockTypeFn<User>();
    const mocks = Array.from({length: 20}, () => mockType());
    const mocksWithTheme = mocks.filter((mock) => mock.theme !== undefined);
    const mocksWithLanguage = mocks.filter((mock) => mock.language !== undefined);
    const mocksWithTimezone = mocks.filter((mock) => mock.timezone !== undefined);

    // If any mocks have theme, they should be valid
    mocksWithTheme.forEach((mock) => {
        expect(['light', 'dark', 'auto']).toContain(mock.theme);
    });

    // If any mocks have language, they should be valid
    mocksWithLanguage.forEach((mock) => {
        expect(mock.language).toMatch(/^[a-z]{2}(-[A-Z]{2})?$/);
    });

    // If any mocks have timezone, they should be valid
    mocksWithTimezone.forEach((mock) => {
        expect(mock.timezone).toMatch(/^[A-Za-z_]+\/[A-Za-z_]+$/);
    });
});

it('should generate diverse mock data', async () => {
    const mockType = await mockTypeFn<User>();
    const mocks = Array.from({length: 50}, () => mockType());

    // Check that we get diverse data (not all the same)
    const firstNames = new Set(mocks.map((m) => m.firstName));
    const ages = new Set(mocks.map((m) => m.age));
    const balances = new Set(mocks.map((m) => m.accountBalance));

    expect(firstNames.size).toBeGreaterThan(1);
    expect(ages.size).toBeGreaterThan(1);
    expect(balances.size).toBeGreaterThan(1);
});
