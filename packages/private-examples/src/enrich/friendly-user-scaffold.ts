import type {FriendlyText} from '@mionjs/run-types';
import type {User} from './user';

// @todo: generated skeleton — fill in real data, then delete this line
export const friendlyUser: FriendlyText<User> = {
  rt$label: '',
  rt$errors: {type: ''},

  name: {
    rt$label: '',
    rt$errors: {
      type: '',
      minLength: {one: '', other: ''},
      maxLength: {one: '', other: ''},
    },
  },
  age: {
    rt$label: '',
    rt$errors: {
      type: '',
      min: {one: '', other: ''},
      max: {one: '', other: ''},
    },
  },
  isActive: {rt$label: '', rt$errors: {type: ''}},

  tags: {
    rt$label: '',
    rt$errors: {type: ''},
    rt$items: {rt$label: '', rt$errors: {type: ''}},
  },

  profile: {
    // nested object: same node shape
    rt$label: '',
    rt$errors: {type: ''},
    email: {
      rt$label: '',
      rt$errors: {
        type: '',
        minLength: {one: '', other: ''},
        maxLength: {one: '', other: ''},
        pattern: '',
      },
    },
    score: {
      rt$label: '',
      rt$errors: {
        type: '',
        min: {one: '', other: ''},
        max: {one: '', other: ''},
      },
    },
  },
};
