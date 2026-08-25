/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// The competitor schemas: a hand-written zod mirror of the TypeScript types in
// ./models.ts, which is what mion derives its own validators from. This is the whole
// point of the comparison - mion writes the type once, everyone else writes it twice.
//
// Exported as a FACTORY taking `z`, so this file imports nothing itself. shared/ is
// mounted into every app dir, and each app resolves zod from its OWN node_modules;
// a bare `import {z} from 'zod'` here would resolve from shared/ and find nothing.
export function makeSchemas(z) {
  const AddressSchema = z.object({
    street: z.string(),
    city: z.string(),
    state: z.string(),
    zipCode: z.string(),
    country: z.string(),
  });

  const NotificationSettingsSchema = z.object({
    email: z.boolean(),
    sms: z.boolean(),
    push: z.boolean(),
    frequency: z.enum(['immediate', 'daily', 'weekly']),
  });

  const UserPreferencesSchema = z.object({
    theme: z.enum(['light', 'dark', 'system']),
    language: z.string(),
    timezone: z.string(),
    notifications: NotificationSettingsSchema,
  });

  const PaymentMethodSchema = z.discriminatedUnion('type', [
    z.object({
      type: z.literal('credit_card'),
      lastFourDigits: z.string(),
      expiryMonth: z.number(),
      expiryYear: z.number(),
      brand: z.string(),
    }),
    z.object({
      type: z.literal('bank_account'),
      bankName: z.string(),
      accountLastFour: z.string(),
      routingNumber: z.string(),
    }),
    z.object({type: z.literal('paypal'), email: z.string()}),
  ]);

  const ProfileSchema = z.object({
    firstName: z.string(),
    lastName: z.string(),
    displayName: z.string(),
    bio: z.string().optional(),
    avatarUrl: z.string().optional(),
    // coerce, so the competitor gets a real Date out of the JSON string - the same
    // deserialization mion does for free. Comparing against a plain z.string() here
    // would be comparing different amounts of work.
    dateOfBirth: z.coerce.date(),
  });

  // .strict() rejects unknown keys, matching mion's strictTypes behaviour.
  const UserSchema = z
    .object({
      id: z.number(),
      username: z.string(),
      email: z.string(),
      profile: ProfileSchema,
      role: z.enum(['admin', 'user', 'guest', 'moderator']),
      status: z.enum(['active', 'suspended', 'pending_verification', 'deactivated']),
      address: AddressSchema,
      paymentMethods: z.array(PaymentMethodSchema),
      preferences: UserPreferencesSchema,
      createdAt: z.coerce.date(),
      updatedAt: z.coerce.date(),
      lastLoginAt: z.coerce.date().optional(),
      tags: z.array(z.string()),
    })
    .strict();

  const SimpleUserSchema = z
    .object({
      id: z.number(),
      name: z.string(),
      surname: z.string(),
      lastUpdate: z.coerce.date(),
    })
    .strict();

  return {UserSchema, SimpleUserSchema};
}

// The two handlers every app implements, kept here so a competitor can never quietly
// do less work than the others (each one only supplies its framework's plumbing).
export function updateUser(user) {
  user.updatedAt = new Date();
  user.lastLoginAt = new Date();
  user.profile.displayName = `${user.profile.firstName} ${user.profile.lastName.charAt(0)}.`;
  return user;
}

export function updateSimpleUser(user) {
  user.lastUpdate = new Date();
  return user;
}
