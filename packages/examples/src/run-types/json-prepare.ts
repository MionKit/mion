import {createPrepareForJsonFn} from '@mionkit/run-types';

interface Event {
    name: string;
    timestamp: Date;
    metadata: Map<string, any>;
}

const prepareEvent = await createPrepareForJsonFn<Event>();

const event = {
    name: 'Click',
    timestamp: new Date('2025-01-15'),
    metadata: new Map([['source', 'web']]),
};

const jsonReady = prepareEvent(event);
// { name: 'Click', timestamp: '2025-01-15T00:00:00.000Z', metadata: [['source', 'web']] }
JSON.stringify(jsonReady); // Now works correctly!
