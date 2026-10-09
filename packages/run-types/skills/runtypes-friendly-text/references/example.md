# FriendlyText end-to-end example

Type definition → filled friendly mirror → consumer.

```ts
// src/models/user.ts: the DEFINITION
import type * as TF from '@mionjs/run-types/formats';

export interface User {
  name: TF.String<{minLength: 2; maxLength: 60}>;
  age: TF.Number<{min: 0; max: 120}>;
  isActive: boolean;
  tags: string[];
  profile: {
    email: TF.Email;
    score: TF.Number<{min: 0; max: 100}>;
  };
}
```

```ts
// src/.mion/enriched/friendly/src/models/user.ts: the committed friendly mirror
import type {User} from '../../../../../models/user';
import type {FriendlyText} from '@mionjs/run-types';

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
    // nested object: recurse
    rt$label: 'Profile',
    rt$errors: {type: ''},
    email: {
      rt$label: 'Email',
      rt$errors: {type: '', minLength: '', maxLength: '', pattern: 'Enter a valid email address'},
    },
    score: {rt$label: 'Score', rt$errors: {rt$default: 'Score must be between 0 and 100'}}, // rt$default mode
  },
};
```

```ts
// src/services/userForm.ts: the CONSUMER
import {createGetValidationErrorsFn, createFriendlyText} from '@mionjs/run-types';
import {friendlyUser} from '../.mion/enriched/friendly/src/models/user';
import type {User} from '../models/user';

const getUserErrors = createGetValidationErrorsFn<User>();
const friendly = createFriendlyText<User>(friendlyUser);

const messages = friendly.errors(getUserErrors({name: 'A', age: 200, profile: {email: 'nope', score: 5}}));
// name     → 'Full name needs at least 2 characters'
// age      → 'Age must be no more than 120'
// profile.email → 'Enter a valid email address'
```
