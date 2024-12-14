/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */
import {
    UTC_TIME_REGEX,
    DATE_TIME_REGEX,
    DATE_REGEX,
    TIME_REGEX,
    BASIC_EMAIL_REGEX,
    EMAIL_REGEX,
    EMAIL_RFC_5322_LITE,
    EMAIL_STRICT,
    EMAIL_RFC_5322,
    DOMAIN_REGEX,
    URL_REGEX,
    URL_EXTENDED_REGEX,
    PHONE_REGEX,
    IP_REGEX,
    IPV4_REGEX,
    IPV6_REGEX,
    IPV4_RANGE_REGEX,
    UUID_REGEX,
} from './regexp';

it('UTC_TIME_REGEX', () => {
    // Success cases
    expect(UTC_TIME_REGEX.test('2023-10-29T14:30:00Z')).toBe(true); // Valid ISO 8601 date-time string with 'Z' timezone indicator
    expect(UTC_TIME_REGEX.test('1999-12-31T23:59:59Z')).toBe(true); // Valid ISO 8601 date-time string with 'Z' timezone indicator
    expect(UTC_TIME_REGEX.test('2000-01-01T00:00:00Z')).toBe(true); // Valid ISO 8601 date-time string with 'Z' timezone indicator
    expect(UTC_TIME_REGEX.test('2023-13-29T14:30:00Z')).toBe(true); // false positive, invalid month (13)

    // Failure cases
    expect(UTC_TIME_REGEX.test('2023-10-29T14:30:00')).toBe(false); // Missing 'Z' timezone indicator at the end
    expect(UTC_TIME_REGEX.test('2023-10-29 14:30:00Z')).toBe(false); // Space instead of 'T' separator
    expect(UTC_TIME_REGEX.test('2023/10/29T14:30:00Z')).toBe(false); // Slash instead of hyphen in date
    expect(UTC_TIME_REGEX.test('23-10-29T14:30:00Z')).toBe(false); // Two-digit year instead of four-digit

    expect(UTC_TIME_REGEX.test('2023-10-32T14:30:00Z')).toBe(false); // Invalid day (32)

    // Failure, does not accept non-UTC timezones
    expect(UTC_TIME_REGEX.test('2023-10-29T14:30:00+02:00')).toBe(false); // Timezone offset
    expect(UTC_TIME_REGEX.test('2023-10-29T14:30:00-05:00')).toBe(false); // Negative timezone offset
});

it('DATE_TIME_REGEX', () => {
    // Success cases
    expect(DATE_TIME_REGEX.test('2023-10-29T14:30:00Z')).toBe(true); // Valid ISO 8601 date-time string with 'Z' timezone indicator
    expect(DATE_TIME_REGEX.test('1999-12-31T23:59:59Z')).toBe(true); // Valid ISO 8601 date-time string with 'Z' timezone indicator
    expect(DATE_TIME_REGEX.test('2000-01-01T00:00:00Z')).toBe(true); // Valid ISO 8601 date-time string with 'Z' timezone indicator

    // Success, accepts non-UTC timezones
    expect(DATE_TIME_REGEX.test('2023-10-29T14:30:00+02:00')).toBe(true); // Timezone offset
    expect(DATE_TIME_REGEX.test('2023-10-29T14:30:00-05:00')).toBe(true); // Negative timezone offset

    // Failure cases
    expect(DATE_TIME_REGEX.test('2023-10-29T14:30:00')).toBe(false); // Missing 'Z' timezone indicator at the end
    expect(DATE_TIME_REGEX.test('2023-10-29 14:30:00Z')).toBe(false); // Space instead of 'T' separator
    expect(DATE_TIME_REGEX.test('2023/10/29T14:30:00Z')).toBe(false); // Slash instead of hyphen in date
    expect(DATE_TIME_REGEX.test('23-10-29T14:30:00Z')).toBe(false); // Two-digit year instead of four-digit
    expect(DATE_TIME_REGEX.test('2023-13-29T14:30:00Z')).toBe(false); // Invalid month (13)
    expect(DATE_TIME_REGEX.test('2023-10-32T14:30:00Z')).toBe(false); // Invalid day (32)
});

it('DATE_REGEX', () => {
    // Success cases
    expect(DATE_REGEX.test('2023-10-29')).toBe(true); // Valid date format
    expect(DATE_REGEX.test('1999-12-31')).toBe(true); // End of year date

    // Failure cases
    expect(DATE_REGEX.test('2023/10/29')).toBe(false); // Wrong separator
    expect(DATE_REGEX.test('2023-13-01')).toBe(false); // Invalid month
    expect(DATE_REGEX.test('2023-00-10')).toBe(false); // Zero month
});

