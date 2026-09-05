import type {CallContext} from '@mionjs/router';

export interface User {
  id: number;
  name: string;
  surname: string;
}

export type NewUser = Omit<User, 'id'>;

export const memoryStoreService = {
  usersStore: new Map<number, User>(),
  createUser: (user: NewUser): User => {
    const id = memoryStoreService.usersStore.size + 1;
    const newUser: User = {id, ...user};
    memoryStoreService.usersStore.set(id, newUser);
    return newUser;
  },
  getUser: (id: number): User | undefined =>
    memoryStoreService.usersStore.get(id),
  updateUser: (user: User): User | null => {
    if (!memoryStoreService.usersStore.has(user.id)) return null;
    memoryStoreService.usersStore.set(user.id, user);
    return user;
  },
  deleteUser: (id: number): User | null => {
    const user = memoryStoreService.usersStore.get(id);
    if (!user) return null;
    memoryStoreService.usersStore.delete(id);
    return user;
  },
};

// user is authorized if token === 'ABCD'
export const myAuthService = {
  isAuthorized: (token: string): boolean => token === 'ABCD',
  getIdentity: (token: string): User | null =>
    token === 'ABCD'
      ? ({id: 0, name: 'admin', surname: 'admin'} as User)
      : null,
};
export interface Pet {
  id: string;
  name: string;
  ownerId: number;
}

export interface SomeData {
  id: string;
  value: string;
}

// stand-in for your own database layer
export const myDbService = {
  getPet: async (id: string): Promise<Pet | null> =>
    id === 'PET-404' ? null : {id, name: 'Rex', ownerId: 1},
  getPetFromUser: async (user: User | null): Promise<Pet> => ({
    id: 'PET-1',
    name: 'Rex',
    ownerId: user?.id ?? 0,
  }),
  getData: async (id: string): Promise<SomeData | null> =>
    id === 'DATA-404' ? null : {id, value: 'some value'},
};

// stand-in for your own log shipping service
export const myCloudLogsService = {
  log: (...args: unknown[]): void => console.log(...args),
  error: async (...args: unknown[]): Promise<void> => console.error(...args),
};

export const myApp = {
  store: memoryStoreService,
  auth: myAuthService,
  db: myDbService,
  cloudLogs: myCloudLogsService,
};
export const shared = {
  me: null as any as User,
};
export const getSharedData = (): typeof shared => shared;

export type ContextData = ReturnType<typeof getSharedData>;
export type Context = CallContext<ContextData>;
