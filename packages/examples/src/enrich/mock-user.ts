import type {MockData} from '@ts-runtypes/core';
import type {User} from './user';

export const mockUser: MockData<User> = {
  name: {pool: ['Alice Martin', 'Liang Wei', 'Fatima Noor' /* …50+ */]},
  age: {pool: [], min: 18, max: 95}, // empty pool: draw from the range instead
  isActive: {pool: [true, true, false]},
  tags: {rt$items: {pool: ['urgent', 'beta', 'vip']}, rt$length: [1, 4]},
  profile: {
    email: {pool: ['alice@example.com', 'liang@corp.io' /* … */]},
    score: {pool: [], min: 0, max: 100},
  },
};
