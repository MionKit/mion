// Runtime behaviour of the FriendlyText i18n layer: plural-arm selection via
// Intl.PluralRules on the violated bound, TYPE-DRIVEN `$[val]` rendering (an
// isCurrency-marked bound via the renderer's `currency` option, date-family
// bounds via Intl.DateTimeFormat), `resolveLocale` BCP-47 truncation, and
// `createFriendlyTextI18n`'s per-leaf fallback to the source map. Errors are
// hand-built `RTValidationError[]` (no Go pipeline needed).

import {describe, it, expect} from 'vitest';
import type * as TF from '@ts-runtypes/core/formats';
import {
  createFriendlyText,
  createFriendlyTextI18n,
  resolveLocale,
  type FriendlyText,
  type RTValidationError,
} from '@ts-runtypes/core';

interface User {
  name: TF.String<{minLength: 2}>;
  age: TF.Number<{min: 0}>;
}

const source: FriendlyText<User> = {
  rt$label: 'User account',
  rt$errors: {type: 'Account is invalid'},
  name: {
    rt$label: 'Full name',
    rt$errors: {
      type: '$[label] must be text',
      minLength: {one: 'at least $[val] character', other: 'at least $[val] characters'},
    },
  },
  age: {
    rt$label: 'Age',
    rt$errors: {type: '$[label] must be a number', min: '$[label] must be at least $[val]'},
  },
};

const minLengthError = (bound: unknown): RTValidationError[] => [
  {path: ['name'], expected: 'string', format: {name: 'stringFormat', val: bound as never, formatPath: ['minLength']}},
];

describe('plural selection — Intl.PluralRules on the violated bound', () => {
  it('en: bound 1 → one, bound 2 → other (plain createFriendlyText uses en rules)', () => {
    const friendly = createFriendlyText<User>(source);
    expect(friendly.errors(minLengthError(1))[0].message).toBe('at least 1 character');
    expect(friendly.errors(minLengthError(2))[0].message).toBe('at least 2 characters');
  });

  it('non-finite bound selects `other` instead of calling select (no RangeError)', () => {
    const friendly = createFriendlyText<User>(source);
    expect(friendly.errors(minLengthError('not-a-number'))[0].message).toBe('at least not-a-number characters');
    expect(friendly.errors(minLengthError(undefined))[0].message).toBe('at least  characters');
  });

  it('pl: one/few/many arms select by CLDR rules', () => {
    const pl: FriendlyText<User> = {
      rt$label: '',
      rt$errors: {type: ''},
      name: {
        rt$label: 'Imię i nazwisko',
        rt$errors: {
          type: '',
          minLength: {
            one: 'co najmniej $[val] znak',
            few: 'co najmniej $[val] znaki',
            many: 'co najmniej $[val] znaków',
            other: 'co najmniej $[val] znaku',
          },
        },
      },
      age: {rt$label: '', rt$errors: {type: '', min: ''}},
    };
    const friendly = createFriendlyTextI18n<User>(source, {locale: 'pl', translations: {pl}});
    expect(friendly.errors(minLengthError(1))[0].message).toBe('co najmniej 1 znak');
    expect(friendly.errors(minLengthError(2))[0].message).toBe('co najmniej 2 znaki');
    expect(friendly.errors(minLengthError(5))[0].message).toBe('co najmniej 5 znaków');
  });

  it('ar: all six categories select', () => {
    const arms = {zero: 'z $[val]', one: 'o $[val]', two: 't $[val]', few: 'f $[val]', many: 'm $[val]', other: 'x $[val]'};
    const ar: FriendlyText<User> = {
      rt$label: '',
      rt$errors: {type: ''},
      name: {rt$label: '', rt$errors: {type: '', minLength: arms}},
      age: {rt$label: '', rt$errors: {type: '', min: ''}},
    };
    const friendly = createFriendlyTextI18n<User>(source, {locale: 'ar', translations: {ar}});
    expect(friendly.errors(minLengthError(0))[0].message).toBe('z 0');
    expect(friendly.errors(minLengthError(1))[0].message).toBe('o 1');
    expect(friendly.errors(minLengthError(2))[0].message).toBe('t 2');
    expect(friendly.errors(minLengthError(3))[0].message).toBe('f 3');
    expect(friendly.errors(minLengthError(11))[0].message).toBe('m 11');
    expect(friendly.errors(minLengthError(100.5))[0].message).toBe('x 100.5');
  });

  it('ja: other-only plural always selects other', () => {
    const ja: FriendlyText<User> = {
      rt$label: '',
      rt$errors: {type: ''},
      name: {rt$label: '', rt$errors: {type: '', minLength: {other: '$[val]文字以上'}}},
      age: {rt$label: '', rt$errors: {type: '', min: ''}},
    };
    const friendly = createFriendlyTextI18n<User>(source, {locale: 'ja', translations: {ja}});
    expect(friendly.errors(minLengthError(1))[0].message).toBe('1文字以上');
    expect(friendly.errors(minLengthError(7))[0].message).toBe('7文字以上');
  });

  it('a missing arm for the selected category falls to `other` inside the leaf', () => {
    // en select(1) = 'one', but only `other` is filled — the in-leaf backstop.
    const sparse: FriendlyText<User> = {
      ...source,
      name: {rt$label: 'Full name', rt$errors: {type: '', minLength: {other: 'need $[val]+ chars'}}},
    };
    expect(createFriendlyText<User>(sparse).errors(minLengthError(1))[0].message).toBe('need 1+ chars');
  });
});

