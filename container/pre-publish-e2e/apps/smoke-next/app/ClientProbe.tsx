'use client';
// Next rejects this file if the injected imports land above "use client". Static marker; actions.ts has the value shape.
import {getRunTypeId} from '@mionjs/run-types';
import type {StaleProbe} from '../typeDep';

export function ClientProbe() {
  return <div id="rt-use-client">{getRunTypeId<StaleProbe>()}</div>;
}
