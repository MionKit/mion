import {PublicApi, Routes, initMionRouter, route} from '@mionkit/router';
import {NumInt32, NumUInt8, NumUInt16, NumFloat} from '@mionkit/type-formats/FormatsNumber';

/** Sensor reading with optimized numeric types for binary serialization */
export type SensorReading = {
    sensorId: NumUInt16; // 0-65535, uses 2 bytes in binary
    timestamp: NumInt32; // Unix timestamp, uses 4 bytes
    temperature: NumFloat; // Temperature reading
    humidity: NumUInt8; // 0-255%, uses 1 byte
    pressure: NumFloat; // Atmospheric pressure
};

/** Batch of sensor readings for efficient transfer */
export type SensorBatch = {
    batchId: NumUInt16;
    readings: SensorReading[];
};

/** Statistics result with numeric data */
export type SensorStats = {
    avgTemperature: NumFloat;
    avgHumidity: NumUInt8;
    avgPressure: NumFloat;
    readingCount: NumUInt16;
};

// Define routes with binary serialization
const routes = {
    /** Submit a single sensor reading */
    submitReading: route((_ctx, reading: SensorReading): {success: boolean; id: NumUInt16} => ({
        success: true,
        id: reading.sensorId,
    })),

    /** Submit a batch of sensor readings for efficient transfer */
    submitBatch: route((_ctx, batch: SensorBatch): {processed: NumUInt16} => ({
        processed: batch.readings.length as NumUInt16,
    })),

    /** Get statistics from sensor readings */
    getStats: route(
        (_ctx, sensorId: NumUInt16): SensorStats => ({
            avgTemperature: 22.5 as NumFloat,
            avgHumidity: 65 as NumUInt8,
            avgPressure: 1013.25 as NumFloat,
            readingCount: 100 as NumUInt16,
        })
    ),
} satisfies Routes;

// Initialize router with binary serialization globally
initMionRouter(routes, {serializer: 'binary'});
// Export API type for client usage
export type BinaryApi = PublicApi<typeof routes>;
