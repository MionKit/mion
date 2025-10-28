# Header/Cookie Handling Enhancement Spec

### Overview

Replace headersHook with typed parameter sources and constructor-based return values for headers/cookies, providing both declarative and imperative APIs.

### Current State

```ts
// Current approach
auth: headersHook(['authorization'], (ctx, token: string): void => {
  // Limited to header-only params, no rich return values
});
```

### Target State

```ts
// New approach - flexible parameter sources and rich returns
auth: hook(
  (ctx, token: HttpHeader<'authorization'>, data: BodyParam<User>): string | HttpHeader<'x-token'> | Cookie<'session'> => {
    if (token.value === 'admin') {
      return new HttpHeader('x-token', 'validated', {maxAge: 3600});
    }
    return new Cookie('session', 'user-123', {httpOnly: true});
  }
);
```

### Implementation Tasks

1. Create Type Classes
   File: packages/router/src/types/http-params.ts

```ts
export class HttpHeader<Name extends string, Value = string> {
  constructor(
    public name: Name,
    public value: Value,
    public options?: HeaderOptions
  ) {}
}

export class Cookie<Name extends string> {
  constructor(
    public name: Name,
    public value: string,
    public options?: CookieOptions
  ) {}
}

export class BodyParam<T> {
  constructor(public value: T) {}
}
```

2. Update Parameter Resolution
   File: packages/router/src/dispatch.ts

- Modify parameter extraction to detect HttpHeader<T>, Cookie<T>, BodyParam<T>
- Extract values from appropriate request sources
- Maintain existing body parameter behavior as default

3. Update Return Value Processing
   File: packages/router/src/dispatch.ts

- Detect HttpHeader and Cookie instances in return values
- Apply headers/cookies to response context
- Handle union returns with mixed types

4. Enhance Response Context
   File: packages/router/src/types/context.ts

```ts
export interface MionResponse {
  // Add rich header/cookie methods
  setHeader(name: string, value: string, options?: HeaderOptions): void;
  setCookie(name: string, value: string, options?: CookieOptions): void;
}
```

5. Deprecate headersHook
   File: packages/router/src/handlers.ts

- Mark headersHook as deprecated
- Provide migration guide in JSDoc
- Keep for backward compatibility

6.  Enhance Router Reflection System (This is the most complex task and should be split into multiple subtasks)

Some initial work has been done for this step in the reflection.ts file, but it needs to be completed and tested.

- Extracts generic type arguments from HttpHeader<Name> and Cookie<Name>
- Preserves parameter metadata for dispatch logic
- Maintains backward compatibility with existing headerNames
- Uses Deepkit's reflection system to inspect type arguments at runtime
  The key insight is accessing paramRT.src.typeArguments to get the generic type parameters from the Deepkit type system.

### development instructions

- plan carefully and create a list of tasks to before start coding
- if you found any problem when installing remove package-lock file and run `npm i` again but do not commit changes to package-lock.json
- only work in the router package
- use `npx jest some-file` to run jest tests for a specific file
- all test are passing and should be passing after changes are made
- no need to build anything, we should check functionality by writing tests and running them
- no need to update website/docs
- commit often
- create a PR once you have a working implementation and passing tests