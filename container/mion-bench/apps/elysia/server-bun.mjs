/* ########
 * 2026 mion · License: MIT
 * ######## */
// elysia runs on bun only. It validates with TypeBox (its built-in `t` schemas)
// rather than zod, which is the idiomatic way to use it - the comparison is between
// frameworks as their users would write them, not between forced-identical stacks.
import {Elysia, t} from 'elysia';
import {updateSimpleUser, updateUser} from '../../shared/zod-schemas.mjs';

const port = Number(process.env.MION_BENCH_PORT || 3000);

const Address = t.Object({
  street: t.String(),
  city: t.String(),
  state: t.String(),
  zipCode: t.String(),
  country: t.String(),
});

const PaymentMethod = t.Union([
  t.Object({
    type: t.Literal('credit_card'),
    lastFourDigits: t.String(),
    expiryMonth: t.Number(),
    expiryYear: t.Number(),
    brand: t.String(),
  }),
  t.Object({type: t.Literal('bank_account'), bankName: t.String(), accountLastFour: t.String(), routingNumber: t.String()}),
  t.Object({type: t.Literal('paypal'), email: t.String()}),
]);

const User = t.Object({
  id: t.Number(),
  username: t.String(),
  email: t.String(),
  profile: t.Object({
    firstName: t.String(),
    lastName: t.String(),
    displayName: t.String(),
    bio: t.Optional(t.String()),
    avatarUrl: t.Optional(t.String()),
    dateOfBirth: t.String(),
  }),
  role: t.Union([t.Literal('admin'), t.Literal('user'), t.Literal('guest'), t.Literal('moderator')]),
  status: t.Union([t.Literal('active'), t.Literal('suspended'), t.Literal('pending_verification'), t.Literal('deactivated')]),
  address: Address,
  paymentMethods: t.Array(PaymentMethod),
  preferences: t.Object({
    theme: t.Union([t.Literal('light'), t.Literal('dark'), t.Literal('system')]),
    language: t.String(),
    timezone: t.String(),
    notifications: t.Object({
      email: t.Boolean(),
      sms: t.Boolean(),
      push: t.Boolean(),
      frequency: t.Union([t.Literal('immediate'), t.Literal('daily'), t.Literal('weekly')]),
    }),
  }),
  createdAt: t.String(),
  updatedAt: t.String(),
  lastLoginAt: t.Optional(t.String()),
  tags: t.Array(t.String()),
});

const SimpleUser = t.Object({id: t.Number(), name: t.String(), surname: t.String(), lastUpdate: t.String()});

// TypeBox validates but does not deserialize, so the dates arrive as strings; the
// shared handlers only assign new Dates, so they work on either shape.
new Elysia()
  .get('/hello', () => ({hello: 'world'}))
  .post('/updateUser', ({body}) => updateUser(body), {body: User})
  .post('/updateSimpleUser', ({body}) => updateSimpleUser(body), {body: SimpleUser})
  .listen(port);
