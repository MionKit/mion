import type {FriendlyText, MockData} from '@ts-runtypes/core';
import type {EnrichCase} from './types.ts';

// Builtin / native kinds. Date and RegExp are scalar-like leaves — friendly
// `{rt$label: ''}`, mock `{pool: []}`. Map and Set reflect their STRUCTURE
// (solution A): the emitter walks the key/value/element types. `Map<K,V>` →
// friendly `{rt$label: '', rt$keys, rt$values}` / mock `{rt$keys, rt$values}` (the
// optional `rt$size` is left for the author to add); `Set<U>` → friendly
// `{rt$label: '', rt$values}` / mock `{rt$values}`. All are valid `FriendlyText` /
// `MockData` — no `as` cast needed. Mirrors the validation suite's NATIVE range.
export const NATIVE = {
  date: {
    title: 'Date',
    case: () => {
      // ##### src #####
      type Target = Date;
      // ##### friendly #####
      const friendlyTarget: FriendlyText<Target> = {rt$label: '', rt$errors: {type: ''}};
      // ##### mock #####
      const mockTarget: MockData<Target> = {pool: []};
      // ##### result #####
      return {friendlyTarget, mockTarget};
    },
  },

  regexp: {
    title: 'RegExp',
    case: () => {
      // ##### src #####
      type Target = RegExp;
      // ##### friendly #####
      const friendlyTarget: FriendlyText<Target> = {rt$label: '', rt$errors: {type: ''}};
      // ##### mock #####
      const mockTarget: MockData<Target> = {pool: []};
      // ##### result #####
      return {friendlyTarget, mockTarget};
    },
  },

  map: {
    title: 'Map<string, number>',
    case: () => {
      // ##### src #####
      type Target = Map<string, number>;
      // ##### friendly #####
      const friendlyTarget: FriendlyText<Target> = {
        rt$label: '',
        rt$errors: {type: ''},
        rt$keys: {rt$label: '', rt$errors: {type: ''}},
        rt$values: {rt$label: '', rt$errors: {type: ''}},
      };
      // ##### mock #####
      const mockTarget: MockData<Target> = {rt$keys: {pool: []}, rt$values: {pool: []}};
      // ##### result #####
      return {friendlyTarget, mockTarget};
    },
  },

  set: {
    title: 'Set<string>',
    case: () => {
      // ##### src #####
      type Target = Set<string>;
      // ##### friendly #####
      const friendlyTarget: FriendlyText<Target> = {
        rt$label: '',
        rt$errors: {type: ''},
        rt$values: {rt$label: '', rt$errors: {type: ''}},
      };
      // ##### mock #####
      const mockTarget: MockData<Target> = {rt$values: {pool: []}};
      // ##### result #####
      return {friendlyTarget, mockTarget};
    },
  },
} satisfies Record<string, EnrichCase>;
