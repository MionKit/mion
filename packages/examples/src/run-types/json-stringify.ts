import {createJsonStringifyFn} from '@mionkit/run-types';

interface Event {
    name: string;
    timestamp: Date;
    metadata: Map<string, any>;
}

async function example() {
    const event = {
        name: 'Click',
        timestamp: new Date('2025-01-15'),
        metadata: new Map([['source', 'web']]),
    };

    const stringifyEvent = await createJsonStringifyFn<Event>();
    const jsonString = stringifyEvent(event);
    // Equivalent to: JSON.stringify(prepareForJson(event)) but faster
}

