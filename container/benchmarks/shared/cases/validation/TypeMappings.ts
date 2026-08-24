import type {SharedCase} from '../types.ts';

export const TYPE_MAPPINGS = {
  key_prefix_rename: {
    title: 'Key prefix via template literal — `prefix_${K}` rename',
    description:
      'TS 4.1+ key remapping: `{[K in keyof T as `prefix_${K & string}`]: T[K]}`. Resolves to a fully concrete object literal with renamed keys; each value type is carried over unchanged. Common pattern for DB column-name prefixing (`user_id`, `user_name`).',
    getSamples: () => ({
      valid: [
        {user_id: 1, user_name: 'x'},
        {user_id: 0, user_name: ''},
      ],
      invalid: [
        {id: 1, name: 'x'}, // original (un-prefixed) keys — both required prefixed keys missing
        {user_id: 'not number', user_name: 'x'},
        {user_id: 1}, // missing user_name
        null,
        undefined,
      ],
    }),
  },
  key_conditional_rename: {
    title: 'Conditional key rename — swap one key, leave the rest',
    description:
      '`{[K in keyof T as K extends "id" ? "_id" : K]: T[K]}`. Renames a single specific key (`id` → `_id` — Mongo-style); other keys pass through unchanged.',
    getSamples: () => ({
      valid: [{_id: 1, name: 'x', createdAt: new Date()}],
      invalid: [
        // Original `id` key — renamed away, so `_id` is missing.
        {id: 1, name: 'x', createdAt: new Date()},
        // Wrong type at renamed slot.
        {_id: 'not number', name: 'x', createdAt: new Date()},
        // Missing the non-renamed `createdAt`.
        {_id: 1, name: 'x'},
        null,
        undefined,
      ],
    }),
  },
  key_filter_via_never: {
    title: 'Filter keys via `never` — drop sensitive props',
    description:
      '`{[K in keyof T as K extends "secret" ? never : K]: T[K]}`. Mapping a key to `never` drops it from the resulting shape entirely (TS 4.1+ semantic). Useful for stripping internal-only / secret fields when exposing a wire shape.',
    getSamples: () => ({
      valid: [
        {id: 1, name: 'x'},
        // Extra `secret` prop passes (structural typing — the
        // resolved shape doesn't know about it).
        {id: 1, name: 'x', secret: 'oops'},
      ],
      invalid: [
        {id: 1}, // missing name
        {name: 'x'}, // missing id
        {id: 'not number', name: 'x'},
        null,
        undefined,
      ],
    }),
  },
} as const satisfies Record<string, SharedCase>;
