import {createRestoreFromJsonFn} from '@mionkit/run-types';

interface Event {
    name: string;
    timestamp: Date;
    metadata: Map<string, any>;
}

async function example() {
    const restoreEvent = await createRestoreFromJsonFn<Event>();

    const jsonString = '{"name":"Click","timestamp":"2025-01-15T00:00:00.000Z","metadata":[["source","web"]]}';
    const parsed = JSON.parse(jsonString);
    const event = restoreEvent(parsed);
    // event.timestamp is now a Date object
    // event.metadata is now a Map
}

