import {PublicApi, Routes, initMionRouter, route} from '@mionjs/router';
import {Int32, UInt8, UInt16, Float} from '@ts-runtypes/core/formats';

/** Sensor reading with optimized numeric types for binary serialization */
export type SensorReading = {
    sensorId: UInt16; // 0-65535, uses 2 bytes in binary
    timestamp: Int32; // Unix timestamp, uses 4 bytes
    temperature: Float; // Temperature reading
    humidity: UInt8; // 0-255%, uses 1 byte
    pressure: Float; // Atmospheric pressure
};

/** Batch of sensor readings for efficient transfer */
export type SensorBatch = {
    batchId: UInt16;
    readings: SensorReading[];
};

/** Statistics result with numeric data */
export type SensorStats = {
    avgTemperature: Float;
    avgHumidity: UInt8;
    avgPressure: Float;
    readingCount: UInt16;
};

// Define routes with binary serialization
const routes = {
    /** Submit a single sensor reading */
    submitReading: route((_ctx, reading: SensorReading): {success: boolean; id: UInt16} => ({
        success: true,
        id: reading.sensorId,
    })),

    /** Submit a batch of sensor readings for efficient transfer */
    submitBatch: route((_ctx, batch: SensorBatch): {processed: UInt16} => ({
        processed: batch.readings.length as UInt16,
    })),

    /** Get statistics from sensor readings */
    getStats: route(
        (_ctx, sensorId: UInt16): SensorStats => ({
            avgTemperature: 22.5 as Float,
            avgHumidity: 65 as UInt8,
            avgPressure: 1013.25 as Float,
            readingCount: 100 as UInt16,
        })
    ),
} satisfies Routes;

// Initialize router with binary serialization globally
initMionRouter(routes, {serializer: 'binary'});
// Export API type for client usage
export type BinaryApi = PublicApi<typeof routes>;