describe('type-driven $[val] rendering', () => {
  const priceSource: FriendlyText<{price: TF.Currency<{max: 100}>}> = {
    rt$label: '',
    rt$errors: {type: ''},
    price: {rt$label: 'Price', rt$errors: {type: '', max: {other: 'must be at most $[val]'}}},
  };
  // A currency-marked bound: the emitter echoes the number format's
  // `isCurrency` param onto the error — that flag is the discriminator.
  const currencyMaxError: RTValidationError[] = [
    {path: ['price'], expected: 'number', format: {name: 'numberFormat', val: 100, formatPath: ['max'], isCurrency: true}},
  ];
  const plainNumberMaxError: RTValidationError[] = [
    {path: ['price'], expected: 'number', format: {name: 'numberFormat', val: 1000.5, formatPath: ['max']}},
  ];

  it('a currency bound renders with the app-supplied currency, per active locale', () => {
    const en = createFriendlyTextI18n(priceSource, {locale: 'en', translations: {}, currency: 'USD'});
    expect(en.errors(currencyMaxError)[0].message).toBe('must be at most $100.00');

    const de: FriendlyText<{price: TF.Currency<{max: 100}>}> = {
      rt$label: '',
      rt$errors: {type: ''},
      price: {rt$label: 'Preis', rt$errors: {type: '', max: {other: 'höchstens $[val]'}}},
    };
    const deRenderer = createFriendlyTextI18n(priceSource, {locale: 'de', translations: {de}, currency: 'EUR'});
    expect(deRenderer.errors(currencyMaxError)[0].message).toBe('höchstens 100,00 €');
  });

  it('no currency option → plain localized number, never a guessed symbol', () => {
    const en = createFriendlyTextI18n(priceSource, {locale: 'en', translations: {}});
    const message = en.errors(currencyMaxError)[0].message;
    expect(message).toBe('must be at most 100');
    expect(message).not.toContain('$100');
  });

  it('an invalid currency code degrades to a plain number — never throws', () => {
    const renderer = createFriendlyTextI18n(priceSource, {locale: 'en', translations: {}, currency: 'NOT-A-CODE'});
    expect(renderer.errors(currencyMaxError)[0].message).toBe('must be at most 100');
  });

  it('a {value} currency ref is re-read on every render', () => {
    const currency = {value: 'USD'};
    const renderer = createFriendlyTextI18n(priceSource, {locale: 'en', translations: {}, currency});
    expect(renderer.errors(currencyMaxError)[0].message).toBe('must be at most $100.00');
    currency.value = 'JPY';
    expect(renderer.errors(currencyMaxError)[0].message).toBe('must be at most ¥100');
  });

  it('a non-currency number bound stays String(val) — no grouping surprises', () => {
    const renderer = createFriendlyTextI18n(priceSource, {locale: 'en', translations: {}, currency: 'USD'});
    expect(renderer.errors(plainNumberMaxError)[0].message).toBe('must be at most 1000.5');
  });

  it('a date-family bound renders as a localized date; a relative bound stays verbatim', () => {
    const src: FriendlyText<{createdAt: TF.Date<{max: 'now'}>}> = {
      rt$label: '',
      rt$errors: {type: ''},
      createdAt: {rt$label: 'Created', rt$errors: {type: '', max: 'must be before $[val]'}},
    };
    const dateError = (bound: string): RTValidationError[] => [
      {path: ['createdAt'], expected: 'date', format: {name: 'nativeDate', val: bound, formatPath: ['max']}},
    ];
    const renderer = createFriendlyTextI18n(src, {locale: 'en', translations: {}});
    const formatted = renderer.errors(dateError('2026-06-15T12:00:00Z'))[0].message;
    expect(formatted).toContain('2026');
    expect(formatted).not.toContain('2026-06-15T12:00:00Z'); // rendered, not the raw ISO string
    // A relative `now±P…` bound is not a parseable instant — verbatim beats wrong.
    expect(renderer.errors(dateError('now-P1D'))[0].message).toBe('must be before now-P1D');
  });

  it('an unknown bare token stays verbatim; a literal colon in prose is untouched', () => {
    const src: FriendlyText<{price: TF.Currency<{max: 100}>}> = {
      rt$label: '',
      rt$errors: {type: ''},
      price: {rt$label: '', rt$errors: {type: '', max: 'ratio 3:1 and $[nonsense] with $[val]'}},
    };
    const renderer = createFriendlyText(src);
    expect(renderer.errors(currencyMaxError)[0].message).toBe('ratio 3:1 and $[nonsense] with 100');
  });

  it('a leftover colon-form token (removed syntax) stays verbatim', () => {
    const src: FriendlyText<{price: TF.Currency<{max: 100}>}> = {
      rt$label: '',
      rt$errors: {type: ''},
      price: {rt$label: '', rt$errors: {type: '', max: 'at most $[val:number:currency]'}},
    };
    expect(
      createFriendlyTextI18n(src, {locale: 'en', translations: {}, currency: 'USD'}).errors(currencyMaxError)[0].message
    ).toBe('at most $[val:number:currency]');
  });

  it('plain createFriendlyText stays byte-stable: a currency bound renders String(val)', () => {
    expect(createFriendlyText(priceSource).errors(currencyMaxError)[0].message).toBe('must be at most 100');
  });
});

