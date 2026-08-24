import type {MockData} from '@ts-runtypes/core';
import type {User} from './user';

// scaffolded by `gen`: one entry per field, each blank marked @todo
export const mockUser: MockData<User> = {
  name: {pool: []}, // @todo believable names
  age: {pool: []}, // @todo realistic range (or min/max bounds)
  isActive: {pool: []}, // @todo
  tags: {rt$items: {pool: []}, rt$length: [0, 0]}, // @todo
  profile: {
    email: {pool: []}, // @todo real-looking addresses
    score: {pool: []}, // @todo realistic range (or min/max bounds)
  },
};