it('TIME_REGEX', () => {
    // Success cases
    expect(TIME_REGEX.test('14:30:00')).toBe(true); // Valid time
    expect(TIME_REGEX.test('00:00:00')).toBe(true); // Midnight time

    // Failure cases
    expect(TIME_REGEX.test('24:00:00')).toBe(false); // Invalid hour
    expect(TIME_REGEX.test('12:60:00')).toBe(false); // Invalid minute
    expect(TIME_REGEX.test('12:30:60')).toBe(false); // Invalid second
});

it('BASIC_EMAIL_REGEX', () => {
    // Success cases
    expect(BASIC_EMAIL_REGEX.test('user@example.com')).toBe(true); // Simple email
    expect(BASIC_EMAIL_REGEX.test('user.name@sub.domain.com')).toBe(true); // Subdomain email

    // Failure cases
    expect(BASIC_EMAIL_REGEX.test('user@')).toBe(false); // Missing domain
    expect(BASIC_EMAIL_REGEX.test('@example.com')).toBe(false); // Missing local part
    expect(BASIC_EMAIL_REGEX.test('user@com')).toBe(false); // Missing domain dot
});

it('EMAIL_REGEX', () => {
    // Success cases
    expect(EMAIL_REGEX.test('user@example.com')).toBe(true); // Valid email
    expect(EMAIL_REGEX.test('user_name@example.co.uk')).toBe(true); // Email with underscore and country TLD

    // Failure cases
    expect(EMAIL_REGEX.test('user@domain')).toBe(false); // Missing TLD
    expect(EMAIL_REGEX.test('user@domain.c')).toBe(false); // TLD too short
    expect(EMAIL_REGEX.test('user@domain..com')).toBe(false); // Consecutive dots in domain
});

it('EMAIL_RFC_5322_LITE', () => {
    // Success cases
    expect(EMAIL_RFC_5322_LITE.test('user+tag@example.com')).toBe(true); // Plus sign in local part
    expect(EMAIL_RFC_5322_LITE.test('user%example@example.org')).toBe(true); // Percent sign in local part

    // Failure cases
    expect(EMAIL_RFC_5322_LITE.test('.user@example.com')).toBe(false); // Starts with dot
    expect(EMAIL_RFC_5322_LITE.test('user@-example.com')).toBe(false); // Domain starts with hyphen
    expect(EMAIL_RFC_5322_LITE.test('user@exam_ple.com')).toBe(false); // Underscore in domain
});

it('EMAIL_STRICT', () => {
    // Success cases
    expect(EMAIL_STRICT.test('user.name+tag@example.com')).toBe(true); // Complex local part
    expect(EMAIL_STRICT.test('user-name@example.io')).toBe(true); // Hyphen in local part

    // Failure cases
    expect(EMAIL_STRICT.test('user..name@example.com')).toBe(false); // Consecutive dots in local part
    expect(EMAIL_STRICT.test('user.@example.com')).toBe(false); // Ends with dot
    expect(EMAIL_STRICT.test('user@.example.com')).toBe(false); // Domain starts with dot
});

it('EMAIL_RFC_5322', () => {
    // Success cases
    expect(EMAIL_RFC_5322.test('"user@domain"@example.com')).toBe(true); // Quoted local part with special character
    expect(EMAIL_RFC_5322.test('"user name"@example.com')).toBe(true); // Quoted local part with space

    // Failure cases
    expect(EMAIL_RFC_5322.test('user@domain@example.com')).toBe(false); // Multiple @ symbols
    expect(EMAIL_RFC_5322.test('"user@example.com')).toBe(false); // Unclosed quotation
    expect(EMAIL_RFC_5322.test('user@ex%ample.com')).toBe(false); // Invalid character in domain
});

it('DOMAIN_REGEX', () => {
    // Success cases
    expect(DOMAIN_REGEX.test('example.com')).toBe(true); // Standard domain
    expect(DOMAIN_REGEX.test('sub.domain.co.uk')).toBe(true); // Multi-level domain

    // Failure cases
    expect(DOMAIN_REGEX.test('example_com')).toBe(false); // Underscore not allowed
    expect(DOMAIN_REGEX.test('.example.com')).toBe(false); // Starts with dot
    expect(DOMAIN_REGEX.test('example.com.')).toBe(false); // Ends with dot
});

