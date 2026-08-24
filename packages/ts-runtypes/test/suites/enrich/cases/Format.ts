import type * as TF from '@ts-runtypes/core/formats';
import type {FriendlyText, MockData} from '@ts-runtypes/core';
import type {EnrichCase} from './types.ts';

// Format-branded leaves — the `TF.*` catalog. A format annotation seeds
// `rt$errors` with `type` plus the format's declared constraint params, SORTED
// alphabetically. Mock stays a scalar pool `{pool: []}`. This category is the
// proof that the temp files resolve `ts-runtypes/formats` through the `source`
// condition (formats only project their constraint params when resolved to
// src). Mirrors the validation suite's format-validation range.
export const FORMAT = {
  stringMinMax: {
    title: 'String with min/max length',
    case: () => {
      // ##### src #####
      type Target = TF.String<{minLength: 2; maxLength: 60}>;
      // ##### friendly #####
      const friendlyTarget: FriendlyText<Target> = {
        rt$label: '',
        rt$errors: {type: '', maxLength: {one: '', other: ''}, minLength: {one: '', other: ''}},
      };
      // ##### mock #####
      const mockTarget: MockData<Target> = {pool: []};
      // ##### result #####
      return {friendlyTarget, mockTarget};
    },
  },

  stringLowercase: {
    title: 'Lowercase string',
    case: () => {
      // ##### src #####
      type Target = TF.String<{lowercase: true}>;
      // ##### friendly #####
      // `lowercase` is a TRANSFORMER param (non-failing) — it is not an rt$errors key.
      const friendlyTarget: FriendlyText<Target> = {rt$label: '', rt$errors: {type: ''}};
      // ##### mock #####
      const mockTarget: MockData<Target> = {pool: []};
      // ##### result #####
      return {friendlyTarget, mockTarget};
    },
  },

  email: {
    title: 'Email',
    case: () => {
      // ##### src #####
      type Target = TF.Email;
      // ##### friendly #####
      const friendlyTarget: FriendlyText<Target> = {
        rt$label: '',
        rt$errors: {type: '', maxLength: {one: '', other: ''}, minLength: {one: '', other: ''}, pattern: ''},
      };
      // ##### mock #####
      const mockTarget: MockData<Target> = {pool: []};
      // ##### result #####
      return {friendlyTarget, mockTarget};
    },
  },

  uuidv4: {
    title: 'UUID v4',
    case: () => {
      // ##### src #####
      type Target = TF.UUIDv4;
      // ##### friendly #####
      const friendlyTarget: FriendlyText<Target> = {rt$label: '', rt$errors: {type: '', version: ''}};
      // ##### mock #####
      const mockTarget: MockData<Target> = {pool: []};
      // ##### result #####
      return {friendlyTarget, mockTarget};
    },
  },

  url: {
    title: 'URL',
    case: () => {
      // ##### src #####
      type Target = TF.Url;
      // ##### friendly #####
      const friendlyTarget: FriendlyText<Target> = {
        rt$label: '',
        rt$errors: {type: '', maxLength: {one: '', other: ''}, pattern: ''},
      };
      // ##### mock #####
      const mockTarget: MockData<Target> = {pool: []};
      // ##### result #####
      return {friendlyTarget, mockTarget};
    },
  },

  alpha: {
    title: 'Alpha string',
    case: () => {
      // ##### src #####
      type Target = TF.Alpha;
      // ##### friendly #####
      const friendlyTarget: FriendlyText<Target> = {rt$label: '', rt$errors: {type: '', pattern: ''}};
      // ##### mock #####
      const mockTarget: MockData<Target> = {pool: []};
      // ##### result #####
      return {friendlyTarget, mockTarget};
    },
  },

  numberMinMax: {
    title: 'Number with min/max',
    case: () => {
      // ##### src #####
      type Target = TF.Number<{min: 0; max: 120}>;
      // ##### friendly #####
      const friendlyTarget: FriendlyText<Target> = {
        rt$label: '',
        rt$errors: {type: '', max: {one: '', other: ''}, min: {one: '', other: ''}},
      };
      // ##### mock #####
      const mockTarget: MockData<Target> = {pool: []};
      // ##### result #####
      return {friendlyTarget, mockTarget};
    },
  },

  integer: {
    title: 'Integer',
    case: () => {
      // ##### src #####
      type Target = TF.Integer;
      // ##### friendly #####
      const friendlyTarget: FriendlyText<Target> = {rt$label: '', rt$errors: {type: '', integer: ''}};
      // ##### mock #####
      const mockTarget: MockData<Target> = {pool: []};
      // ##### result #####
      return {friendlyTarget, mockTarget};
    },
  },

  positive: {
    title: 'Positive number',
    case: () => {
      // ##### src #####
      type Target = TF.Positive;
      // ##### friendly #####
      const friendlyTarget: FriendlyText<Target> = {rt$label: '', rt$errors: {type: '', min: {one: '', other: ''}}};
      // ##### mock #####
      const mockTarget: MockData<Target> = {pool: []};
      // ##### result #####
      return {friendlyTarget, mockTarget};
    },
  },

  int32: {
    title: 'Int32',
    case: () => {
      // ##### src #####
      type Target = TF.Int32;
      // ##### friendly #####
      const friendlyTarget: FriendlyText<Target> = {
        rt$label: '',
        rt$errors: {type: '', integer: '', max: {one: '', other: ''}, min: {one: '', other: ''}},
      };
      // ##### mock #####
      const mockTarget: MockData<Target> = {pool: []};
      // ##### result #####
      return {friendlyTarget, mockTarget};
    },
  },

  bigPositive: {
    title: 'BigInt positive',
    case: () => {
      // ##### src #####
      type Target = TF.BigPositive;
      // ##### friendly #####
      const friendlyTarget: FriendlyText<Target> = {rt$label: '', rt$errors: {type: '', min: {one: '', other: ''}}};
      // ##### mock #####
      const mockTarget: MockData<Target> = {pool: []};
      // ##### result #####
      return {friendlyTarget, mockTarget};
    },
  },

  bigInt64: {
    title: 'BigInt64',
    case: () => {
      // ##### src #####
      type Target = TF.BigInt64;
      // ##### friendly #####
      const friendlyTarget: FriendlyText<Target> = {
        rt$label: '',
        rt$errors: {type: '', max: {one: '', other: ''}, min: {one: '', other: ''}},
      };
      // ##### mock #####
      const mockTarget: MockData<Target> = {pool: []};
      // ##### result #####
      return {friendlyTarget, mockTarget};
    },
  },

  formatInObject: {
    title: 'Object with format-branded members',
    case: () => {
      // ##### src #####
      type Target = {name: TF.String<{minLength: 2; maxLength: 60}>; age: TF.Number<{min: 0; max: 120}>; email: TF.Email};
      // ##### friendly #####
      const friendlyTarget: FriendlyText<Target> = {
        rt$label: '',
        rt$errors: {type: ''},
        name: {rt$label: '', rt$errors: {type: '', maxLength: {one: '', other: ''}, minLength: {one: '', other: ''}}},
        age: {rt$label: '', rt$errors: {type: '', max: {one: '', other: ''}, min: {one: '', other: ''}}},
        email: {
          rt$label: '',
          rt$errors: {type: '', maxLength: {one: '', other: ''}, minLength: {one: '', other: ''}, pattern: ''},
        },
      };
      // ##### mock #####
      const mockTarget: MockData<Target> = {
        name: {pool: []},
        age: {pool: []},
        email: {pool: []},
      };
      // ##### result #####
      return {friendlyTarget, mockTarget};
    },
  },
} satisfies Record<string, EnrichCase>;
