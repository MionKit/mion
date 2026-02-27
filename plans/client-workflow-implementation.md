# Client Workflow Implementation Specification

## Overview

This document specifies the implementation of workflow functionality in the mion client package. Workflows allow calling multiple routes in a single HTTP request, with shared context between them on the server side.

## Server-Side Context

The router already supports workflows via:

- **Endpoint**: `/mion-routes-flow?/route1,/route2,/route3`
- **Query String**: CSV list of route paths to execute
- **Request Body**: Standard mion body with params for each route keyed by route ID
- **Response Body**: Standard mion body with results for each route keyed by route ID
- **Execution**: Routes execute in order, linkedFns are deduplicated, execution stops on first error

## Client API Design

### Usage Example

```ts
import {initClient} from '@mionkit/client';
import {workflow} from '@mionkit/client';
import type {RemoteApi} from './api';

const {client, routes, linkedFns} = initClient<RemoteApi>({baseURL: 'http://localhost:3000'});

// Basic workflow call
const [results, errors, linkedFnResults, linkedFnErrors] = await workflow([
  routes.users.getUser({id: '1'}),
  routes.posts.getPosts({userId: '1'}),
  routes.audit.logAccess({userId: '1'}),
]);

// Destructure results by position
const [user, posts, auditLog] = results ?? [];
const [userError, postsError, auditError] = errors ?? [];

// Workflow with explicit linkedFns
const [results, errors, linkedFnResults, linkedFnErrors] = await workflow(
  [routes.users.getUser({id: '1'}), routes.posts.getPosts({userId: '1'})],
  {
    auth: linkedFns.auth.validateToken({token: 'abc'}),
    rateLimit: linkedFns.rateLimit.check({userId: '1'}),
  }
);
```

## Type Definitions

### WorkflowResult Type

```ts
/**
 * Result type for workflow() function - 4-tuple pattern matching array input.
 *
 * @typeParam Routes - Tuple type of RSubRequest instances passed to workflow
 * @typeParam LinkedFns - Record of linkedFn names to HSubRequest instances
 */
export type WorkflowResult<
  Routes extends RSubRequest<any>[],
  LinkedFns extends Record<string, HSubRequest<any>> = Record<string, HSubRequest<any>>,
> = [
  (
    // Array of route results matching input order - undefined if route failed
    WorkflowRouteResults<Routes> | undefined
  ),
  (
    // Array of route errors matching input order - undefined if route succeeded
    WorkflowRouteErrors<Routes> | undefined
  ),
  (
    // LinkedFn results keyed by name
    {[K in keyof LinkedFns]?: LinkedFnSuccess<LinkedFns[K]>} | undefined
  ),
  (
    // LinkedFn errors keyed by name
    {[K in keyof LinkedFns]?: LinkedFnError<LinkedFns[K]>} | undefined
  ),
];

/** Extract success types from route subrequests as tuple */
type WorkflowRouteResults<Routes extends RSubRequest<any>[]> = {
  [K in keyof Routes]: Routes[K] extends RSubRequest<infer PH> ? HandlerSuccessResponse<PH> | undefined : never;
};

/** Extract error types from route subrequests as tuple */
type WorkflowRouteErrors<Routes extends RSubRequest<any>[]> = {
  [K in keyof Routes]: Routes[K] extends RSubRequest<infer PH> ? HandlerErrors<PH> | undefined : never;
};
```

## Implementation Components

### 1. New File: `workflow.ts`

This file will contain the main `workflow` function and related utilities.

```ts
/**
 * Creates and executes a workflow request with multiple routes.
 *
 * @param routeSubRequests Array of route subrequests to execute in order
 * @param linkedFns Optional record of linkedFn subrequests to include
 * @returns Promise resolving to WorkflowResult 4-tuple
 */
export async function workflow<
  Routes extends RSubRequest<any>[],
  LinkedFns extends Record<string, HSubRequest<any>> = Record<string, never>,
>(routeSubRequests: [...Routes], linkedFns?: LinkedFns): Promise<WorkflowResult<Routes, LinkedFns>>;
```

