import type {FriendlyText, MockData} from '@ts-runtypes/core';
import type {EnrichCase} from './types.ts';

// Template-literal kinds. The emitter treats a template-literal type as a
// string-shaped LEAF — friendly `{rt$label: ''}`, mock `{pool: []}` (both valid,
// since a template-literal type extends `string`). Mirrors the validation
// suite's TEMPLATE_LITERAL range.
export const TEMPLATE_LITERAL = {
  stringSlashNumber: {
    title: 'Template `${string}/${number}`',
    case: () => {
      // ##### src #####
      type Target = `${string}/${number}`;
      // ##### friendly #####
      const friendlyTarget: FriendlyText<Target> = {rt$label: '', rt$errors: {type: ''}};
      // ##### mock #####
      const mockTarget: MockData<Target> = {pool: []};
      // ##### result #####
      return {friendlyTarget, mockTarget};
    },
  },

  apiUserPath: {
    title: 'Template `api/user/${number}`',
    case: () => {
      // ##### src #####
      type Target = `api/user/${number}`;
      // ##### friendly #####
      const friendlyTarget: FriendlyText<Target> = {rt$label: '', rt$errors: {type: ''}};
      // ##### mock #####
      const mockTarget: MockData<Target> = {pool: []};
      // ##### result #####
      return {friendlyTarget, mockTarget};
    },
  },

  litUnionPrefix: {
    title: "Template `${'a' | 'b'}-${number}`",
    case: () => {
      // ##### src #####
      type Target = `${'a' | 'b'}-${number}`;
      // ##### friendly #####
      const friendlyTarget: FriendlyText<Target> = {rt$label: '', rt$errors: {type: ''}};
      // ##### mock #####
      const mockTarget: MockData<Target> = {pool: []};
      // ##### result #####
      return {friendlyTarget, mockTarget};
    },
  },

  parenNumber: {
    title: 'Template `(${number})`',
    case: () => {
      // ##### src #####
      type Target = `(${number})`;
      // ##### friendly #####
      const friendlyTarget: FriendlyText<Target> = {rt$label: '', rt$errors: {type: ''}};
      // ##### mock #####
      const mockTarget: MockData<Target> = {pool: []};
      // ##### result #####
      return {friendlyTarget, mockTarget};
    },
  },

  multiInterpolation: {
    title: 'Template with multiple interpolations',
    case: () => {
      // ##### src #####
      type Target = `/api/v${number}/user/${string}/posts/${number}`;
      // ##### friendly #####
      const friendlyTarget: FriendlyText<Target> = {rt$label: '', rt$errors: {type: ''}};
      // ##### mock #####
      const mockTarget: MockData<Target> = {pool: []};
      // ##### result #####
      return {friendlyTarget, mockTarget};
    },
  },
} satisfies Record<string, EnrichCase>;
