# MockData end-to-end example

Type definition → filled mock mirror → consumer.

```ts
// src/models/user.ts: the DEFINITION
import type * as TF from '@mionjs/run-types/formats';

export interface User {
  name: string;
  age: TF.Number<{min: 0; max: 120}>;
  tags: string[];
  profile: {
    email: TF.Email;
    score: TF.Number<{min: 0; max: 100}>;
  };
}
```

```ts
// src/.mion/enriched/mock/src/models/user.ts: the committed mock mirror
import type {User} from '../../../../../models/user';
import type {MockData} from '@mionjs/run-types';

export const mockUser: MockData<User> = {
  name: {pool: ['Alice Martin', 'Liang Wei', 'Fatima Noor', 'Diego Ramirez']},
  age: {pool: [], min: 18, max: 95}, // empty pool: draw from the range
  tags: {
    rt$items: {pool: ['urgent', 'beta', 'vip']}, // element node
    rt$length: [1, 4], // 1 to 4 tags
  },
  profile: {
    email: {pool: ['alice@example.com', 'liang@corp.io', 'fatima@mail.net']},
    score: {pool: [], min: 0, max: 100},
  },
};
```

```ts
// src/test/fixtures.ts: the CONSUMER
import {createMockDataFn} from '@mionjs/run-types/mocking';
import {mockUser} from '../.mion/enriched/mock/src/models/user';
import type {User} from '../models/user';

const makeUser = createMockDataFn<User>(undefined, {data: mockUser});

const fixture = makeUser();
// e.g. { name: 'Liang Wei', age: 41, tags: ['beta','vip'],
//        profile: { email: 'alice@example.com', score: 72 } }
```

- Every value above satisfies `User`.
- Once enrich-mock-invalid-pool is wired into `enrich --no-emit`: a stray `age: 200` or `email: 'nope'`
  in the map fails the build, never the test.
