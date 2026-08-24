// A small "library" module for the external-module marker matrix: a type, a
// value-first schema, and an options preset all live HERE; the consumer test
// (external-module.test.ts) imports them and drives every marker across the
// module boundary. The live plugin scans this file too, so the schema's
// value-first builders are reflected the same as if written inline.
import * as RT from '@ts-runtypes/core/builders';
import * as TF from '@ts-runtypes/core/formats';

export interface User {
  id: number;
  name: string;
}

// A value-first schema whose InferType is structurally `User`.
export const UserSchema = RT.object({id: TF.number(), name: TF.string()});

// A WHOLE options preset — declared `as const` so its values stay literal
// (the CompTimeArgs `as const` rule). The consumer passes it by reference,
// exercising cross-module whole-const option-bag resolution.
export const mutatePreset = {strategy: 'mutate'} as const;

export type WithBigint = {n: bigint};
