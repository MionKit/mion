import {initClient} from '@mionkit/client';
import type {BinaryApi, SensorReading, SensorBatch} from './binary-server-example.ts';
import type {NumUInt16, NumUInt8, NumFloat, NumInt32} from '@mionkit/type-formats/FormatsNumber';

// Initialize client with the server URL
const {routes} = initClient<BinaryApi>({baseURL: 'http://localhost:3000'});

// Create a sensor reading with optimized numeric types
const reading: SensorReading = {
    sensorId: 1 as NumUInt16,
    timestamp: Math.floor(Date.now() / 1000) as NumInt32,
    temperature: 23.5 as NumFloat,
    humidity: 65 as NumUInt8,
    pressure: 1013.25 as NumFloat,
};

// Submit a single reading
const [result, error] = await routes.submitReading(reading).call();
console.log(result, error);
// Logs { success: true, id: 1 }

// Submit a batch of readings for efficient transfer
const batch: SensorBatch = {
    batchId: 1 as NumUInt16,
    readings: [reading, {...reading, sensorId: 2 as NumUInt16}],
};
const [batchResult] = await routes.submitBatch(batch).call();
console.log(batchResult);
// Logs { processed: 2 }

// Get statistics for a sensor
const [stats] = await routes.getStats(1 as NumUInt16).call();
console.log(stats);
// Logs { avgTemperature: 22.5, avgHumidity: 65, avgPressure: 1013.25, readingCount: 100 }
