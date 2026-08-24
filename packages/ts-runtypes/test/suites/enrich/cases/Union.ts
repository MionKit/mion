import type {FriendlyText, MockData} from '@ts-runtypes/core';
import type {EnrichCase} from './types.ts';

// Union kinds. The emitter treats a union as an OPAQUE LEAF — friendly
// `{rt$label: ''}`, mock `{pool: []}`. For PRIMITIVE / LITERAL unions the leaf is
// a valid `FriendlyText` / `MockData` (the type distributes to a union of leaf
// pools, and `{pool: []}` satisfies each arm). Object-MEMBER unions are
// excluded: `MockData<{a}|{b}>` distributes to object maps, so the `{pool: []}`
// leaf would not type-check there (a known emitter/type divergence — see the
// suite README note in enrichCheck). Mirrors the validation suite's UNION
// range (primitive subset).
export const UNION = {
  stringNumber: {
    title: 'string | number',
    case: () => {
      // ##### src #####
      type Target = string | number;
      // ##### friendly #####
      const friendlyTarget: FriendlyText<Target> = {rt$label: '', rt$errors: {type: ''}};
      // ##### mock #####
      const mockTarget: MockData<Target> = {pool: []};
      // ##### result #####
      return {friendlyTarget, mockTarget};
    },
  },

  stringNull: {
    title: 'string | null',
    case: () => {
      // ##### src #####
      type Target = string | null;
      // ##### friendly #####
      const friendlyTarget: FriendlyText<Target> = {rt$label: '', rt$errors: {type: ''}};
      // ##### mock #####
      const mockTarget: MockData<Target> = {pool: []};
      // ##### result #####
      return {friendlyTarget, mockTarget};
    },
  },

  stringLiteralUnion: {
    title: 'String-literal union',
    case: () => {
      // ##### src #####
      type Target = 'UNO' | 'DOS' | 'TRES';
      // ##### friendly #####
      const friendlyTarget: FriendlyText<Target> = {rt$label: '', rt$errors: {type: ''}};
      // ##### mock #####
      const mockTarget: MockData<Target> = {pool: []};
      // ##### result #####
      return {friendlyTarget, mockTarget};
    },
  },

  mixedScalarUnion: {
    title: 'Mixed scalar union',
    case: () => {
      // ##### src #####
      type Target = Date | number | string | null | bigint;
      // ##### friendly #####
      const friendlyTarget: FriendlyText<Target> = {rt$label: '', rt$errors: {type: ''}};
      // ##### mock #####
      const mockTarget: MockData<Target> = {pool: []};
      // ##### result #####
      return {friendlyTarget, mockTarget};
    },
  },

  numberBooleanUnion: {
    title: 'number | boolean',
    case: () => {
      // ##### src #####
      type Target = number | boolean;
      // ##### friendly #####
      const friendlyTarget: FriendlyText<Target> = {rt$label: '', rt$errors: {type: ''}};
      // ##### mock #####
      const mockTarget: MockData<Target> = {pool: []};
      // ##### result #####
      return {friendlyTarget, mockTarget};
    },
  },

  optionalScalar: {
    title: 'string | undefined',
    case: () => {
      // ##### src #####
      type Target = string | undefined;
      // ##### friendly #####
      const friendlyTarget: FriendlyText<Target> = {rt$label: '', rt$errors: {type: ''}};
      // ##### mock #####
      const mockTarget: MockData<Target> = {pool: []};
      // ##### result #####
      return {friendlyTarget, mockTarget};
    },
  },
} satisfies Record<string, EnrichCase>;
