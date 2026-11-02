'use client';
// Next rejects a "use client" that is not the first statement, so this file builds only while the rewrite
// keeps its injected imports below the directive. Static marker shape; actions.ts carries the value shape.
import {getRunTypeId} from '@mionjs/run-types';
import type {StaleProbe} from '../typeDep';

export function ClientProbe() {
  return <div id="rt-use-client">{getRunTypeId<StaleProbe>()}</div>;
}
