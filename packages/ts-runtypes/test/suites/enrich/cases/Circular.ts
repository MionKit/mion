import type {FriendlyText, MockData} from '@ts-runtypes/core';
import type {EnrichCase} from './types.ts';

// Self-referential / circular kinds. The emitter's per-node `seen` guard breaks
// the cycle: the recursion point (the back-edge to an already-walked object)
// degrades to a leaf node. Mirrors the validation suite's CIRCULAR range.
export const CIRCULAR = {
  selfReference: {
    title: 'Self-referential object',
    case: () => {
      // ##### src #####
      interface Circular {
        value: string;
        next: Circular | null;
      }
      type Target = Circular;
      // ##### friendly #####
      const friendlyTarget: FriendlyText<Target> = {
        rt$label: '',
        rt$errors: {type: ''},
        value: {rt$label: '', rt$errors: {type: ''}},
        next: {rt$label: '', rt$errors: {type: ''}},
      };
      // ##### mock #####
      const mockTarget: MockData<Target> = {
        value: {pool: []},
        next: {pool: []},
      };
      // ##### result #####
      return {friendlyTarget, mockTarget};
    },
  },

  deepCircular: {
    title: 'Deeply nested circular object',
    case: () => {
      // ##### src #####
      interface CircularDeep {
        a: {b: {c: CircularDeep | null}};
        name: string;
      }
      type Target = CircularDeep;
      // ##### friendly #####
      const friendlyTarget: FriendlyText<Target> = {
        rt$label: '',
        rt$errors: {type: ''},
        a: {
          rt$label: '',
          rt$errors: {type: ''},
          b: {
            rt$label: '',
            rt$errors: {type: ''},
            c: {rt$label: '', rt$errors: {type: ''}},
          },
        },
        name: {rt$label: '', rt$errors: {type: ''}},
      };
      // ##### mock #####
      const mockTarget: MockData<Target> = {
        a: {
          b: {
            c: {pool: []},
          },
        },
        name: {pool: []},
      };
      // ##### result #####
      return {friendlyTarget, mockTarget};
    },
  },

  circularArray: {
    // NOTE: the friendly + mock below break the cycle at the self-referential
    // array element — `items.rt$items` is a BARE node (`{rt$label,rt$errors}` / `{}`),
    // NOT the filled `{rt$items: {pool: []}, …}` of every other array case. The
    // element type is `CircularArray` itself, so the array back-edge is the
    // recursion-leaf where gen's runtime `seen` guard stops and emits a bare node.
    // The depth-bounded `FriendlyText` / `MockData` TYPES can't model that cutoff
    // (they keep recursing to the depth budget), so each expected carries a trailing
    // divergence cast — enrichCases.ts `stripTrailingAs` removes it before the shape
    // comparison, and `check` re-validates the stripped literal against the strict
    // type via the Go CLI. Friendly's bare leaf still carries `{rt$label,rt$errors}` and
    // overlaps the node type, so a plain `as FriendlyText<Target>` suffices; mock's
    // leaf is the EMPTY `{}`, which shares no members with the rich node, so it needs
    // the `as unknown as MockData<Target>` bridge. The lone divergence is the
    // cycle-break leaf, not drift.
    title: 'Object with self-referential array',
    case: () => {
      // ##### src #####
      interface CircularArray {
        items: CircularArray[];
        id: number;
      }
      type Target = CircularArray;
      // ##### friendly #####
      const friendlyTarget: FriendlyText<Target> = {
        rt$label: '',
        rt$errors: {type: ''},
        items: {rt$label: '', rt$errors: {type: ''}, rt$items: {rt$label: '', rt$errors: {type: ''}}},
        id: {rt$label: '', rt$errors: {type: ''}},
      } as FriendlyText<Target>;
      // ##### mock #####
      const mockTarget: MockData<Target> = {
        items: {rt$items: {}, rt$length: [1, 3]},
        id: {pool: []},
      } as unknown as MockData<Target>;
      // ##### result #####
      return {friendlyTarget, mockTarget};
    },
  },
} satisfies Record<string, EnrichCase>;
