/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// Date and Time
export const UTC_TIME_REGEX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;
export const DATE_TIME_REGEX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;
export const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
export const TIME_REGEX = /^\d{2}:\d{2}:\d{2}$/;

// BASIC EMAIL REGEX: complexity: Low | Accuracy: Low
// Ensures the email has at least one character before and after the @ symbol.
// Validates the presence of a domain with a dot (e.g., .com).
// Rejects whitespace.
// Simple and efficient.
// May accept invalid email formats (e.g., missing top-level domain like user@domain).
export const BASIC_EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// BASIC EMAIL REGEX: complexity: Medium | Accuracy: Medium
// Limits characters in the local part (before @) to alphanumerics and a few special characters (._%+-).
// Ensures the domain (after @) contains valid characters (a-zA-Z0-9.-).
// Enforces a top-level domain of at least two characters (e.g., .com or .org).
// Better validation of common email formats.
// Still allows invalid formats, like consecutive dots (e.g., user..name@domain.com)
export const EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

// RFC 5322 Lite REGEX: complexity: Medium | Accuracy: High
// Supports a broader range of characters in the local part as defined by RFC 5322.
// Validates the domain with multiple subdomains (e.g., user@sub.domain.com).
// Prohibits invalid sequences like a trailing dot in the domain.
// Balances complexity and accuracy.
// May accept some invalid formats, like emails starting with special characters
export const EMAIL_RFC_5322_LITE = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)*$/;

// STRICT EMAIL REGEX: complexity: High | Accuracy: High
// Enforces valid sequences of characters in the local part with dots only between valid segments.
// Requires the domain to have valid subdomains and top-level domains.
// Closely adheres to RFC 5322 standards.
// More complex and computationally expensive.
export const EMAIL_STRICT =
    /^(?:[a-zA-Z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-zA-Z0-9!#$%&'*+/=?^_`{|}~-]+)*)@(?:[a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}$/;

// RFC 5322 Full REGEX : complexity: Very High | Accuracy: Very High
// Supports quoted local parts (e.g., "user@domain"@example.com).
// Allows escaped characters (e.g., \" within quotes).
// Adheres fully to the RFC 5322 specification.
// The most accurate for validating legitimate email formats.
// Extremely complex and may over-validate, making it harder to maintain and debug
export const EMAIL_RFC_5322 =
    /^(?:[a-zA-Z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-zA-Z0-9!#$%&'*+/=?^_`{|}~-]+)*|"(?:\\[^\r\n]|[^\\"])*")@[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)*$/;

// Internet

export const DOMAIN_REGEX = /^[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)*$/;
export const URL_REGEX = /^(https?):\/\/[^\s/$.?#].[^\s]*$/;
export const URL_EXTENDED_REGEX = /^(https?|ftp|file|mailto|data):\/\/[^\s/$.?#].[^\s]*$/;
export const PHONE_REGEX = /^\+?[0-9]{1,3}-?[0-9]{3,14}$/;
export const IP_REGEX = /^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/;
export const IPV4_REGEX = /^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/;
export const IPV6_REGEX = /^(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$/;
export const IPV4_RANGE_REGEX = /^(?:[0-9]{1,3}\.){3}[0-9]{1,3}\/[0-9]{1,2}$/;

// IDs
export const UUID_REGEX = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
