/* eslint-disable */
// This file demonstrates the ESLint rules for @mionjs/router
// The rules are disabled for this file so you can see both valid and invalid examples
import {HeadersSubset, RpcError, FatalError, TypedError} from '@mionjs/core';
import {
  createMionRouter,
  Handler,
  HeaderHandler,
  CallContext,
} from '@mionjs/router';

const mion = createMionRouter();

// ========================================
// ✅ VALID EXAMPLES (these should NOT trigger ESLint errors)
// ========================================

// start:strong-typed-valid-inline
// 1. Direct inline handlers with proper types
mion.route((ctx, name: string): string => `hello ${name}`);
mion.middleFn((ctx, data: number): void => {
  console.log(data);
});
mion.headersFn((c: CallContext, {headers}: HeadersSubset<'auth'>): void => {
  // do something
});
// end:strong-typed-valid-inline

// start:strong-typed-valid-function-refs
// 2. Function references with proper types
function validHandler(ctx, name: string): string {
  return `hello ${name}`;
}
const validArrowHandler = (ctx, name: string): string => `hello ${name}`;
mion.route(validHandler);
mion.route(validArrowHandler);
// end:strong-typed-valid-function-refs

// start:strong-typed-valid-type-annotations
// 3. Type annotations
const typedHandler: Handler = (ctx, name: string): string => `hello ${name}`;
const typedHeaderHandler: HeaderHandler = (
  c: CallContext,
  {headers}: HeadersSubset<'auth'>
): void => {
  const token = headers.auth;
  console.log(token);
};
// end:strong-typed-valid-type-annotations

// start:strong-typed-valid-satisfies
// 4. Satisfies expressions
const satisfiesHandler = ((ctx, name: string): string =>
  `hello ${name}`) satisfies Handler;
const satisfiesHeaderHandler = ((
  c: CallContext,
  {headers}: HeadersSubset<'auth'>
): void => {
  const token = headers.auth;
  console.log(token);
}) satisfies HeaderHandler;
// end:strong-typed-valid-satisfies

// start:strong-typed-valid-jsdoc
// 5. JSDoc tags
/**
 * @mion:route
 */
function routeWithJSDoc(ctx, name: string): string {
  return `hello ${name}`;
}

/**
 * @mion:middleFn
 */
const middleFnWithJSDoc = (ctx, data: number): void => {
  console.log(data);
};

/**
 * @mion:headersFn
 */
function headersFnWithJSDoc(
  c: CallContext,
  {headers}: HeadersSubset<'auth'>
): void {
  const token = headers.auth;
  console.log(token);
}
// end:strong-typed-valid-jsdoc

// ========================================
// ❌ INVALID EXAMPLES (these SHOULD trigger ESLint errors when rule is enabled)
// ========================================

// ========================================
// Rule: @mionjs/strong-typed-routes
// ========================================

// start:strong-typed-invalid-inline
// 1. Direct inline handlers missing types
mion.route((ctx, name) => `hello ${name}`); // Missing both param type and return type
mion.middleFn((ctx, data: number) => {
  console.log(data);
}); // Missing return type
mion.headersFn((c: CallContext, [token]): void => {
  // do something
}); // Missing param type
// end:strong-typed-invalid-inline

// start:strong-typed-invalid-function-refs
// 2. Function references missing types
function invalidHandler(ctx, name) {
  return `hello ${name}`;
}
const invalidArrowHandler = (ctx, name) => `hello ${name}`;
mion.route(invalidHandler); // Should error: missing both types
mion.route(invalidArrowHandler); // Should error: missing both types
// end:strong-typed-invalid-function-refs

// start:strong-typed-invalid-type-annotations
// 3. Type annotations missing types
const invalidTypedHandler: Handler = (ctx, name) => `hello ${name}`; // Missing both types
const invalidTypedHeaderHandler: HeaderHandler = (
  c: CallContext,
  {headers}: HeadersSubset<'auth'>
) => {
  const token = headers.auth;
  console.log(token);
}; // Missing return type
// end:strong-typed-invalid-type-annotations

// start:strong-typed-invalid-satisfies
// 4. Satisfies expressions missing types
const invalidSatisfiesHandler = ((ctx, name) =>
  `hello ${name}`) satisfies Handler; // Missing both types
