import type {FriendlyText} from '@ts-runtypes/core';
import type {User} from './user';

// src/__runtypes/enriched/i18n/pl/models/user.ts — scaffolded by `enrich --i18n pl`:
// the same tree as the source map, every leaf blank, plural arms in POLISH form.
export const pl_friendlyUser: FriendlyText<User> = {
  rt$label: '', // @todo
  rt$errors: {type: ''}, // @todo
  name: {
    rt$label: '', // @todo
    rt$errors: {
      type: '', // @todo
      minLength: {one: '', few: '', many: '', other: ''}, // @todo
      maxLength: {one: '', few: '', many: '', other: ''}, // @todo
    },
  },
  age: {
    rt$label: '', // @todo
    rt$errors: {type: '', min: {one: '', few: '', many: '', other: ''}, max: {one: '', few: '', many: '', other: ''}}, // @todo
  },
  isActive: {rt$label: '', rt$errors: {type: ''}}, // @todo
  tags: {rt$label: '', rt$errors: {type: ''}, rt$items: {rt$label: '', rt$errors: {type: ''}}}, // @todo
  profile: {
    rt$label: '', // @todo
    rt$errors: {type: ''}, // @todo
    email: {
      rt$label: '',
      rt$errors: {
        type: '',
        minLength: {one: '', few: '', many: '', other: ''},
        maxLength: {one: '', few: '', many: '', other: ''},
        pattern: '',
      },
    }, // @todo
    score: {
      rt$label: '',
      rt$errors: {type: '', min: {one: '', few: '', many: '', other: ''}, max: {one: '', few: '', many: '', other: ''}},
    }, // @todo
  },
};
