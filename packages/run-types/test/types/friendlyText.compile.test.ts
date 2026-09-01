// Per-branch correctness test for `FriendlyText<T>` (total contract: every field
// required; `rt$label` + `rt$errors` required on every node; `rt$typeName`
// optional root meta) — including the PARAM-PRECISE `rt$errors` typing: a branded
// field's failable format params become REQUIRED template keys, count-bearing
// keys may pluralize, `rt$default` is the mutually exclusive catch-all mode, and
// non-failing params (isCurrency, transformers) never become keys.
//
// Each `it` compiles a representative snippet for ONE branch of `FriendlyNode`
// (src/enrich/friendlyType.ts) and asserts valid maps are assignable + invalid
// maps rejected (a `@ts-expect-error` that fails to fire becomes TS2578, so a
// too-loose type reds the test).
//
// Snippets brand fields with a LOCAL `__rtFormatParams` carrier (the only
// sentinel `ErrorTemplates<F>` reads) so the harness slice stays
// self-contained — the real `TF.*` aliases resolve to the same shape.
//
// Each budget IS the branch's current net instantiation count — a one-way
// ratchet, exactly like dataonly.compile.test.ts: after ANY change to the
// FriendlyText machinery, uncomment the log in `check`, compare each printed
// `net` to its budget, LOWER budgets that went down, and treat a raise as a
// cost regression to fix (never raise a budget to make the suite pass).
// Baseline (2026-07-03): the total-contract + param-precise `rt$errors` flip —
// measured 171 → 482 on the 4-field prototype; per-branch nets below. The
// counts are TERMINAL (a FriendlyText instantiates once per mirror const and
// never propagates through consumer code the way DataOnly does).

import {describe, it, expect} from 'vitest';
import {measureFriendly} from './enrichHarness.ts';

// Local format-brand carrier for snippets (matches TypeFormat's params sentinel).
const BRAND = `
      type Fmt<Base, P extends object> = Base & {readonly [__rtFormatParams]?: P};
`;

function check(snippet: string, budget: number): number {
  const r = measureFriendly(snippet);
  expect(r.errors, `snippet should type-check cleanly:\n${snippet}\n→ ${r.errors.join('\n  ')}`).toEqual([]);
  // console.log(`    net=${String(r.netInstantiations).padStart(5)}  budget=${budget}`);
  expect(
    r.netInstantiations,
    `net instantiations (${r.netInstantiations}) exceeded budget (${budget}) — possible FriendlyText recursion/cost regression`
  ).toBeLessThanOrEqual(budget);
  return r.netInstantiations;
}

