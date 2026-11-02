'use server';
// A module-level "use server" must stay first too: same guard as ClientProbe.tsx, value marker shape.
import {getRunTypeId} from '@mionjs/run-types';

const sample = {id: 1, label: 'probe'};

export async function serverProbeId(): Promise<string> {
  return getRunTypeId(sample);
}
