import {RpcError, FatalError, HeadersSubset} from '@mionjs/core';
import {createMionRouter, Route} from '@mionjs/router';
import type {Pet} from './full-example.app.ts';
import {myApp} from './full-example.app.ts';

const mion = createMionRouter();

// start:return-error
export const getPet = mion.route(
  async (ctx, id: string): Promise<Pet | RpcError<'pet-not-found'>> => {
    const pet = await myApp.db.getPet(id);
    if (!pet) {
      return new RpcError({
        publicMessage: `Pet with id ${id} can't be found`,
        type: 'pet-not-found',
      });
    }
    return pet;
  }
) satisfies Route;
// end:return-error

// start:fatal-error
// ends the request: the route behind this middleware never runs
export const auth = mion.headersFn(
  (
    ctx,
    h: HeadersSubset<'Authorization'>
  ): void | FatalError<'not-authorized'> => {
    if (!myApp.auth.isAuthorized(h.headers.Authorization))
      return new FatalError({
        publicMessage: 'Not Authorized',
        type: 'not-authorized',
      });
  }
);
// end:fatal-error

// start:throw-error
export const updatePet = mion.route(async (ctx, pet: Pet): Promise<Pet> => {
  try {
    return await myApp.db.updatePet(pet);
  } catch (dbError) {
    // a logger still reads the full error on ctx.request.thrownErrors and ctx.response.fatalError
    throw new RpcError({
      publicMessage: `Cant update the pet.`,
      message: (dbError as Error).message,
      originalError: dbError as Error,
      type: 'db-error',
    });
  }
}) satisfies Route;

export const alwaysError = mion.route((): void => {
  throw new Error('the client gets a 422 unknown-error, never this message');
}) satisfies Route;
// end:throw-error
