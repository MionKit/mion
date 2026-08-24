import type {FriendlyText} from '@ts-runtypes/core';
import type {User} from './user';

// scaffolded by `gen`: every field in place, each blank marked @todo
export const friendlyUser: FriendlyText<User> = {
  rt$label: '', // @todo
  rt$errors: {type: ''}, // @todo

  name: {
    rt$label: '', // @todo
    rt$errors: {
      type: '', // @todo
      minLength: {one: '', other: ''}, // @todo (plural forms, see the i18n page)
      maxLength: {one: '', other: ''}, // @todo
    },
  },
  age: {
    rt$label: '', // @todo
    rt$errors: {
      type: '', // @todo
      min: {one: '', other: ''}, // @todo
      max: {one: '', other: ''}, // @todo
    },
  },
  isActive: {rt$label: '', rt$errors: {type: ''}}, // @todo

  tags: {
    rt$label: '', // @todo
    rt$errors: {type: ''}, // @todo
    rt$items: {rt$label: '', rt$errors: {type: ''}}, // @todo element node
  },

  profile: {
    // nested object: same node shape
    rt$label: '', // @todo
    rt$errors: {type: ''}, // @todo
    email: {rt$label: '', rt$errors: {type: '', minLength: {one: '', other: ''}, maxLength: {one: '', other: ''}, pattern: ''}}, // @todo
    score: {rt$label: '', rt$errors: {type: '', min: {one: '', other: ''}, max: {one: '', other: ''}}}, // @todo
  },
};
