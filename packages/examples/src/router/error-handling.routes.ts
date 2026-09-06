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
      // a returned error is part of the signature, so the client gets it
      // strongly typed. The rest of the execution chain still runs
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
// a gate: a FatalError is returned, so it is typed like any declared error,
// AND it ends the request: nothing after this middleFn runs, the route included
export const auth = mion.headersFn(
  (
    ctx,
    h: HeadersSubset<'Authorization'>
  ): void | RpcError<'not-authorized'> => {
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
    // a thrown error ends the request but is NOT part of the signature:
    // the client gets only the publicMessage, untyped, in its undeclared slot.
    // The full error (message, stack) stays on ctx.request.thrownErrors
    // and ctx.response.fatalError, so a logger can still read it
    throw new RpcError({
      publicMessage: `Cant update the pet.`,
      message: (dbError as Error).message,
      originalError: dbError as Error,
      type: 'db-error',
    });
  }
}) satisfies Route;

export const alwaysError = mion.route((): void => {
  throw new Error('will generate a 500 error with an "Unknown Error" message');
}) satisfies Route;
// end:throw-error
