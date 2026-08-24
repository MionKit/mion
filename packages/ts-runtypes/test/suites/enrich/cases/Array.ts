import type * as TF from '@ts-runtypes/core/formats';
import type {FriendlyText, MockData} from '@ts-runtypes/core';
import type {EnrichCase} from './types.ts';

// Array kinds — `T[]`, `Array<T>`, nested arrays, arrays of objects. Friendly
// emits `{rt$label: '', rt$items: <elem node>}`; mock emits `{rt$items: <elem node>,
// rt$length: [1, 3]}`. Mirrors the validation suite's ARRAY range.
export const ARRAY = {
  stringArray: {
    title: 'String array',
    case: () => {
      // ##### src #####
      type Target = string[];
      // ##### friendly #####
      const friendlyTarget: FriendlyText<Target> = {
        rt$label: '',
        rt$errors: {type: ''},
        rt$items: {rt$label: '', rt$errors: {type: ''}},
      };
      // ##### mock #####
      const mockTarget: MockData<Target> = {rt$items: {pool: []}, rt$length: [1, 3]};
      // ##### result #####
      return {friendlyTarget, mockTarget};
    },
  },

  numberArray: {
    title: 'Number array',
    case: () => {
      // ##### src #####
      type Target = number[];
      // ##### friendly #####
      const friendlyTarget: FriendlyText<Target> = {
        rt$label: '',
        rt$errors: {type: ''},
        rt$items: {rt$label: '', rt$errors: {type: ''}},
      };
      // ##### mock #####
      const mockTarget: MockData<Target> = {rt$items: {pool: []}, rt$length: [1, 3]};
      // ##### result #####
      return {friendlyTarget, mockTarget};
    },
  },

  booleanArray: {
    title: 'Boolean array',
    case: () => {
      // ##### src #####
      type Target = boolean[];
      // ##### friendly #####
      const friendlyTarget: FriendlyText<Target> = {
        rt$label: '',
        rt$errors: {type: ''},
        rt$items: {rt$label: '', rt$errors: {type: ''}},
      };
      // ##### mock #####
      const mockTarget: MockData<Target> = {rt$items: {pool: []}, rt$length: [1, 3]};
      // ##### result #####
      return {friendlyTarget, mockTarget};
    },
  },

  dateArray: {
    title: 'Date array',
    case: () => {
      // ##### src #####
      type Target = Date[];
      // ##### friendly #####
      const friendlyTarget: FriendlyText<Target> = {
        rt$label: '',
        rt$errors: {type: ''},
        rt$items: {rt$label: '', rt$errors: {type: ''}},
      };
      // ##### mock #####
      const mockTarget: MockData<Target> = {rt$items: {pool: []}, rt$length: [1, 3]};
      // ##### result #####
      return {friendlyTarget, mockTarget};
    },
  },

  arrayGeneric: {
    title: 'Array<string> generic form',
    case: () => {
      // ##### src #####
      type Target = Array<string>;
      // ##### friendly #####
      const friendlyTarget: FriendlyText<Target> = {
        rt$label: '',
        rt$errors: {type: ''},
        rt$items: {rt$label: '', rt$errors: {type: ''}},
      };
      // ##### mock #####
      const mockTarget: MockData<Target> = {rt$items: {pool: []}, rt$length: [1, 3]};
      // ##### result #####
      return {friendlyTarget, mockTarget};
    },
  },

  readonlyArray: {
    title: 'ReadonlyArray<string>',
    case: () => {
      // ##### src #####
      type Target = ReadonlyArray<string>;
      // ##### friendly #####
      const friendlyTarget: FriendlyText<Target> = {
        rt$label: '',
        rt$errors: {type: ''},
        rt$items: {rt$label: '', rt$errors: {type: ''}},
      };
      // ##### mock #####
      const mockTarget: MockData<Target> = {rt$items: {pool: []}, rt$length: [1, 3]};
      // ##### result #####
      return {friendlyTarget, mockTarget};
    },
  },

  nestedArray: {
    title: 'Nested array (string[][])',
    case: () => {
      // ##### src #####
      type Target = string[][];
      // ##### friendly #####
      const friendlyTarget: FriendlyText<Target> = {
        rt$label: '',
        rt$errors: {type: ''},
        rt$items: {rt$label: '', rt$errors: {type: ''}, rt$items: {rt$label: '', rt$errors: {type: ''}}},
      };
      // ##### mock #####
      const mockTarget: MockData<Target> = {rt$items: {rt$items: {pool: []}, rt$length: [1, 3]}, rt$length: [1, 3]};
      // ##### result #####
      return {friendlyTarget, mockTarget};
    },
  },

  arrayOfObjects: {
    title: 'Array of objects',
    case: () => {
      // ##### src #####
      type Target = {a: string}[];
      // ##### friendly #####
      const friendlyTarget: FriendlyText<Target> = {
        rt$label: '',
        rt$errors: {type: ''},
        rt$items: {
          rt$label: '',
          rt$errors: {type: ''},
          a: {rt$label: '', rt$errors: {type: ''}},
        },
      };
      // ##### mock #####
      const mockTarget: MockData<Target> = {
        rt$items: {
          a: {pool: []},
        },
        rt$length: [1, 3],
      };
      // ##### result #####
      return {friendlyTarget, mockTarget};
    },
  },

  formatElementArray: {
    title: 'Array of format-branded strings',
    case: () => {
      // ##### src #####
      type Target = TF.Email[];
      // ##### friendly #####
      const friendlyTarget: FriendlyText<Target> = {
        rt$label: '',
        rt$errors: {type: ''},
        rt$items: {
          rt$label: '',
          rt$errors: {type: '', maxLength: {one: '', other: ''}, minLength: {one: '', other: ''}, pattern: ''},
        },
      };
      // ##### mock #####
      const mockTarget: MockData<Target> = {rt$items: {pool: []}, rt$length: [1, 3]};
      // ##### result #####
      return {friendlyTarget, mockTarget};
    },
  },
} satisfies Record<string, EnrichCase>;