describe('FriendlyText<T> — per-branch correctness (total contract)', () => {
  it('scalar leaves carry rt$label + rt$errors (both required); rt$default is the exclusive mode', () => {
    check(
      `
      type _01 = Expect<Assignable<{rt$label: 'n'; rt$errors: {type: 't'}}, FriendlyText<string>>>;
      type _02 = Expect<Assignable<{rt$label: 'a'; rt$errors: {type: 't'}}, FriendlyText<number>>>;
      type _03 = Expect<Assignable<{rt$label: 'b'; rt$errors: {type: 't'}}, FriendlyText<boolean>>>;
      type _04 = Expect<Assignable<{rt$label: 'g'; rt$errors: {type: 't'}}, FriendlyText<bigint>>>;
      type _05 = Expect<Assignable<{rt$label: 'd'; rt$errors: {type: 't'}}, FriendlyText<Date>>>;
      // the optional root type name is accepted
      type _06 = Expect<Assignable<{rt$label: 'n'; rt$errors: {type: 't'}; rt$typeName: 'User'}, FriendlyText<string>>>;
      // rt$default mode: one catch-all message instead of per-constraint keys
      type _07 = Expect<Assignable<{rt$label: 'n'; rt$errors: {rt$default: 'x'}}, FriendlyText<string>>>;
      // rt$errors is REQUIRED — a label-only node is rejected
      type _08 = ExpectFalse<Assignable<{rt$label: 'n'}, FriendlyText<string>>>;
      // rt$label is REQUIRED — an errors-only node is rejected
      type _09 = ExpectFalse<Assignable<{rt$errors: {type: 't'}}, FriendlyText<string>>>;
      // rt$default NEVER mixes with per-constraint keys (mutually exclusive)
      type _10 = ExpectFalse<Assignable<{rt$label: 'n'; rt$errors: {type: 't'; rt$default: 'x'}}, FriendlyText<string>>>;
      `,
      130
    );
  });

  it('param-precise rt$errors: declared format params become REQUIRED keys', () => {
    check(
      BRAND +
        `
      interface User { name: Fmt<string, {minLength: 2; maxLength: 60}>; age: number }
      const _ok: FriendlyText<User> = {
        rt$label: 'User',
        rt$errors: {type: 'must be an object'},
        name: { rt$label: 'Name', rt$errors: {
          type: 'must be text',
          minLength: 'min $[val] chars',
          maxLength: '', // blank = no custom message; the key is still REQUIRED
        } },
        age: { rt$label: 'Age', rt$errors: {type: 'must be a number'} },
      };
      const _missingKey: FriendlyText<User> = { rt$label: '', rt$errors: {type: ''},
        // @ts-expect-error — maxLength is declared by the format, so its key is required
        name: { rt$label: '', rt$errors: { type: '', minLength: '' } },
        age: { rt$label: '', rt$errors: {type: ''} } };
      const _unknownKey: FriendlyText<User> = { rt$label: '', rt$errors: {type: ''},
        // @ts-expect-error — 'pattern' is not a constraint of this field (no index signature)
        name: { rt$label: '', rt$errors: { type: '', minLength: '', maxLength: '', pattern: 'x' } },
        age: { rt$label: '', rt$errors: {type: ''} } };
      const _bareWithKeys: FriendlyText<User> = { rt$label: '', rt$errors: {type: ''},
        name: { rt$label: '', rt$errors: { type: '', minLength: '', maxLength: '' } },
        // @ts-expect-error — a plain (unbranded) field only fails as 'type'
        age: { rt$label: '', rt$errors: { type: '', min: '' } } };
      // rt$default mode is a legal alternative on a branded field too
      const _defaultMode: FriendlyText<User> = { rt$label: '', rt$errors: {type: ''},
        name: { rt$label: '', rt$errors: { rt$default: 'Enter a valid name' } },
        age: { rt$label: '', rt$errors: {type: ''} } };
      `,
      153
    );
  });

  it('non-failing params (isCurrency, transformers) never become rt$errors keys', () => {
    check(
      BRAND +
        `
      interface Order { total: Fmt<number, {max: 100; isCurrency: true}>; code: Fmt<string, {transform: {lowercase: true}}> }
      const _ok: FriendlyText<Order> = {
        rt$label: '', rt$errors: {type: ''},
        total: { rt$label: 'Total', rt$errors: { type: '', max: 'at most $[val]' } },
        code: { rt$label: 'Code', rt$errors: { type: '' } },
      };
      const _currencyKey: FriendlyText<Order> = { rt$label: '', rt$errors: {type: ''},
        // @ts-expect-error — isCurrency is presentation metadata, not a template key
        total: { rt$label: '', rt$errors: { type: '', max: '', isCurrency: 'x' } },
        code: { rt$label: '', rt$errors: { type: '' } } };
      const _transformerKey: FriendlyText<Order> = { rt$label: '', rt$errors: {type: ''},
        total: { rt$label: '', rt$errors: { type: '', max: '' } },
        // @ts-expect-error — transform is the value rewrite, not a template key
        code: { rt$label: '', rt$errors: { type: '', transform: 'x' } } };
      `,
      204
    );
  });

  it('objects nest; every field required; unknown fields rejected', () => {
    check(
      BRAND +
        `
      interface User { name: Fmt<string, {minLength: 2}>; age: number }
      const _ok: FriendlyText<User> = {
        rt$label: 'User',
        rt$errors: {type: 'must be an object'},
        name: { rt$label: 'Name', rt$errors: { type: 'must be text', minLength: 'min $[val] chars' } },
        age: { rt$label: 'Age', rt$errors: { type: 'must be a number' } },
      };
      // @ts-expect-error — 'age' is missing (every field is required)
      const _missing: FriendlyText<User> = { rt$label: '', rt$errors: {type: ''}, name: { rt$label: 'Name', rt$errors: {type: '', minLength: ''} } };
      // @ts-expect-error — 'extra' is not a field of User
      const _bad: FriendlyText<User> = { rt$label: '', rt$errors: {type: ''}, name: { rt$label: '', rt$errors: {type: '', minLength: ''} }, age: { rt$label: '', rt$errors: {type: ''} }, extra: { rt$label: 'x', rt$errors: {type: ''} } };
      `,
      139
    );
  });

  it('nested objects recurse', () => {
    check(
      BRAND +
        `
      interface User { name: string; profile: { email: Fmt<string, {pattern: {source: 'x'}}>; score: Fmt<number, {max: 100}> } }
      const _ok: FriendlyText<User> = {
        rt$label: '', rt$errors: {type: ''},
        name: { rt$label: 'Name', rt$errors: {type: ''} },
        profile: {
          rt$label: 'Profile',
          rt$errors: {type: ''},
          email: { rt$label: 'Email', rt$errors: { type: '', pattern: 'invalid email' } },
          score: { rt$label: 'Score', rt$errors: { type: '', max: 'too high' } },
        },
      };
      `,
      242
    );
  });

  it('arrays carry rt$items (element node)', () => {
    check(
      BRAND +
        `
      interface User { tags: string[]; scores: Fmt<number, {min: 0}>[] }
      const _ok: FriendlyText<User> = {
        rt$label: '', rt$errors: {type: ''},
        tags: { rt$label: 'Tags', rt$errors: {type: ''}, rt$items: { rt$label: '', rt$errors: { type: 'each tag must be text' } } },
        scores: { rt$label: '', rt$errors: {type: ''}, rt$items: { rt$label: '', rt$errors: { type: '', min: 'min $[val]' } } },
      };
      type _arr = Expect<Assignable<{rt$label: ''; rt$errors: {type: ''}; rt$items: {rt$label: ''; rt$errors: {type: 't'}}}, FriendlyText<string[]>>>;
      `,
      222
    );
  });

  it('tuples carry rt$slots (per-slot nodes), distinct from arrays', () => {
    check(
      BRAND +
        `
      const _ok: FriendlyText<[string, Fmt<number, {min: 1}>]> = {
        rt$label: 'Pair',
        rt$errors: {type: ''},
        rt$slots: [
          { rt$label: 'Name', rt$errors: {type: ''} },
          { rt$label: 'Age', rt$errors: { type: '', min: 'too small' } },
        ],
      };
      // a tuple does NOT accept rt$items
      type _noitems = ExpectFalse<Assignable<{rt$label: 'x'; rt$errors: {type: 't'}; rt$items: {rt$label: 'x'; rt$errors: {type: 't'}}}, FriendlyText<[string, number]>>>;
      `,
      180
    );
  });

  it('Map carries rt$keys / rt$values', () => {
    check(
      BRAND +
        `
      const _ok: FriendlyText<Map<string, Fmt<number, {min: 0}>>> = {
        rt$label: 'Lookup',
        rt$errors: {type: ''},
        rt$keys: { rt$label: 'Key', rt$errors: {type: ''} },
        rt$values: { rt$label: 'Value', rt$errors: { type: '', min: 'too small' } },
      };
      `,
      368
    );
  });

  it('Set carries rt$values', () => {
    check(
      BRAND +
        `
      const _ok: FriendlyText<Set<Fmt<string, {minLength: 1}>>> = {
        rt$label: 'Tags',
        rt$errors: {type: ''},
        rt$values: { rt$label: 'Tag', rt$errors: { type: '', minLength: 'too short' } },
      };
      `,
      318
    );
  });

  it('plural template leaves: other mandatory, arms optional, rt$label stays a string', () => {
    check(
      BRAND +
        `
      interface User { name: Fmt<string, {minLength: 2}> }
      // a count-bearing constraint may carry a plural object (arms per locale)
      const _en: FriendlyText<User> = {
        rt$label: '', rt$errors: {type: ''},
        name: { rt$label: 'Name', rt$errors: {
          type: 'must be text',
          minLength: { one: 'at least $[val] character', other: 'at least $[val] characters' },
        } },
      };
      // asymmetric arms: any CLDR category subset is fine as long as other is present
      const _pl: FriendlyText<User> = {
        rt$label: '', rt$errors: {type: ''},
        name: { rt$label: '', rt$errors: {
          type: '',
          minLength: { one: '', few: '', many: '', other: '' },
        } },
      };
      // 'other' is REQUIRED on a plural object
      // @ts-expect-error — plural object without 'other' is rejected
      const _noOther: FriendlyText<User> = { rt$label: '', rt$errors: {type: ''}, name: { rt$label: '', rt$errors: { type: '', minLength: { one: 'x' } } } };
      // a non-CLDR arm key is rejected
      // @ts-expect-error — 'lots' is not a CLDR plural category
      const _badArm: FriendlyText<User> = { rt$label: '', rt$errors: {type: ''}, name: { rt$label: '', rt$errors: { type: '', minLength: { other: '', lots: '' } } } };
      // rt$label is never plural
      // @ts-expect-error — rt$label must stay a plain string
      const _pluralLabel: FriendlyText<User> = { rt$label: {other: ''}, rt$errors: {type: ''}, name: { rt$label: '', rt$errors: {type: '', minLength: ''} } };
      // 'type' is not count-bearing — a plural object there is rejected
      // @ts-expect-error — 'type' stays a plain string template
      const _pluralType: FriendlyText<User> = { rt$label: '', rt$errors: {type: {other: ''}}, name: { rt$label: '', rt$errors: {type: '', minLength: ''} } };
      `,
      157
    );
  });

  it('a plural object on a NON-count-bearing declared param is rejected', () => {
    check(
      BRAND +
        `
      interface User { age: Fmt<number, {integer: true; max: 120}> }
      const _ok: FriendlyText<User> = {
        rt$label: '', rt$errors: {type: ''},
        age: { rt$label: '', rt$errors: { type: '', integer: 'whole numbers', max: {other: 'at most $[val]'} } },
      };
      const _bad: FriendlyText<User> = { rt$label: '', rt$errors: {type: ''},
        // @ts-expect-error — 'integer' never pluralizes (only min/max/lt/gt/minLength/maxLength do)
        age: { rt$label: '', rt$errors: { type: '', integer: {one: '', other: ''}, max: '' } } };
      `,
      160
    );
  });

  it('optional + union fields', () => {
    check(
      `
      interface User { nickname?: string; status: 'active' | 'inactive' }
      const _ok: FriendlyText<User> = {
        rt$label: '', rt$errors: {type: ''},
        nickname: { rt$label: 'Nickname', rt$errors: {type: ''} },
        status: { rt$label: 'Status', rt$errors: { type: 'invalid status' } },
      };
      `,
      91
    );
  });

  it('deep nesting stays within the depth budget', () => {
    check(
      `
      interface Deep { a: { b: { c: { d: { e: string } } } } }
      const _ok: FriendlyText<Deep> = {
        rt$label: '', rt$errors: {type: ''},
        a: {
          rt$label: '', rt$errors: {type: ''},
          b: {
            rt$label: '', rt$errors: {type: ''},
            c: {
              rt$label: '', rt$errors: {type: ''},
              d: {
                rt$label: '', rt$errors: {type: ''},
                e: { rt$label: 'E', rt$errors: {type: ''} },
              },
            },
          },
        },
      };
      `,
      159
    );
  });

  it('circular type resolves (bounded recursion; null arm breaks the cycle)', () => {
    check(
      `
      interface Node { value: string; next: Node | null }
      const _ok: FriendlyText<Node> = {
        rt$label: '', rt$errors: {type: ''},
        value: { rt$label: 'Value', rt$errors: {type: ''} },
        next: { rt$label: '', rt$errors: {type: ''} },
      };
      `,
      84
    );
  });
});