**Implementation Details:**

1. Extract `MionClient` from first subrequest's `client` property
2. Build workflow path: `/mion-routes-flow?/route1,/route2,...`
3. Collect all linkedFns from:
   - Explicitly passed `linkedFns` parameter
   - Prefilled linkedFns from cache for each route
4. Deduplicate linkedFns by ID (last write wins)
5. Call `client.executeCallWithWorkflow()` with the workflow subrequest and linkedFns
6. Return the 4-tuple result

### 2. New Method: `MionSubRequest.callWithWorkflow()`

Add a method to `MionSubRequest` that allows calling a single route as part of a workflow:

```ts
/**
 * Calls this route as part of a workflow with other routes.
 * This is an alternative to the standalone workflow() function.
 *
 * @param otherRoutes Additional routes to include in the workflow
 * @param linkedFns Optional linkedFns to include
 */
callWithWorkflow<
  OtherRoutes extends RSubRequest<any>[],
  H extends Record<string, HSubRequest<any>>
>(
  otherRoutes: OtherRoutes,
  linkedFns?: H
): Promise<WorkflowResult<[this, ...OtherRoutes], H>>
```

### 3. New Method: `MionClient.executeCallWithWorkflow()`

Add a method to `MionClient` that orchestrates workflow execution:

```ts
/**
 * Executes a workflow call with multiple routes and optional linkedFns.
 * Similar to executeCallWithLinkedFns but for workflows.
 *
 * @param workflowSubRequests Array of route subrequests for the workflow
 * @param linkedFnsRecord Record of linkedFn names to subrequests
 * @param linkedFnSubRequests Array of linkedFn subrequests
 */
executeCallWithWorkflow<
  Routes extends RSubRequest<any>[],
  H extends Record<string, HSubRequest<any>>
>(
  workflowSubRequests: Routes,
  linkedFnsRecord: H,
  linkedFnSubRequests: HSubRequest<any>[]
): Promise<WorkflowResult<Routes, H>>
```

**Implementation Details:**

1. Create a synthetic workflow route subrequest pointing to `/mion-routes-flow`
2. Build the URL query string from route IDs
3. Create `MionClientRequest` with:
   - `route`: The synthetic workflow subrequest
   - `linkedFns`: All collected linkedFns
   - `workflowSubRequests`: The array of actual route subrequests
4. Execute the request
5. Map response body to result arrays matching input order

### 4. Modifications to `MionClientRequest`

The `MionClientRequest` class needs to support workflow requests:

```ts
export class MionClientRequest<RR extends RSubRequest<any>, LinkedFnRequestsList extends HSubRequest<any>[]> {
  // Existing properties...

  /** Array of workflow subrequests when executing a workflow */
  readonly workflowSubRequests?: RSubRequest<any>[];

  constructor(
    public readonly options: ClientOptions,
    private readonly prefilledLinkedFnsCache: PrefilledLinkedFnsCache,
    public readonly route?: RR,
    public readonly linkedFns?: LinkedFnRequestsList,
    public readonly workflowSubRequests?: RSubRequest<any>[] // NEW
  ) {
    // ... existing logic

    // Add workflow subrequests to subRequestList
    if (workflowSubRequests) {
      workflowSubRequests.forEach((sr) => this.addSubRequest(sr));
    }
  }
}
```

**Path Building for Workflows:**

- When `workflowSubRequests` is provided, the path should be:
  ```
  /mion-routes-flow?/route1,/route2,/route3
  ```
- The query string is built from the route IDs of workflow subrequests

### 5. Constants

Add to `constants.ts`:

```ts
export const WORKFLOW_KEY = 'mion-routes-flow';
export const WORKFLOW_PATH = `/${WORKFLOW_KEY}`;
```

## Request/Response Flow

### Request Building

1. **URL**: `{baseURL}/mion-routes-flow?/users-getUser,/posts-getPosts,/audit-logAccess`
2. **Method**: PUT (default)
3. **Body**:
   ```json
   {
     "users-getUser": [{"id": "1"}],
     "posts-getPosts": [{"userId": "1"}],
     "audit-logAccess": [{"userId": "1"}],
     "auth-validateToken": [{"token": "abc"}]
   }
   ```