it('URL_REGEX', () => {
    // Success cases
    expect(URL_REGEX.test('http://example.com')).toBe(true); // HTTP URL
    expect(URL_REGEX.test('https://example.com/path')).toBe(true); // HTTPS URL with path

    // Failure cases
    expect(URL_REGEX.test('ftp://example.com')).toBe(false); // Unsupported protocol
    expect(URL_REGEX.test('http://')).toBe(false); // Missing domain
    expect(URL_REGEX.test('example.com')).toBe(false); // Missing protocol
});

it('URL_EXTENDED_REGEX', () => {
    // Success cases
    expect(URL_EXTENDED_REGEX.test('ftp://example.com')).toBe(true); // FTP URL
    expect(URL_EXTENDED_REGEX.test('mailto:user@example.com')).toBe(true); // Mailto URL

    // Failure cases
    expect(URL_EXTENDED_REGEX.test('unsupported://example.com')).toBe(false); // Unsupported protocol
    expect(URL_EXTENDED_REGEX.test('http//example.com')).toBe(false); // Missing colon
    expect(URL_EXTENDED_REGEX.test('')).toBe(false); // Empty string
});

it('PHONE_REGEX', () => {
    // Success cases
    expect(PHONE_REGEX.test('+123-4567890123')).toBe(true); // International number with country code
    expect(PHONE_REGEX.test('1234567890')).toBe(true); // Standard 10-digit number

    // Failure cases
    expect(PHONE_REGEX.test('++1234567890')).toBe(false); // Double plus sign
    expect(PHONE_REGEX.test('12345')).toBe(false); // Too short
    expect(PHONE_REGEX.test('phone123')).toBe(false); // Contains letters
});

it('IP_REGEX', () => {
    // Success cases
    expect(IP_REGEX.test('192.168.1.1')).toBe(true); // Private network IP
    expect(IP_REGEX.test('8.8.8.8')).toBe(true); // Public DNS IP

    // Failure cases
    expect(IP_REGEX.test('256.256.256.256')).toBe(false); // Octets out of range
    expect(IP_REGEX.test('192.168.1')).toBe(false); // Incomplete IP
    expect(IP_REGEX.test('192.168.1.1.1')).toBe(false); // Too many octets
});

it('IPV4_REGEX', () => {
    // Success cases
    expect(IPV4_REGEX.test('127.0.0.1')).toBe(true); // Loopback IP
    expect(IPV4_REGEX.test('0.0.0.0')).toBe(true); // Zero IP

    // Failure cases
    expect(IPV4_REGEX.test('::1')).toBe(false); // IPv6 address
    expect(IPV4_REGEX.test('1234.123.123.123')).toBe(false); // Octet too long
    expect(IPV4_REGEX.test('abc.def.ghi.jkl')).toBe(false); // Non-numeric IP
});

it('IPV6_REGEX', () => {
    // Success cases
    expect(IPV6_REGEX.test('::1')).toBe(true); // Shortened IPv6 loopback
    expect(IPV6_REGEX.test('fe80::1ff:fe23:4567:890a')).toBe(true); // Valid IPv6 address

    // Failure cases
    expect(IPV6_REGEX.test('2001:db8:::1')).toBe(false); // Invalid shorthand
    expect(IPV6_REGEX.test('192.168.1.1')).toBe(false); // IPv4 address
    expect(IPV6_REGEX.test('::g')).toBe(false); // Invalid hexadecimal
});

it('IPV4_RANGE_REGEX', () => {
    // Success cases
    expect(IPV4_RANGE_REGEX.test('192.168.1.0/24')).toBe(true); // Valid CIDR notation
    expect(IPV4_RANGE_REGEX.test('10.0.0.0/8')).toBe(true); // Large network CIDR

    // Failure cases
    expect(IPV4_RANGE_REGEX.test('192.168.1.0/33')).toBe(false); // Invalid subnet mask
    expect(IPV4_RANGE_REGEX.test('192.168.1.0')).toBe(false); // Missing CIDR notation
    expect(IPV4_RANGE_REGEX.test('192.168.1.0/abc')).toBe(false); // Non-numeric subnet
});

it('UUID_REGEX', () => {
    // Success cases
    expect(UUID_REGEX.test('550e8400-e29b-41d4-a716-446655440000')).toBe(true); // Valid UUID v4
    expect(UUID_REGEX.test('123e4567-e89b-12d3-a456-426614174000')).toBe(true); // Valid UUID v1

    // Failure cases
    expect(UUID_REGEX.test('550e8400e29b41d4a716446655440000')).toBe(false); // Missing hyphens
    expect(UUID_REGEX.test('550e8400-e29b-41d4-a716-44665544000Z')).toBe(false); // Invalid character
    expect(UUID_REGEX.test('550e8400-e29b-41d4-a716-4466')).toBe(false); // Too short
});