describe('resolveLocale — naive BCP-47 truncation', () => {
  const maps = {pt: {} as FriendlyText<User>, 'zh-Hans': {} as FriendlyText<User>, es: {} as FriendlyText<User>};

  it('exact tag wins', () => {
    expect(resolveLocale('es', maps)).toBe('es');
  });

  it('region truncates: pt-BR → pt', () => {
    expect(resolveLocale('pt-BR', maps)).toBe('pt');
  });

  it('naive cross-script match: zh-Hant falls to zh-Hans (base language)', () => {
    expect(resolveLocale('zh-Hant', maps)).toBe('zh-Hans');
  });

  it('no shared base language → undefined (caller renders the source)', () => {
    expect(resolveLocale('fr', maps)).toBeUndefined();
    expect(resolveLocale('', maps)).toBeUndefined();
  });
});

describe('createFriendlyTextI18n — per-leaf fallback to the source', () => {
  const es: FriendlyText<User> = {
    rt$label: 'Cuenta de usuario',
    rt$errors: {type: ''},
    name: {
      rt$label: 'Nombre completo',
      // minLength arms still @todo-blank; type translated.
      rt$errors: {type: '$[label] debe ser texto', minLength: {one: '', other: ''}},
    },
    // age wholly untranslated (@todo blanks).
    age: {rt$label: '', rt$errors: {type: '', min: ''}},
  };

  it('renders translated leaves in the active locale', () => {
    const friendly = createFriendlyTextI18n<User>(source, {locale: 'es', translations: {es}});
    expect(friendly.label('')).toBe('Cuenta de usuario');
    expect(friendly.label('name')).toBe('Nombre completo');
    const out = friendly.errors([{path: ['name'], expected: 'string'}]);
    expect(out[0].message).toBe('Nombre completo debe ser texto');
  });

  it('a blank translated leaf falls through to the source leaf (label + template)', () => {
    const friendly = createFriendlyTextI18n<User>(source, {locale: 'es', translations: {es}});
    // age.rt$label is '' → source label; age.min is '' → source template.
    expect(friendly.label('age')).toBe('Age');
    const out = friendly.errors([
      {path: ['age'], expected: 'number', format: {name: 'numberFormat', val: 18, formatPath: ['min']}},
    ]);
    expect(out[0].label).toBe('Age');
    expect(out[0].message).toBe('Age must be at least 18');
  });

  it('a blank plural leaf falls through as a WHOLE unit (source arms, source-locale rules)', () => {
    const friendly = createFriendlyTextI18n<User>(source, {locale: 'es', translations: {es}});
    // es minLength arms are all blank → the whole leaf falls to the source
    // plural, selected with the SOURCE locale's rules (en): 1 → one.
    expect(friendly.errors(minLengthError(1))[0].message).toBe('at least 1 character');
    expect(friendly.errors(minLengthError(2))[0].message).toBe('at least 2 characters');
  });

  it('an unmatched locale renders the source map wholesale', () => {
    const friendly = createFriendlyTextI18n<User>(source, {locale: 'fr', translations: {es}});
    expect(friendly.label('name')).toBe('Full name');
    expect(friendly.errors(minLengthError(1))[0].message).toBe('at least 1 character');
  });

  it('a {value} locale ref switches per render (reactive seam)', () => {
    const localeRef = {value: 'en'};
    const friendly = createFriendlyTextI18n<User>(source, {locale: localeRef, translations: {es}});
    expect(friendly.label('name')).toBe('Full name');
    localeRef.value = 'es';
    expect(friendly.label('name')).toBe('Nombre completo');
    localeRef.value = 'es-MX'; // truncates to es
    expect(friendly.label('name')).toBe('Nombre completo');
  });

  it("a translation's rt$default mode wins over the source's per-constraint messages", () => {
    // The exclusive catch-all replaces the removed function form: the
    // translator opted their node into one message for everything.
    const esDefault: FriendlyText<User> = {
      ...es,
      name: {rt$label: 'Nombre', rt$errors: {rt$default: 'mensaje propio'}},
    };
    const friendly = createFriendlyTextI18n<User>(source, {locale: 'es', translations: {es: esDefault}});
    expect(friendly.errors(minLengthError(2))[0].message).toBe('mensaje propio');
  });

  it("a source node's rt$default backstops a translation node without rt$errors", () => {
    const defaultSource = {
      rt$label: 'Root',
      rt$errors: {type: ''},
      name: {rt$label: 'Name', rt$errors: {rt$default: 'from source default'}},
      age: {rt$label: 'Age', rt$errors: {type: '', min: ''}},
    } as unknown as FriendlyText<User>;
    const bare = {
      rt$label: '',
      rt$errors: {type: ''},
      name: {rt$label: 'Nombre'},
      age: {rt$label: '', rt$errors: {type: '', min: ''}},
    } as unknown as FriendlyText<User>;
    const friendly = createFriendlyTextI18n<User>(defaultSource, {locale: 'es', translations: {es: bare}});
    const out = friendly.errors(minLengthError(2));
    expect(out[0].message).toBe('from source default');
    expect(out[0].label).toBe('Nombre');
  });

  it('sourceLocale drives source-map plural rules when the source is not English', () => {
    // Polish-primary project: the SOURCE map carries Polish arms.
    const plSource: FriendlyText<User> = {
      rt$label: '',
      rt$errors: {type: ''},
      name: {
        rt$label: 'Imię',
        rt$errors: {type: '', minLength: {one: '$[val] znak', few: '$[val] znaki', many: '$[val] znaków', other: '$[val] znaku'}},
      },
      age: {rt$label: '', rt$errors: {type: '', min: ''}},
    };
    const friendly = createFriendlyTextI18n<User>(plSource, {locale: 'de', translations: {}, sourceLocale: 'pl'});
    expect(friendly.errors(minLengthError(2))[0].message).toBe('2 znaki');
    expect(friendly.errors(minLengthError(5))[0].message).toBe('5 znaków');
  });

  it('never throws on a partial translation (whole node missing)', () => {
    const sparse = {rt$label: '', rt$errors: {type: ''}} as unknown as FriendlyText<User>;
    const friendly = createFriendlyTextI18n<User>(source, {locale: 'es', translations: {es: sparse}});
    const out = friendly.errors(minLengthError(3));
    expect(out[0].message).toBe('at least 3 characters');
  });
});
