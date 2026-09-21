import {createMionRouter} from '@mionjs/router';

const mion = createMionRouter();

interface User {
  id: number;
  name: string;
}

declare function loadRow(id: number): Promise<unknown>;

export const routes = {
  // the row comes from the database untyped, so check it before it goes on the wire
  getUser: mion.route(
    async (ctx, id: number): Promise<User> => (await loadRow(id)) as User,
    {validateReturn: true}
  ),

  // the default: the answer is trusted and never walked
  getName: mion.route((ctx, id: number): string => `user-${id}`),
};
