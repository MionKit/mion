import {createJsonDecoder} from '@ts-runtypes/core';

interface Event {
    name: string;
    timestamp: Date;
    metadata: Map<string, any>;
}

// createJsonDecoder returns a JSON-string -> value decoder. It parses and revives
// every member back to its declared type (ISO string -> Date, entries -> Map).
const decodeEvent = createJsonDecoder<Event>();

const jsonString = '{"name":"Click","timestamp":"2025-01-15T00:00:00.000Z","metadata":[["source","web"]]}';
const event = decodeEvent(jsonString);
// event.timestamp is now a Date object
// event.metadata is now a Map
