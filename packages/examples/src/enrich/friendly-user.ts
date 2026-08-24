import type {FriendlyText} from '@ts-runtypes/core';
import type {User} from './user';

export const friendlyUser: FriendlyText<User> = {
  rt$label: 'User account',
  rt$errors: {type: '$[label] must be an object'},

  name: {
    rt$label: 'Full name',
    rt$errors: {
      type: '$[label] must be text',
      minLength: '$[label] needs at least $[val] characters',
      maxLength: '$[label] allows at most $[val] characters',
    },
  },
  age: {
    rt$label: 'Age',
    rt$errors: {
      type: '$[label] must be a number',
      min: '$[label] must be at least $[val]',
      max: '$[label] must be no more than $[val]',
    },
  },
  isActive: {rt$label: 'Active?', rt$errors: {type: ''}},

  tags: {
    rt$label: 'Tags',
    rt$errors: {type: ''},
    rt$items: {rt$label: '', rt$errors: {type: 'each tag must be text'}}, // element node
  },

  profile: {
    // nested object: same node shape, recursively
    rt$label: 'Profile',
    rt$errors: {type: ''},
    email: {rt$label: 'Email', rt$errors: {type: '', minLength: '', maxLength: '', pattern: 'Enter a valid email address'}},
    score: {rt$label: 'Score', rt$errors: {type: '', min: 'min $[val]', max: 'max $[val]'}},
  },
};
