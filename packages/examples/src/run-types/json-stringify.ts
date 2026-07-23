import {createJsonEncoder} from '@ts-runtypes/core';

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

// createJsonEncoder returns a value -> JSON-string encoder. It walks the type and makes every
// member JSON-safe (Date -> ISO string, Map -> entries) before stringifying, so plain
// JSON.stringify (which drops Maps and can't revive Dates) is not needed.
const encodeEvent = createJsonEncoder<Event>();
const jsonString = encodeEvent(event);
// '{"name":"Click","timestamp":"2025-01-15T00:00:00.000Z","metadata":[["source","web"]]}'
