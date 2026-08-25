/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// The models the benchmark routes validate. mion derives its validators and
// serializers from THESE TYPES at build time, so this file is the single source of
// truth: every competitor's zod schema in ./zod-schemas.mjs mirrors it by hand, and
// ./payloads.mjs builds samples that satisfy it.
//
// NOTE: regular imports only where these are consumed - `import type` erases the
// type before the resolver can see it, and the route would compile with no validator.

// ============ Light model (~100 byte payload) ============
export interface SimpleUser {
  id: number;
  name: string;
  surname: string;
  lastUpdate: Date;
}

// ============ Heavy model (~1 KB payload) ============
export type UserRole = 'admin' | 'user' | 'guest' | 'moderator';

export type AccountStatus = 'active' | 'suspended' | 'pending_verification' | 'deactivated';

export interface Address {
  street: string;
  city: string;
  state: string;
  zipCode: string;
  country: string;
}

export interface NotificationSettings {
  email: boolean;
  sms: boolean;
  push: boolean;
  frequency: 'immediate' | 'daily' | 'weekly';
}

export interface UserPreferences {
  theme: 'light' | 'dark' | 'system';
  language: string;
  timezone: string;
  notifications: NotificationSettings;
}

// A discriminated union, the shape that separates a real validator from a shallow one.
export type PaymentMethod =
  | {type: 'credit_card'; lastFourDigits: string; expiryMonth: number; expiryYear: number; brand: string}
  | {type: 'bank_account'; bankName: string; accountLastFour: string; routingNumber: string}
  | {type: 'paypal'; email: string};

export interface User {
  id: number;
  username: string;
  email: string;
  profile: {
    firstName: string;
    lastName: string;
    displayName: string;
    bio?: string;
    avatarUrl?: string;
    dateOfBirth: Date;
  };
  role: UserRole;
  status: AccountStatus;
  address: Address;
  paymentMethods: PaymentMethod[];
  preferences: UserPreferences;
  createdAt: Date;
  updatedAt: Date;
  lastLoginAt?: Date;
  tags: string[];
}