const invalidSatisfiesHeaderHandler = ((c: CallContext, {headers}): void => {
  const token = headers.auth;
  console.log(token);
}) satisfies HeaderHandler; // Missing param type
// end:strong-typed-invalid-satisfies

// start:strong-typed-invalid-jsdoc
// 5. JSDoc tags missing types
/**
 * @mion:route
 */
function invalidRouteJSDoc(ctx, name) {
  return `hello ${name}`;
} // Missing both types

/**
 * @mion:middleFn
 */
const invalidMiddleFnJSDoc = (ctx, data: number) => {
  console.log(data);
}; // Missing return type

/**
 * @mion:headersFn
 */
function invalidHeadersFnJSDoc(c: CallContext, {headers}): void {
  const token = headers.auth;
  console.log(token);
} // Missing param type
// end:strong-typed-invalid-jsdoc

// ========================================
// Rule: @mionjs/no-throw-in-handlers
// ========================================

// start:no-throw-valid
// 1. Return the error, so it stays in the signature and the client gets it typed
mion.route((ctx, id: string): string | RpcError<'not-found'> => {
  if (!id)
    return new RpcError({type: 'not-found', publicMessage: 'No id given'});
  return `hello ${id}`;
});

// 2. A gate returns a FatalError, which ends the request
mion.headersFn(
  (
    ctx,
    {headers}: HeadersSubset<'auth'>
  ): void | FatalError<'not-authorized'> => {
    if (!headers.auth)
      return new FatalError({
        type: 'not-authorized',
        publicMessage: 'Not Authorized',
      });
  }
);

// 3. A throw caught inside the handler never reaches the router
mion.route((ctx, id: string): string | RpcError<'db-error'> => {
  try {
    if (!id) throw new Error('empty id');
    return `hello ${id}`;
  } catch {
    return new RpcError({type: 'db-error', publicMessage: 'Lookup failed'});
  }
});
// end:no-throw-valid

// start:no-throw-invalid
// 1. Throwing drops the error from the signature, so the client cannot handle it typed
mion.route((ctx, id: string): string => {
  throw new RpcError({type: 'not-found', publicMessage: 'No id given'});
});

// 2. A throw inside a callback in the handler body still reaches the router
mion.route((ctx, ids: string[]): string[] =>
  ids.map((id) => {
    throw new Error('bad id');
  })
);

// 3. Rethrowing from the catch clause escapes the handler too
mion.route((ctx, id: string): string => {
  try {
    return `hello ${id}`;
  } catch (err) {
    throw err;
  }
});
// end:no-throw-invalid

// ========================================
// Rule: @mionjs/returned-error-type
// ========================================

// start:returned-error-valid
// 1. An RpcError lands in its own typed slot and the chain keeps running
mion.route((ctx, id: string): string | RpcError<'not-found'> => {
  if (!id)
    return new RpcError({type: 'not-found', publicMessage: 'No id given'});
  return `hello ${id}`;
});

// 2. A FatalError is an RpcError subclass, so it is typed too, and it ends the request
mion.middleFn((ctx, id: string): void | FatalError<'not-authorized'> => {
  if (!id)
    return new FatalError({
      type: 'not-authorized',
      publicMessage: 'Not Authorized',
    });
});

// 3. Your own subclass of RpcError keeps the brand, so it is fine as well
class PetNotFound extends RpcError<'pet-not-found'> {}
mion.route((ctx, id: string): string | PetNotFound => `hello ${id}`);
// end:returned-error-valid

// start:returned-error-invalid
// 1. A plain Error carries no mion brand, so it never reaches the typed slot
mion.route((ctx, id: string): string | Error => new Error('no id'));

// 2. Your own class extending Error has the same problem
class NotFoundError extends Error {}
mion.route((ctx, id: string): string | NotFoundError => new NotFoundError());

// 3. A TypedError is branded but has no public message and no status code,
//    so the client has nothing to show
mion.route(
  (ctx, id: string): string | TypedError<'not-found'> =>
    new TypedError({type: 'not-found'})
);
// end:returned-error-invalid

export {}; // Make this a module