### Response Processing

1. **Response Body**:

   ```json
   {
     "users-getUser": {"id": "1", "name": "John"},
     "posts-getPosts": [{"id": "1", "title": "Hello"}],
     "audit-logAccess": {"logged": true},
     "auth-validateToken": {"valid": true}
   }
   ```

2. **Result Mapping**:
   - Map route results to array by input order
   - Map route errors to array by input order
   - Map linkedFn results/errors by name

## Error Handling

### Workflow-Level Errors

- Missing routes in workflow query
- Invalid route paths
- Network errors

These are handled as platform errors and applied to all subrequests.

### Route-Level Errors

- Validation errors
- Route execution errors
- Serialization errors

Each route can have its own error. The server stops execution on first error, so subsequent routes will have `undefined` results.

### LinkedFn Errors

- Same as current implementation
- Errors are keyed by linkedFn name in the result tuple

## Deduplication Strategy

LinkedFns are deduplicated by ID:

1. Collect all linkedFns from explicit parameter
2. For each route, restore prefilled linkedFns from cache
3. Add to a Map keyed by ID (last write wins)
4. Convert Map values to array for request

This matches the server-side behavior where linkedFns are deduplicated in the merged execution chain.

## Architecture Diagram

```mermaid
flowchart TD
    subgraph Client
        WF[workflow function]
        MSR[MionSubRequest]
        MC[MionClient]
        MCR[MionClientRequest]
    end

    subgraph Server
        WFR[/mion-routes-flow]
        R1[Route 1]
        R2[Route 2]
        R3[Route 3]
        LF[LinkedFns]
    end

    WF -->|creates| MSR
    WF -->|calls| MC
    MC -->|executeCallWithWorkflow| MCR
    MCR -->|HTTP PUT| WFR
    WFR -->|executes| R1
    R1 -->|then| R2
    R2 -->|then| R3
    WFR -->|runs| LF
    WFR -->|response| MCR
    MCR -->|maps results| MC
    MC -->|returns| WF
```

## File Changes Summary

| File               | Change Type | Description                                                           |
| ------------------ | ----------- | --------------------------------------------------------------------- |
| `types.ts`         | Add         | `WorkflowResult`, `WorkflowRouteResults`, `WorkflowRouteErrors` types |
| `workflow.ts`      | New         | `workflow()` function and utilities                                   |
| `subRequest.ts`    | Modify      | Add `callWithWorkflow()` method                                       |
| `client.ts`        | Modify      | Add `executeCallWithWorkflow()` method                                |
| `request.ts`       | Modify      | Add `workflowSubRequests` support                                     |
| `constants.ts`     | Add         | `WORKFLOW_KEY`, `WORKFLOW_PATH` constants                             |
| `index.ts`         | Modify      | Export `workflow` function                                            |
| `workflow.spec.ts` | New         | Unit tests for workflow functionality                                 |

## Open Questions / Considerations

1. **Type Safety**: The tuple types for workflow results require careful handling to preserve type information across the array. TypeScript's tuple inference should work with the spread operator `[...Routes]`.

2. **Prefilled LinkedFns**: When restoring prefilled linkedFns for workflows, we need to restore them for ALL routes in the workflow, not just the first one.

3. **Binary Serialization**: The workflow request body follows the same format as regular requests, so binary serialization should work without changes.

4. **Metadata Fetching**: Need to fetch metadata for all routes in the workflow before making the request.

## Testing Strategy

1. **Unit Tests**:
   - `workflow()` function with single route
   - `workflow()` function with multiple routes
   - `workflow()` with explicit linkedFns
   - `workflow()` with prefilled linkedFns
   - Error handling for route errors
   - Error handling for linkedFn errors
   - Type inference tests

2. **Integration Tests**:
   - End-to-end workflow execution
   - Workflow with mixed success/failure routes
   - Workflow with shared linkedFns
