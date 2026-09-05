import {createMionRouter, Routes} from '@mionjs/router';
import type {Pet, User} from './full-example.app.ts';
import {myApp} from './full-example.app.ts';

interface ContextData {
  myUser: User | null;
  // ... other context data properties
}
const initContextData = (): ContextData => ({myUser: null});

// the factory's return type becomes ctx.shared in every route and middleFn
const mion = createMionRouter({contextDataFactory: initContextData});

const routes = {
  getMyPet: mion.route(async (ctx): Promise<Pet> => {
    const user = ctx.shared.myUser; // typed as User | null
    const pet = await myApp.db.getPetFromUser(user);
    return pet;
  }),
} satisfies Routes;

export const myApi = await mion.initRoutes(routes);
