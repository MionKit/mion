import {batch, initClient} from '@mionjs/client';
import type {EdgeApi} from './routes.ts';

// In the Worker's program, so its build compiles this batch into the batch table it serves.
export async function runEdgeBatch(baseURL: string) {
    const {routes} = initClient<EdgeApi>({baseURL});
    const [[sum, sumError], [greeting, greetingError]] = await batch([routes.utils.sum(5, 2), routes.sayHello('Edge')]).call();
    return {sum, greeting, errors: [sumError, greetingError]};
}
