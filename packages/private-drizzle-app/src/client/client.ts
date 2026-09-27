import {initClient} from '@mionjs/client';
import {useMethodsMetadata} from '@mionjs/client/middlewares';
import type {AppApi} from '../server/app.ts';

// A front end: it knows the server only through the AppApi type.

export function createAppClient(baseURL: string) {
  const {routes, middlewares} = initClient<AppApi>({baseURL, validateServerResponses: true});
  useMethodsMetadata(middlewares.mionMethodsMetadata);
  const {pg, sqlite, mysql} = routes;
  return {
    listUsers: () => pg.listUsers().call(),
    userNames: () => pg.userNames().call(),
    postsWithAuthor: () => pg.postsWithAuthor().call(),
    usersAndPosts: () => pg.usersAndPosts().call(),
    roleStats: () => pg.roleStats().call(),
    createUser: (user: Parameters<typeof pg.createUser>[0]) => pg.createUser(user).call(),
    renameUser: (id: string, name: string) => pg.renameUser(id, name).call(),
    usersWithPosts: () => pg.usersWithPosts().call(),
    adults: () => pg.adults().call(),
    busyAuthors: () => pg.busyAuthors().call(),
    authorCards: () => pg.authorCards().call(),
    listNotes: () => sqlite.listNotes().call(),
    createNote: (note: Parameters<typeof sqlite.createNote>[0]) => sqlite.createNote(note).call(),
    bumpRatings: (fromId: number, toId: number) => sqlite.bumpRatings(fromId, toId).call(),
    listDevices: () => mysql.listDevices().call(),
    addDevice: (device: Parameters<typeof mysql.addDevice>[0]) => mysql.addDevice(device).call(),
  };
}

export type AppClient = ReturnType<typeof createAppClient>;
