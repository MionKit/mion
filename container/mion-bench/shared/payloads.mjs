/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// Request payload builders. ZERO third-party imports on purpose (the same rule the
// validation benchmark's shared/ tree follows), so this file can be mounted into any
// app's dir without dragging a dependency in.
//
// Every payload carries a UNIQUE id per request so no framework can serve a cached
// response: that would measure the cache, not the framework.

/** A ~100 byte user, matching SimpleUser in ./models.ts. */
export function buildSimpleUser() {
  return {
    id: Math.floor(Math.random() * Number.MAX_SAFE_INTEGER),
    name: 'John',
    surname: 'Doe',
    lastUpdate: '2024-01-15T10:30:00.000Z',
  };
}

/** A ~1 KB user, matching User in ./models.ts (nested objects + a discriminated union). */
export function buildUser(tags = ['premium', 'early-adopter', 'verified']) {
  return {
    id: Math.floor(Math.random() * Number.MAX_SAFE_INTEGER),
    username: 'john_smith',
    email: 'john.smith@example.com',
    profile: {
      firstName: 'John',
      lastName: 'Smith',
      displayName: 'John S.',
      bio: 'Software developer and tech enthusiast',
      avatarUrl: 'https://example.com/avatars/john.jpg',
      dateOfBirth: '1990-05-15T00:00:00.000Z',
    },
    role: 'user',
    status: 'active',
    address: {street: '123 Main Street', city: 'San Francisco', state: 'CA', zipCode: '94102', country: 'USA'},
    paymentMethods: [
      {type: 'credit_card', lastFourDigits: '4242', expiryMonth: 12, expiryYear: 2025, brand: 'visa'},
      {type: 'paypal', email: 'john.paypal@example.com'},
    ],
    preferences: {
      theme: 'dark',
      language: 'en-US',
      timezone: 'America/Los_Angeles',
      notifications: {email: true, sms: false, push: true, frequency: 'daily'},
    },
    createdAt: '2020-01-15T10:30:00.000Z',
    updatedAt: '2024-12-17T02:24:00.000Z',
    lastLoginAt: '2024-12-16T18:45:00.000Z',
    tags,
  };
}

// -- Payload size sweep -------------------------------------------------------
// The uws adapter takes a zero-copy path only for a body BIGGER than one socket
// read (512 KiB), so a sweep that stops at a few KB never exercises the branch that
// matters. These sizes straddle it deliberately: two below, one just under, one well above.
export const SWEEP_SIZES = [
  {key: 'small', label: '~1 KB', bytes: 1024},
  {key: 'medium', label: '~50 KB', bytes: 50 * 1024},
  {key: 'large', label: '~500 KB', bytes: 500 * 1024},
  {key: 'huge', label: '~4 MB', bytes: 4 * 1024 * 1024},
];

/**
 * A User padded to approximately `bytes` of JSON by growing its `tags` array - the
 * one unbounded string[] in the model, so the padding stays VALID against the type
 * and every competitor validates the whole payload rather than skipping a stray field.
 */
export function buildUserOfSize(bytes) {
  const base = JSON.stringify(buildUser([])).length;
  const tagLength = 64;
  // Each padded tag costs its own length plus the quotes and the comma around it.
  const perTag = tagLength + 3;
  const count = Math.max(0, Math.ceil((bytes - base) / perTag));
  const tags = Array.from({length: count}, (_, i) => String(i).padStart(8, '0').padEnd(tagLength, 'x'));
  return buildUser(tags);
}

/** mion's wire shape: a bare array of the route's arguments (the router reconstructs it). */
export const mionBody = (...args) => JSON.stringify(args);

/** Every other framework takes the argument object on its own. */
export const plainBody = (arg) => JSON.stringify(arg);
