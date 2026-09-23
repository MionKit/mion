import type {FriendlyText} from '@mionjs/run-types';
import type {User} from './user';

// @todo: generated skeleton — fill in real data, then delete this line
export const pl_friendlyUser: FriendlyText<User> = {
  rt$label: '',
  rt$errors: {type: ''},
  name: {
    rt$label: '',
    rt$errors: {
      type: '',
      minLength: {one: '', few: '', many: '', other: ''},
      maxLength: {one: '', few: '', many: '', other: ''},
    },
  },
  age: {
    rt$label: '',
    rt$errors: {
      type: '',
      min: {one: '', few: '', many: '', other: ''},
      max: {one: '', few: '', many: '', other: ''},
    },
  },
  isActive: {rt$label: '', rt$errors: {type: ''}},
  tags: {
    rt$label: '',
    rt$errors: {type: ''},
    rt$items: {rt$label: '', rt$errors: {type: ''}},
  },
  profile: {
    rt$label: '',
    rt$errors: {type: ''},
    email: {
      rt$label: '',
      rt$errors: {
        type: '',
        minLength: {one: '', few: '', many: '', other: ''},
        maxLength: {one: '', few: '', many: '', other: ''},
        pattern: '',
      },
    },
    score: {
      rt$label: '',
      rt$errors: {
        type: '',
        min: {one: '', few: '', many: '', other: ''},
        max: {one: '', few: '', many: '', other: ''},
      },
    },
  },
};
