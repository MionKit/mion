// Family 12 — Standard Schema v1. Mirrors guide/standard-schema.ts. The
// `~standard.validate` contract: good input → {value}, bad input → {issues}.
import {createStandardSchema, runTypeErrorsToIssues, createGetValidationErrorsFn} from '@ts-runtypes/core';
import {type CheckResult, ok} from './check';

interface User {
  id: number;
  name: string;
  roles: ('admin' | 'user')[];
}

export const userSchema = createStandardSchema<User>();
export const userErrors = createGetValidationErrorsFn<User>();

// Our validators are synchronous, so the validate() result is never a Promise;
// this structural view narrows away that branch for the assertions.
type SyncResult = {readonly value?: unknown; readonly issues?: ReadonlyArray<{readonly message: string}>};

export function checkStandardSchema(): CheckResult[] {
  const good = userSchema['~standard'].validate({id: 1, name: 'Ada', roles: ['admin']}) as SyncResult;
  const bad = userSchema['~standard'].validate({id: '1', name: 'Ada', roles: ['admin']}) as SyncResult;
  // runTypeErrorsToIssues maps our validation errors into Standard-Schema issues.
  const issues = runTypeErrorsToIssues(userErrors({id: '1', name: 5, roles: ['admin']}));

  return [
    ok('standard-schema: exposes a ~standard property', typeof userSchema['~standard'] === 'object'),
    ok('standard-schema: valid input returns {value}', good.issues === undefined && 'value' in good),
    ok('standard-schema: invalid input returns {issues}', Array.isArray(bad.issues) && bad.issues.length > 0),
    ok('standard-schema: an issue carries a message', Array.isArray(bad.issues) && bad.issues.every((issue) => typeof issue.message === 'string')),
    ok('standard-schema: runTypeErrorsToIssues maps errors to issues', issues.length > 0),
  ];
}
