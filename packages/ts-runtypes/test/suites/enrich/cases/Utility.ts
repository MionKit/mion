import type {FriendlyText, MockData} from '@ts-runtypes/core';
import type {EnrichCase} from './types.ts';

// Utility-type kinds — the mapped / lookup utilities resolve to a concrete
// object or scalar before the emitter sees them, so they project like their
// resolved shape. Mirrors the validation suite's UTILITY range.
export const UTILITY = {
  pick: {
    title: 'Pick<Person, …>',
    case: () => {
      // ##### src #####
      type Person = {name: string; age: number; createdAt: Date};
      type Target = Pick<Person, 'name' | 'createdAt'>;
      // ##### friendly #####
      const friendlyTarget: FriendlyText<Target> = {
        rt$label: '',
        rt$errors: {type: ''},
        name: {rt$label: '', rt$errors: {type: ''}},
        createdAt: {rt$label: '', rt$errors: {type: ''}},
      };
      // ##### mock #####
      const mockTarget: MockData<Target> = {
        name: {pool: []},
        createdAt: {pool: []},
      };
      // ##### result #####
      return {friendlyTarget, mockTarget};
    },
  },

  omit: {
    title: 'Omit<…, key>',
    case: () => {
      // ##### src #####
      type Target = Omit<{a: string; b?: number; c: boolean}, 'a'>;
      // ##### friendly #####
      const friendlyTarget: FriendlyText<Target> = {
        rt$label: '',
        rt$errors: {type: ''},
        b: {rt$label: '', rt$errors: {type: ''}},
        c: {rt$label: '', rt$errors: {type: ''}},
      };
      // ##### mock #####
      const mockTarget: MockData<Target> = {
        b: {pool: []},
        c: {pool: []},
      };
      // ##### result #####
      return {friendlyTarget, mockTarget};
    },
  },

  partial: {
    title: 'Partial<…>',
    case: () => {
      // ##### src #####
      type Target = Partial<{name: string; age: number}>;
      // ##### friendly #####
      const friendlyTarget: FriendlyText<Target> = {
        rt$label: '',
        rt$errors: {type: ''},
        name: {rt$label: '', rt$errors: {type: ''}},
        age: {rt$label: '', rt$errors: {type: ''}},
      };
      // ##### mock #####
      const mockTarget: MockData<Target> = {
        name: {pool: []},
        age: {pool: []},
      };
      // ##### result #####
      return {friendlyTarget, mockTarget};
    },
  },

  required: {
    title: 'Required<…>',
    case: () => {
      // ##### src #####
      type Target = Required<{name?: string; age?: number}>;
      // ##### friendly #####
      const friendlyTarget: FriendlyText<Target> = {
        rt$label: '',
        rt$errors: {type: ''},
        name: {rt$label: '', rt$errors: {type: ''}},
        age: {rt$label: '', rt$errors: {type: ''}},
      };
      // ##### mock #####
      const mockTarget: MockData<Target> = {
        name: {pool: []},
        age: {pool: []},
      };
      // ##### result #####
      return {friendlyTarget, mockTarget};
    },
  },

  readonly: {
    title: 'Readonly<…>',
    case: () => {
      // ##### src #####
      type Target = Readonly<{name: string; age: number}>;
      // ##### friendly #####
      const friendlyTarget: FriendlyText<Target> = {
        rt$label: '',
        rt$errors: {type: ''},
        name: {rt$label: '', rt$errors: {type: ''}},
        age: {rt$label: '', rt$errors: {type: ''}},
      };
      // ##### mock #####
      const mockTarget: MockData<Target> = {
        name: {pool: []},
        age: {pool: []},
      };
      // ##### result #####
      return {friendlyTarget, mockTarget};
    },
  },

  record: {
    title: "Record<'a' | 'b', number>",
    case: () => {
      // ##### src #####
      type Target = Record<'a' | 'b', number>;
      // ##### friendly #####
      const friendlyTarget: FriendlyText<Target> = {
        rt$label: '',
        rt$errors: {type: ''},
        a: {rt$label: '', rt$errors: {type: ''}},
        b: {rt$label: '', rt$errors: {type: ''}},
      };
      // ##### mock #####
      const mockTarget: MockData<Target> = {
        a: {pool: []},
        b: {pool: []},
      };
      // ##### result #####
      return {friendlyTarget, mockTarget};
    },
  },

  returnType: {
    title: 'ReturnType<Fn>',
    case: () => {
      // ##### src #####
      type Target = ReturnType<() => {a: string; b: number}>;
      // ##### friendly #####
      const friendlyTarget: FriendlyText<Target> = {
        rt$label: '',
        rt$errors: {type: ''},
        a: {rt$label: '', rt$errors: {type: ''}},
        b: {rt$label: '', rt$errors: {type: ''}},
      };
      // ##### mock #####
      const mockTarget: MockData<Target> = {
        a: {pool: []},
        b: {pool: []},
      };
      // ##### result #####
      return {friendlyTarget, mockTarget};
    },
  },

  keyofUnion: {
    title: 'keyof object (string-literal union leaf)',
    case: () => {
      // ##### src #####
      type Target = keyof {name: string; age: number};
      // ##### friendly #####
      const friendlyTarget: FriendlyText<Target> = {rt$label: '', rt$errors: {type: ''}};
      // ##### mock #####
      const mockTarget: MockData<Target> = {pool: []};
      // ##### result #####
      return {friendlyTarget, mockTarget};
    },
  },

  indexedAccess: {
    title: 'Indexed access leaf',
    case: () => {
      // ##### src #####
      type Target = {name: string; age: number}['name'];
      // ##### friendly #####
      const friendlyTarget: FriendlyText<Target> = {rt$label: '', rt$errors: {type: ''}};
      // ##### mock #####
      const mockTarget: MockData<Target> = {pool: []};
      // ##### result #####
      return {friendlyTarget, mockTarget};
    },
  },

  nonNullable: {
    title: 'NonNullable leaf',
    case: () => {
      // ##### src #####
      type Target = NonNullable<string | number | null | undefined>;
      // ##### friendly #####
      const friendlyTarget: FriendlyText<Target> = {rt$label: '', rt$errors: {type: ''}};
      // ##### mock #####
      const mockTarget: MockData<Target> = {pool: []};
      // ##### result #####
      return {friendlyTarget, mockTarget};
    },
  },
} satisfies Record<string, EnrichCase>;
