/* ########
 * 2026 mion · License: MIT
 * ######## */
// Fastify with its NATIVE JSON Schema validation + serialization, which is how a
// fastify user gets speed - swapping in zod here would measure a slower setup than
// the framework's own recommended one.
import Fastify from 'fastify';
import {updateSimpleUser, updateUser} from '../../shared/zod-schemas.mjs';

const port = Number(process.env.MION_BENCH_PORT || 3000);
// 10 MB so a multi-MB body is accepted rather than 413'd (fastify defaults to 1 MB).
const app = Fastify({bodyLimit: 10 * 1024 * 1024});

const address = {
  type: 'object',
  required: ['street', 'city', 'state', 'zipCode', 'country'],
  properties: {
    street: {type: 'string'},
    city: {type: 'string'},
    state: {type: 'string'},
    zipCode: {type: 'string'},
    country: {type: 'string'},
  },
};

const paymentMethod = {
  type: 'object',
  required: ['type'],
  properties: {
    type: {type: 'string', enum: ['credit_card', 'bank_account', 'paypal']},
    lastFourDigits: {type: 'string'},
    expiryMonth: {type: 'number'},
    expiryYear: {type: 'number'},
    brand: {type: 'string'},
    bankName: {type: 'string'},
    accountLastFour: {type: 'string'},
    routingNumber: {type: 'string'},
    email: {type: 'string'},
  },
};

const user = {
  type: 'object',
  required: ['id', 'username', 'email', 'profile', 'role', 'status', 'address', 'paymentMethods', 'preferences', 'createdAt', 'updatedAt', 'tags'],
  properties: {
    id: {type: 'number'},
    username: {type: 'string'},
    email: {type: 'string'},
    profile: {
      type: 'object',
      required: ['firstName', 'lastName', 'displayName', 'dateOfBirth'],
      properties: {
        firstName: {type: 'string'},
        lastName: {type: 'string'},
        displayName: {type: 'string'},
        bio: {type: 'string'},
        avatarUrl: {type: 'string'},
        dateOfBirth: {type: 'string'},
      },
    },
    role: {type: 'string', enum: ['admin', 'user', 'guest', 'moderator']},
    status: {type: 'string', enum: ['active', 'suspended', 'pending_verification', 'deactivated']},
    address: address,
    paymentMethods: {type: 'array', items: paymentMethod},
    preferences: {
      type: 'object',
      required: ['theme', 'language', 'timezone', 'notifications'],
      properties: {
        theme: {type: 'string', enum: ['light', 'dark', 'system']},
        language: {type: 'string'},
        timezone: {type: 'string'},
        notifications: {
          type: 'object',
          required: ['email', 'sms', 'push', 'frequency'],
          properties: {
            email: {type: 'boolean'},
            sms: {type: 'boolean'},
            push: {type: 'boolean'},
            frequency: {type: 'string', enum: ['immediate', 'daily', 'weekly']},
          },
        },
      },
    },
    createdAt: {type: 'string'},
    updatedAt: {type: 'string'},
    lastLoginAt: {type: 'string'},
    tags: {type: 'array', items: {type: 'string'}},
  },
};

const simpleUser = {
  type: 'object',
  required: ['id', 'name', 'surname', 'lastUpdate'],
  properties: {
    id: {type: 'number'},
    name: {type: 'string'},
    surname: {type: 'string'},
    lastUpdate: {type: 'string'},
  },
};

app.get('/hello', {schema: {response: {200: {type: 'object', properties: {hello: {type: 'string'}}}}}}, () => ({hello: 'world'}));

// JSON Schema validates but does not build Dates, so the handlers receive strings;
// they only assign fresh Dates, so they behave the same on either shape.
app.post('/updateUser', {schema: {body: user}}, (req) => updateUser(req.body));
app.post('/updateSimpleUser', {schema: {body: simpleUser}}, (req) => updateSimpleUser(req.body));

await app.listen({port, host: '127.0.0.1'});
