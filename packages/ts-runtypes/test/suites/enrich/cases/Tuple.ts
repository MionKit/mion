import type {FriendlyText, MockData} from '@ts-runtypes/core';
import type {EnrichCase} from './types.ts';

// Tuple kinds. The emitter reflects tuple STRUCTURE (solution A): a fixed-length
// tuple emits friendly `{rt$label: '', rt$slots: [node, …]}` and mock `{rt$slots:
// [node, …]}` (fixed length, no `rt$length`) — one node per slot. A VARIADIC tuple
// (`[A, ...B[]]`) has a broad `length: number`, so the `FriendlyText`/`MockData`
// mapped types route it through the ARRAY branch (`rt$items`/`rt$length`); the
// emitter mirrors that. Both shapes are valid `FriendlyText<Target>` /
// `MockData<Target>` — no `as` cast needed. Mirrors the validation suite's
// TUPLE range.
export const TUPLE = {
  pair: {
    title: 'Tuple [string, number]',
    case: () => {
      // ##### src #####
      type Target = [string, number];
      // ##### friendly #####
      const friendlyTarget: FriendlyText<Target> = {
        rt$label: '',
        rt$errors: {type: ''},
        rt$slots: [
          {rt$label: '', rt$errors: {type: ''}},
          {rt$label: '', rt$errors: {type: ''}},
        ],
      };
      // ##### mock #####
      const mockTarget: MockData<Target> = {rt$slots: [{pool: []}, {pool: []}]};
      // ##### result #####
      return {friendlyTarget, mockTarget};
    },
  },

  single: {
    title: 'Single-element tuple [string]',
    case: () => {
      // ##### src #####
      type Target = [string];
      // ##### friendly #####
      const friendlyTarget: FriendlyText<Target> = {
        rt$label: '',
        rt$errors: {type: ''},
        rt$slots: [{rt$label: '', rt$errors: {type: ''}}],
      };
      // ##### mock #####
      const mockTarget: MockData<Target> = {rt$slots: [{pool: []}]};
      // ##### result #####
      return {friendlyTarget, mockTarget};
    },
  },

  named: {
    title: 'Named tuple [name: string, age: number]',
    case: () => {
      // ##### src #####
      type Target = [name: string, age: number];
      // ##### friendly #####
      const friendlyTarget: FriendlyText<Target> = {
        rt$label: '',
        rt$errors: {type: ''},
        rt$slots: [
          {rt$label: '', rt$errors: {type: ''}},
          {rt$label: '', rt$errors: {type: ''}},
        ],
      };
      // ##### mock #####
      const mockTarget: MockData<Target> = {rt$slots: [{pool: []}, {pool: []}]};
      // ##### result #####
      return {friendlyTarget, mockTarget};
    },
  },

  optionalSlots: {
    title: 'Tuple with optional slots',
    case: () => {
      // ##### src #####
      type Target = [number, bigint?, boolean?, number?];
      // ##### friendly #####
      const friendlyTarget: FriendlyText<Target> = {
        rt$label: '',
        rt$errors: {type: ''},
        rt$slots: [
          {rt$label: '', rt$errors: {type: ''}},
          {rt$label: '', rt$errors: {type: ''}},
          {rt$label: '', rt$errors: {type: ''}},
          {rt$label: '', rt$errors: {type: ''}},
        ],
      };
      // ##### mock #####
      const mockTarget: MockData<Target> = {rt$slots: [{pool: []}, {pool: []}, {pool: []}, {pool: []}]};
      // ##### result #####
      return {friendlyTarget, mockTarget};
    },
  },

  restTail: {
    title: 'Tuple with rest tail [number, ...string[]]',
    case: () => {
      // ##### src #####
      type Target = [number, ...string[]];
      // ##### friendly #####
      // A variadic tuple has `length: number`, so the type (and emitter) treat
      // it as an array — `rt$items`, not `rt$slots`.
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

  readonlyTuple: {
    title: 'Readonly tuple',
    case: () => {
      // ##### src #####
      type Target = readonly [string, number];
      // ##### friendly #####
      const friendlyTarget: FriendlyText<Target> = {
        rt$label: '',
        rt$errors: {type: ''},
        rt$slots: [
          {rt$label: '', rt$errors: {type: ''}},
          {rt$label: '', rt$errors: {type: ''}},
        ],
      };
      // ##### mock #####
      const mockTarget: MockData<Target> = {rt$slots: [{pool: []}, {pool: []}]};
      // ##### result #####
      return {friendlyTarget, mockTarget};
    },
  },

  mixedTuple: {
    title: 'Mixed-type tuple',
    case: () => {
      // ##### src #####
      type Target = [Date, number, string, null, bigint];
      // ##### friendly #####
      const friendlyTarget: FriendlyText<Target> = {
        rt$label: '',
        rt$errors: {type: ''},
        rt$slots: [
          {rt$label: '', rt$errors: {type: ''}},
          {rt$label: '', rt$errors: {type: ''}},
          {rt$label: '', rt$errors: {type: ''}},
          {rt$label: '', rt$errors: {type: ''}},
          {rt$label: '', rt$errors: {type: ''}},
        ],
      };
      // ##### mock #####
      const mockTarget: MockData<Target> = {rt$slots: [{pool: []}, {pool: []}, {pool: []}, {pool: []}, {pool: []}]};
      // ##### result #####
      return {friendlyTarget, mockTarget};
    },
  },

  empty: {
    title: 'Empty tuple []',
    case: () => {
      // ##### src #####
      type Target = [];
      // ##### friendly #####
      const friendlyTarget: FriendlyText<Target> = {rt$label: '', rt$errors: {type: ''}, rt$slots: []};
      // ##### mock #####
      const mockTarget: MockData<Target> = {rt$slots: []};
      // ##### result #####
      return {friendlyTarget, mockTarget};
    },
  },
} satisfies Record<string, EnrichCase>;
