import {createStringifyJsonFn} from '@mionkit/run-types';

interface Event {
    name: string;
    timestamp: Date;
    metadata: Map<string, any>;
}

const event = {
    name: 'Click',
    timestamp: new Date('2025-01-15'),
    metadata: new Map([['source', 'web']]),
};

const stringifyEvent = await createStringifyJsonFn<Event>();
const jsonString = stringifyEvent(event);
// Equivalent to: JSON.stringify(prepareForJson(event)) but faster
